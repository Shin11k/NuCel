import { sameOrigin } from '@/lib/request-origin';
import { identity, sign, selectAll, type Bridge, type Device, type Grant, type Member } from '@/lib/server';
import { adminRest, query } from '@/lib/local-rest';
import { makeInvite } from '@/lib/local-auth';
import { sql } from '@/lib/local-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function result(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}


function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'UNAUTHENTICATED') return result({ error: 'Entre na sua conta NuCel para continuar.', code: 'UNAUTHENTICATED' }, 401);
  if (message === 'FORBIDDEN') return result({ error: 'Seu acesso ainda não foi liberado pelo administrador.', code: 'FORBIDDEN' }, 403);
  if (message.startsWith('CONFIG:')) return result({ error: 'O NuCel ainda não foi conectado ao ambiente de produção.', code: 'CONFIG' }, 503);
  console.error('NuCel API:', message);
  return result({ error: message.startsWith('VALID:') ? message.slice(6) : 'Não foi possível salvar. Confira os dados e tente novamente.' }, 400);
}

export async function GET(req: Request) {
  try {
    const me = await identity();
    const admin = me.role === 'admin';
    const [allDevices, allBridges, allGrants] = await Promise.all([
      selectAll<Device>('nucel_devices', 'name.asc'),
      selectAll<Bridge>('nucel_bridges', 'name.asc'),
      selectAll<Grant>('nucel_grants'),
    ]);

    const allowedIds = admin
      ? new Set(allDevices.map((device) => device.id))
      : new Set(allGrants.filter((grant) => grant.member_id === me.id).map((grant) => grant.device_id));
    const devices = allDevices.filter((device) => allowedIds.has(device.id));
    const bridges = allBridges.filter((bridge) => admin || devices.some((device) => device.bridge_id === bridge.id));
    const origin = new URL(req.url).origin;

    const connections = await Promise.all(bridges.map(async (bridge) => ({
      id: bridge.id,
      name: bridge.name,
      url: bridge.url,
      token: await sign(bridge.secret, {
        exp: Math.floor(Date.now() / 1000) + 60,
        sub: me.id,
        origin,
        serials: devices.filter((device) => device.bridge_id === bridge.id).map((device) => device.serial),
      }),
    })));

    const members = admin
      ? (await adminRest<Member[]>(query('nucel_members', { select: 'id,email,name,role', order: 'name.asc' })))
      : [];
    const grants = admin ? allGrants : [];

    return result({ me, devices, connections, members, grants });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return result({ error: 'Origem inválida.' }, 403);
    const me = await identity();
    if (me.role !== 'admin') throw new Error('FORBIDDEN');
    const body = await req.json() as Record<string, unknown>;
    const str = (key: string, max = 100) => {
      const value = body[key];
      if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('VALID:Preencha todos os campos corretamente.');
      return value.trim();
    };

    if (body.action === 'inviteMember') {
      const memberId = str('id');
      const invite = makeInvite();
      const updated = await sql<{ id: string }>(
        `UPDATE nucel_members SET invite_hash=$1 WHERE id=$2 AND role='collaborator'
         AND password_hash IS NULL RETURNING id`,
        [invite.hash, memberId],
      );
      if (!updated[0]) throw new Error('VALID:A colaboradora nao existe ou ja tem senha cadastrada.');
      return result({ ok: true, invite: invite.token });
    }

    if (body.action === 'bridge') {
      const url = new URL(str('url', 500));
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error('VALID:Use o endereço HTTPS do conector, sem caminhos.');
      }
      const secret = crypto.randomUUID() + crypto.randomUUID();
      const id = crypto.randomUUID();
      await adminRest('nucel_bridges', {
        method: 'POST',
        body: JSON.stringify({ id, name: str('name'), url: url.origin, secret }),
      });
      return result({ id, secret });
    }

    if (body.action === 'updateBridgeUrl') {
      const url = new URL(str('url', 500));
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error('VALID:Use um endereço HTTPS válido do conector.');
      }
      const bridgeName = typeof body.bridgeName === 'string' && body.bridgeName.trim()
        ? body.bridgeName.trim()
        : 'PC Principal';
      const bridges = await adminRest<Bridge[]>(query('nucel_bridges', {
        select: 'id,name,url,secret',
        name: `eq.${bridgeName}`,
        limit: '1',
      }));
      if (!bridges[0]) throw new Error('VALID:Conexão do computador não encontrada.');
      await adminRest(query('nucel_bridges', { id: `eq.${bridges[0].id}` }), {
        method: 'PATCH',
        body: JSON.stringify({ url: url.origin }),
      });
      return result({ ok: true, url: url.origin });
    }

    if (body.action === 'device') {
      const serial = str('serial');
      if (!/^[\w.:-]+$/.test(serial)) throw new Error('VALID:Número de série inválido.');
      await adminRest('nucel_devices', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          name: str('name'),
          serial,
          model: str('model'),
          bridge_id: str('bridgeId'),
        }),
      });
    } else if (body.action === 'member') {
      const email = str('email', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('VALID:E-mail inválido.');
      const invite = makeInvite();
      await adminRest('nucel_members', {
        method: 'POST',
        body: JSON.stringify({ id: crypto.randomUUID(), email, name: str('name'), role: 'collaborator', invite_hash: invite.hash }),
      });
      return result({ ok: true, invite: invite.token, email });
    } else if (body.action === 'grants') {
      const id = str('memberId');
      const members = await adminRest<Member[]>(query('nucel_members', { select: 'id,role', id: `eq.${id}`, limit: '1' }));
      if (!members[0] || members[0].role !== 'collaborator') throw new Error('VALID:Colaborador inválido.');
      if (!Array.isArray(body.deviceIds) || body.deviceIds.length > 500 || body.deviceIds.some((value) => typeof value !== 'string')) {
        throw new Error('VALID:Seleção inválida.');
      }
      await adminRest('rpc/nucel_set_grants', {
        method: 'POST',
        body: JSON.stringify({ p_member_id: id, p_device_ids: [...new Set(body.deviceIds as string[])] }),
      });
    } else if (body.action === 'removeMember') {
      const id = str('id');
      if (id === me.id) throw new Error('VALID:Você não pode remover sua própria conta.');
      await adminRest(query('nucel_members', { id: `eq.${id}`, role: 'eq.collaborator' }), { method: 'DELETE' });
    } else if (body.action === 'removeDevice') {
      await adminRest(query('nucel_devices', { id: `eq.${str('id')}` }), { method: 'DELETE' });
    } else {
      throw new Error('VALID:Ação inválida.');
    }

    return result({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
