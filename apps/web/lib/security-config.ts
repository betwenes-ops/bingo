import { forwardApi } from './server-proxy';
export async function securityConfig(request: Request) {
  const response = await forwardApi(request, {
    params: Promise.resolve({ path: ['v1', 'auth', 'config'] }),
  });
  if (!response.ok) return response;
  const config = (await response.json()) as {
    required: boolean;
    siteKey: string | null;
    ready: boolean;
  };
  const siteKey =
    process.env.TURNSTILE_SITE_KEY ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? config.siteKey;
  return Response.json(
    { ...config, siteKey, ready: config.ready && (!config.required || Boolean(siteKey)) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
