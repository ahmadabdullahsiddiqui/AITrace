// sw.js — service worker for AITrace.
// Strategy:
//   - App shell (HTML/CSS/JS): NETWORK-FIRST, so an online user always gets the
//     latest code; fall back to cache only when offline.
//   - Large immutable vendor assets (/vendor/ — transformers, wasm, model, pdf,
//     mammoth): CACHE-FIRST, for speed and true offline use.
// The worker self-updates: skipWaiting + clients.claim, and the page reloads once
// when a new worker takes control (see registration in app.js).

const SHELL_CACHE = 'aitrace-shell';
const ASSET_CACHE = 'aitrace-assets';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  if (url.pathname.includes('/vendor/')) {
    // Cache-first for big immutable assets.
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  // Network-first for the app shell — always fresh when online.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(req);
        return hit || Response.error();
      }
    })()
  );
});
