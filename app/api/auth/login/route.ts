import { sameOrigin } from '@/lib/request-origin';
import { signInWithPassword } from '@/lib/local-auth';

export const runtime = 'nodejs';


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
