// PRODUCAO: somente implantar depois de validar o Worker de teste e proteger o hostname com Cloudflare Access.
// Requer VPC_SERVICE (painel HTTP 3001) e ENGINE_SERVICE (scrcpy HTTP 8000).
// Nunca adicione uma binding de PostgreSQL ou exponha o ENGINE sem Cloudflare Access.
const TEST_HOST = 'nucel.nuvixgestao.workers.dev';
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
    // O player scrcpy usa URLs absolutas /api/... mesmo quando a pagina
    // esta dentro de /engine. So estas rotas de leitura/configuracao do
    // player devem ir para a porta 8000: /api/auth e /api/nucel
    // continuam exclusivos do painel Next.js na porta 3001.
    const engineApi = incoming.pathname === '/api/capabilities' ||
      incoming.pathname === '/api/settings' ||
      incoming.pathname === '/api/settings/device';
    if (engineApi) {
      const allowedMethod = incoming.pathname === '/api/settings/device'
        ? ['GET', 'PATCH'].includes(request.method)
        : request.method === 'GET';
      if (!allowedMethod) return new Response('Metodo nao permitido.', { status: 405 });
      if (incoming.pathname === '/api/settings/device' &&
          !incoming.searchParams.get('udid')) {
        return new Response('Identificador do celular obrigatorio.', { status: 400 });
      }
    }
    const enginePath = incoming.pathname === '/engine' ||
      incoming.pathname.startsWith('/engine/') ||
      incoming.pathname.startsWith('/ws-scrcpy') ||
      engineApi || ws;
    // O Zero Trust valida o email. O NuCel valida a sessao e os celulares liberados.
    // Sem uma sessao local valida, NUNCA envie pedidos ao ENGINE.
    if (enginePath) {
      const cookie = request.headers.get('cookie');
      if (!cookie || !cookie.includes('nucel_session=')) {
        return new Response('Entre no NuCel para controlar os celulares.', { status: 401 });
      }
      const verify = await env.VPC_SERVICE.fetch(new Request(PANEL + '/api/nucel', {
        headers: { cookie, accept: 'application/json' },
        redirect: 'manual'
      }));
      if (!verify.ok) {
        return new Response('Sessao NuCel expirada ou sem permissao.', { status: 403 });
      }
      const access = await verify.json();
      const serials = new Set((access.devices || []).map(device => device.serial));
      if (!serials.size) return new Response('Nenhum celular liberado.', { status: 403 });
      const requestedSerial = incoming.searchParams.get('device') ||
        incoming.searchParams.get('udid') || incoming.searchParams.get('serial');
      if (ws && (!requestedSerial || !serials.has(requestedSerial))) {
        return new Response('WebSocket exige um celular autorizado.', { status: 403 });
      }
      if (!ws && requestedSerial && !serials.has(requestedSerial)) {
        return new Response('Celular nao liberado para este usuario.', { status: 403 });
      }
    }

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
    // O navegador chegou por HTTPS. O ENGINE depende dessa informacao para
    // emitir ws_scrcpy_token com Secure/SameSite=None/Partitioned no iframe.
    headers.set('x-forwarded-proto', enginePath ? 'https' : 'http');
    // O ENGINE compara Origin com Host na abertura do WebSocket.
    // Ja validamos a origem publica exata acima; dentro da VPC o Host eh
    // 127.0.0.1:8000, portanto a Origem deve ser a do destino privado.
    if (enginePath && origin) headers.set('origin', ENGINE);

    // Preserve a origem HTTPS real do navegador. O Next local utiliza
    // uma allowlist estrita com os hostnames oficiais do NuCel.
    // Nao falsifique o Origin para localhost.

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
