import { sql } from '@/lib/local-db';
import type { Bridge } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, message: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const bridgeName = typeof body.bridgeName === 'string' ? body.bridgeName.trim() : '';
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
    const signature = typeof body.signature === 'string' ? body.signature.trim().toLowerCase() : '';
    const timestamp = typeof body.timestamp === 'number' ? body.timestamp : Number(body.timestamp);

    if (!bridgeName || !rawUrl || !signature || !Number.isFinite(timestamp)) {
      return json({ error: 'Dados incompletos.' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      return json({ error: 'Assinatura expirada.' }, 401);
    }

    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !url.hostname.endsWith('.trycloudflare.com')
    ) {
      return json({ error: 'URL de tunnel inválida.' }, 400);
    }

    const bridges = await sql<Bridge>(
      'SELECT id,name,url,secret FROM nucel_bridges WHERE name=$1 LIMIT 1',
      [bridgeName],
    );

    const bridge = bridges[0];
    if (!bridge?.secret) return json({ error: 'Conexão não encontrada.' }, 404);

    const message = `${timestamp}\n${bridgeName}\n${url.origin}`;
    const expected = await hmac(bridge.secret, message);
    if (!safeEqual(expected, signature)) {
      return json({ error: 'Assinatura inválida.' }, 401);
    }

    await sql('UPDATE nucel_bridges SET url=$1 WHERE id=$2', [url.origin, bridge.id]);

    return json({ ok: true, url: url.origin });
  } catch (error) {
    console.error('NuCel bridge sync:', error);
    return json({ error: 'Não foi possível sincronizar a conexão.' }, 400);
  }
}
