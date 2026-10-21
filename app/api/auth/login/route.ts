import { signInWithPassword } from '@/lib/local-auth';

export const runtime = 'nodejs';

function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;

  const requestOrigin = new URL(req.url).origin;
  if (origin === requestOrigin) return true;

  if (process.env.NODE_ENV !== 'production') {
    try {
      const a = new URL(origin);
      const b = new URL(requestOrigin);
      const local = (host: string) => host === 'localhost' || host === '127.0.0.1';
      return local(a.hostname) &&
        local(b.hostname) &&
        a.protocol === b.protocol &&
        a.port === b.port;
    } catch {
      return false;
    }
  }

  return false;
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
    const body = await req.json() as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password || '';
    if (!email || !password || password.length < 6) return Response.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
    await signInWithPassword(email, password);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return Response.json({ error: message.startsWith('AUTH:') ? message.slice(5) : 'Não foi possível entrar.' }, { status: 401 });
  }
}
