import { getAuthenticatedUser, type LocalMember } from './local-auth';
import { sql } from './local-db';

export type Member = LocalMember & { auth_user_id?: string | null };
export type Bridge = { id: string; name: string; url: string; secret: string };
export type Device = { id: string; name: string; serial: string; model: string; bridge_id: string };
export type Grant = { member_id: string; device_id: string };

export async function identity(): Promise<Member> {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export async function selectAll<T extends import('pg').QueryResultRow>(table: string, order?: string): Promise<T[]> {
  const valid: Record<string, string> = {
    nucel_devices: 'SELECT id,name,serial,model,bridge_id FROM nucel_devices',
    nucel_bridges: 'SELECT id,name,url,secret FROM nucel_bridges',
    nucel_grants: 'SELECT member_id,device_id FROM nucel_grants',
  };
  const statement = valid[table];
  if (!statement) throw new Error('TABLE_NOT_ALLOWED');
  if (order && order !== 'name.asc') throw new Error('ORDER_NOT_ALLOWED');
  return sql<T>(statement + (order ? ' ORDER BY name ASC' : ''));
}

const enc = new TextEncoder();
function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function sign(secret: string, data: object) {
  const payload = b64(enc.encode(JSON.stringify(data)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return payload + '.' + b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))));
}
