/** Runtime proxy: API_INTERNAL_URL is read per request, never baked into the build. */
export async function forwardApi(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!path.length || !['v1', 'ready', 'health'].includes(path[0]!))
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
  const base = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
  let target: URL;
  try {
    target = new URL(base);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
      throw new Error('Invalid upstream');
    target.pathname = `${target.pathname.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}`;
    target.search = new URL(request.url).search;
  } catch {
    return Response.json({ code: 'API_CONFIGURATION' }, { status: 503 });
  }
  const headers = new Headers();
  for (const name of [
    'content-type',
    'cookie',
    'origin',
    'x-csrf-token',
    'idempotency-key',
    'accept',
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    for (const name of ['content-type', 'retry-after', 'content-disposition']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append('set-cookie', cookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json(
      { code: 'API_UNAVAILABLE' },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}
