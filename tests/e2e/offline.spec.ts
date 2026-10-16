import { test, expect } from '@playwright/test';
test('app instalável recupera navegação sem conexão sem cachear a API', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe('standalone');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.goto('/pagina-que-nao-foi-cacheada');
  await expect(page.getByRole('heading', { name: 'Sem conexão no momento.' })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('button', { name: 'Bingo início' })).toBeVisible();
  const cached = await page.evaluate(async () => {
    const result: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) result.push(new URL(request.url).pathname);
    }
    return result;
  });
  expect(cached.some((path) => path.startsWith('/api/'))).toBe(false);
  expect(cached).toContain('/offline');
});
