/* global self,caches,URL,fetch */
/* Never cache API responses, account pages, sessions, or game state. */
const CACHE = 'bingo-offline-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/offline', '/icon.svg'])));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('bingo-offline-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    event.request.method !== 'GET'
  )
    return;
  if (event.request.mode === 'navigate')
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline')));
});
