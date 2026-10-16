export const dynamic = 'force-dynamic';
export function GET() {
  try {
    const url = new URL(
      process.env.API_PUBLIC_URL ?? process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000',
    );
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/v1/realtime';
    url.search = '';
    url.hash = '';
    return Response.json(
      { webSocketUrl: url.toString() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return Response.json({ code: 'API_CONFIGURATION' }, { status: 503 });
  }
}
