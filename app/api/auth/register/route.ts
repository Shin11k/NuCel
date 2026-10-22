import { sameOrigin } from '@/lib/request-origin';
import { registerWithInvitation } from '@/lib/local-auth';

export const runtime = 'nodejs';


export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
    const body = await req.json() as { email?: string; password?: string; name?: string; invite?: string };
    const email = body.email?.trim().toLowerCase() || '';
    const name = body.name?.trim() || '';
    const password = body.password || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'E-mail inválido.' }, { status: 400 });
    if (password.length < 8) return Response.json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, { status: 400 });
    if (!name || name.length > 100) return Response.json({ error: 'Informe seu nome.' }, { status: 400 });

    const invite = typeof body.invite === 'string' ? body.invite.trim() : '';
    if (!invite) return Response.json({ error: 'Informe o codigo de convite entregue pelo administrador.' }, { status: 400 });

    await registerWithInvitation(email, name, password, invite);
    return Response.json({ ok: true, needsConfirmation: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return Response.json({ error: message.startsWith('AUTH:') ? message.slice(5) : 'Não foi possível criar a conta.' }, { status: 400 });
  }
}
