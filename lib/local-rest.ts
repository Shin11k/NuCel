import 'server-only';
import type { QueryResultRow } from 'pg';
import { sql, transaction } from './local-db';

// Adaptador temporario para as chamadas PostgREST ja existentes no NuCel.
// Todas as tabelas/colunas sao restritas por allowlist; valores usam parametros SQL.
const fields: Record<string, string[]> = {
  nucel_members: ['id','email','name','role','auth_user_id','password_hash','invite_hash','created_at'],
  nucel_bridges: ['id','name','url','secret','created_at'],
  nucel_devices: ['id','name','serial','model','bridge_id','created_at'],
  nucel_grants: ['member_id','device_id','created_at'],
};
const writeable: Record<string, string[]> = {
  nucel_members: ['id','email','name','role','auth_user_id','invite_hash'],
  nucel_bridges: ['id','name','url','secret'],
  nucel_devices: ['id','name','serial','model','bridge_id'],
  nucel_grants: ['member_id','device_id'],
};

export function query(table: string, params: Record<string,string>) {
  return table + '?' + new URLSearchParams(params).toString();
}

function where(table: string, params: URLSearchParams, offset = 0) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of params.entries()) {
    if (['select','limit','order'].includes(key)) continue;
    if (!fields[table]?.includes(key) || !val.startsWith('eq.')) throw new Error('INVALID_DB_FILTER');
    values.push(val.slice(3));
    conditions.push(key + '=$' + (offset + values.length));
  }
  return { clause: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '', values };
}

export async function adminRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const [table, search = ''] = path.split('?', 2);
  const params = new URLSearchParams(search);
  const method = (init.method || 'GET').toUpperCase();

  if (table === 'rpc/nucel_set_grants' && method === 'POST') {
    const payload = JSON.parse(String(init.body || '{}')) as {p_member_id?:string;p_device_ids?:string[]};
    if (!payload.p_member_id || !Array.isArray(payload.p_device_ids) || payload.p_device_ids.length > 500) {
      throw new Error('INVALID_GRANTS');
    }
    const ids = [...new Set(payload.p_device_ids)];
    await transaction(async client => {
      const member = await client.query('SELECT role FROM nucel_members WHERE id=$1 FOR UPDATE', [payload.p_member_id]);
      if (member.rows[0]?.role !== 'collaborator') throw new Error('INVALID_MEMBER');
      await client.query('DELETE FROM nucel_grants WHERE member_id=$1', [payload.p_member_id]);
      await client.query('INSERT INTO nucel_grants(member_id,device_id) SELECT $1, unnest($2::uuid[])', [payload.p_member_id, ids]);
    });
    return null as T;
  }

  if (!fields[table]) throw new Error('INVALID_DB_TABLE');
  const allowed = fields[table];

  if (method === 'GET') {
    const selected = params.get('select') || '*';
    const columns = selected === '*' ? '*' : selected.split(',');
    if (columns !== '*' && (columns as string[]).some(c=>!allowed.includes(c))) throw new Error('INVALID_DB_COLUMN');
    const filter = where(table, params);
    const order = params.get('order');
    let extra = '';
    if (order) {
      if (order !== 'name.asc' || !allowed.includes('name')) throw new Error('INVALID_DB_ORDER');
      extra += ' ORDER BY name ASC';
    }
    const lim = params.get('limit');
    if (lim !== null) {
      const limit = Number(lim);
      if (!Number.isInteger(limit) || limit<1 || limit>5000) throw new Error('INVALID_DB_LIMIT');
      extra += ' LIMIT ' + limit;
    }
    return await sql<QueryResultRow>(
      'SELECT ' + (Array.isArray(columns) ? columns.join(',') : columns) + ' FROM ' + table + filter.clause + extra,
      filter.values,
    ) as T;
  }

  const payload = method === 'POST' || method === 'PATCH'
    ? JSON.parse(String(init.body || '{}')) as Record<string,unknown>
    : null;

  if (method === 'POST') {
    if (!payload || !Object.keys(payload).length) throw new Error('EMPTY_DB_INSERT');
    const keys = Object.keys(payload);
    if (keys.some(k => !writeable[table].includes(k))) throw new Error('INVALID_DB_COLUMN');
    const values = keys.map(k=>payload[k]);
    const result = await sql('INSERT INTO ' + table + '(' + keys.join(',') + ') VALUES (' +
      keys.map((_,i)=>'$'+(i+1)).join(',') + ') RETURNING *', values);
    return result as T;
  }

  const filter = where(table, params);
  if (!filter.clause) throw new Error('UNFILTERED_DB_WRITE');

  if (method === 'PATCH') {
    if (!payload || !Object.keys(payload).length) throw new Error('EMPTY_DB_PATCH');
    const keys = Object.keys(payload);
    if (keys.some(k => !writeable[table].includes(k))) throw new Error('INVALID_DB_COLUMN');
    const values = keys.map(k=>payload[k]);
    return await sql(
      'UPDATE '+table+' SET '+keys.map((k,i)=>k+'=$'+(i+1)).join(',')+
      where(table,params,keys.length).clause+' RETURNING *',
      [...values,...filter.values],
    ) as T;
  }

  if (method === 'DELETE') {
    return await sql('DELETE FROM '+table+filter.clause+' RETURNING *', filter.values) as T;
  }

  throw new Error('INVALID_DB_METHOD');
}
