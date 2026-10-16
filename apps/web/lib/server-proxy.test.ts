import { afterEach, describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { forwardApi } from './server-proxy';
let server: Server | undefined;
afterEach(async () => {
  delete process.env.API_INTERNAL_URL;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
});
describe('Proxy HTTP configurado no runtime', () => {
  it('encaminha cookie, origem, CSRF, corpo e query; preserva os cookies de autenticação', async () => {
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      res.setHeader('content-type', 'application/json');
      res.setHeader('set-cookie', [
        'session=test; HttpOnly; Path=/; SameSite=Strict',
        'other=value; Path=/',
      ]);
      res.end(
        JSON.stringify({
          url: req.url,
          csrf: req.headers['x-csrf-token'],
          origin: req.headers.origin,
          cookie: req.headers.cookie,
          body: JSON.parse(body),
        }),
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('No port');
    process.env.API_INTERNAL_URL = `http://127.0.0.1:${address.port}`;
    const response = await forwardApi(
      new Request('http://frontend/api/v1/auth/login?check=1', {
        method: 'POST',
        headers: {
          origin: 'https://frontend',
          'x-csrf-token': 'csrf',
          cookie: 'session=original',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'teste@example.test' }),
      }),
      { params: Promise.resolve({ path: ['v1', 'auth', 'login'] }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      url: '/v1/auth/login?check=1',
      csrf: 'csrf',
      origin: 'https://frontend',
      cookie: 'session=original',
      body: { email: 'teste@example.test' },
    });
  });
  it('não aceita rotas arbitrárias nem transforma falha de conexão em HTML', async () => {
    process.env.API_INTERNAL_URL = 'http://127.0.0.1:1';
    const rejected = await forwardApi(new Request('http://frontend/api/http://evil'), {
      params: Promise.resolve({ path: ['http:', 'evil'] }),
    });
    expect(rejected.status).toBe(404);
    const failed = await forwardApi(new Request('http://frontend/api/v1/rooms'), {
      params: Promise.resolve({ path: ['v1', 'rooms'] }),
    });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ code: 'API_UNAVAILABLE' });
  });
});
