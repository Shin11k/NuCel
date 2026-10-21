import { signOut } from '@/lib/local-auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  await signOut();
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
