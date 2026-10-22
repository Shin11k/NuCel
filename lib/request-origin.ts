// Origem exata do painel, em localhost ou nas duas URLs oficiais NuCel.
// As origens HTTPS abaixo so sao encaminhadas pelo Worker do NuCel, que
// exige Cloudflare Access e valida a origem do navegador antes do proxy.
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  let actual: URL;
  let requested: URL;
  try {
    actual = new URL(origin);
    requested = new URL(req.url);
  } catch { return false; }
  if (actual.origin !== origin) return false;
  if (origin === requested.origin) return true;

  const publicOrigins = new Set([
    'https://nucel-vpc-teste.nuvixgestao.workers.dev',
    'https://nucel.nuvixgestao.workers.dev',
  ]);
  if (publicOrigins.has(origin)) return true;

  if (process.env.NODE_ENV !== 'production') {
    const local = (host: string) => host === 'localhost' || host === '127.0.0.1';
    return local(actual.hostname) && local(requested.hostname) &&
      actual.protocol === requested.protocol && actual.port === requested.port;
  }
  return false;
}
