// TESTE: Worker Cloudflare nucel-vpc-teste (com Cloudflare Access por hostname).
// Requer VPC_SERVICE (painel HTTP 3001) e ENGINE_SERVICE (scrcpy HTTP 8000).
// Nunca adicione uma binding de PostgreSQL ou exponha o ENGINE sem Cloudflare Access.
const TEST_HOST = 'nucel-vpc-teste.nuvixgestao.workers.dev';
const PANEL = 'http://127.0.0.1:3001';
const ENGINE = 'http://127.0.0.1:8000';

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.hostname !== TEST_HOST || incoming.protocol !== 'https:') {
      return new Response('Host invalido.', { status: 403 });
    }

    // Mesma origem para requisicoes de escrita e WebSocket, antes do rewrite.
    const origin = request.headers.get('origin');
    if (origin && origin !== incoming.origin) {
      return new Response('Origem invalida.', { status: 403 });
    }
    if (!origin && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return new Response('Origin obrigatorio.', { status: 403 });
    }

    const ws = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
    const enginePath = incoming.pathname === '/engine' ||
      incoming.pathname.startsWith('/engine/') ||
      incoming.pathname.startsWith('/ws-scrcpy') ||
      ws;
    const binding = enginePath ? env.ENGINE_SERVICE : env.VPC_SERVICE;
    if (!binding) {
      return new Response(enginePath ? 'ENGINE_SERVICE nao vinculada.' : 'VPC_SERVICE nao vinculada.', { status: 503 });
    }

    const backend = new URL(enginePath ? ENGINE : PANEL);
    backend.pathname = incoming.pathname === '/engine' ? '/' :
      incoming.pathname.startsWith('/engine/') ? incoming.pathname.slice('/engine'.length) :
      incoming.pathname;
    backend.search = incoming.search;

    const headers = new Headers(request.headers);
    for (const key of ['host', 'x-forwarded-host', 'x-forwarded-proto',
      'x-forwarded-for', 'x-real-ip', 'connection', 'proxy-connection']) {
      headers.delete(key);
    }
    headers.set('x-forwarded-host', backend.host);
    headers.set('x-forwarded-proto', 'http');

    // O Next local valida o cabeçalho Origin na rota de login.
    // O Worker já validou que o navegador veio da origem pública correta.
    if (!enginePath && origin) headers.set('origin', PANEL);

    const init = { method: request.method, headers, redirect: 'manual' };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }
    try {
      const response = await binding.fetch(new Request(backend.toString(), init));
      // A resposta 101 WebSocket não pode ser reconstruída como HTTP comum.
      if (ws || response.status === 101) return response;

      const responseHeaders = new Headers(response.headers);
      const location = responseHeaders.get('location');
      if (location) {
        const next = new URL(location, backend);
        if (next.host === backend.host && next.protocol === backend.protocol) {
          next.protocol = incoming.protocol;
          next.host = incoming.host;
          if (enginePath && next.pathname.startsWith('/') &&
              !next.pathname.startsWith('/engine/')) next.pathname = '/engine' + next.pathname;
          responseHeaders.set('location', next.toString());
        }
      }
      responseHeaders.set('cache-control', 'private, no-store');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (error) {
      console.error('NuCel VPC request failed', String(error));
      return new Response('O servidor NuCel nao respondeu. Verifique o painel e o ENGINE no PC.', { status: 502 });
    }
  }
};
