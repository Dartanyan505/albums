
/* Album Site — Service Worker
   Cache-first for images (covers), SWR for APIs and same-origin assets.
*/
const VERSION = 'v1.0.5';
const STATIC_CACHE = `static-${VERSION}`;
const IMG_CACHE = `img-${VERSION}`;
const API_CACHE = `api-${VERSION}`;

// Precache local, same-origin essentials
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './albums.json',
  './apple-music.png',
  './spotify.png',
  './yt-music.png',
  './logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => {
        if (![STATIC_CACHE, IMG_CACHE, API_CACHE].includes(k)) return caches.delete(k);
      }));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cache-first for images (covers)
  const isImageLike =
    /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname) ||
    /lastfm/i.test(url.hostname) ||        // Last.fm CDNs
    /mzstatic/i.test(url.hostname) ||      // Apple images
    /akamai/i.test(url.hostname);

  if (isImageLike) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  // SWR for third-party APIs we call (Last.fm / iTunes)
  const isApi =
    /audioscrobbler\.com/i.test(url.hostname) ||
    /itunes\.apple\.com/i.test(url.hostname);

  if (isApi) {
    event.respondWith(staleWhileRevalidate(req, API_CACHE));
    return;
  }

  // Same-origin assets → SWR
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }
});

// Optional: receive a list of cover URLs to precache (from the page)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && data.type === 'PRECACHE_COVERS' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(IMG_CACHE);
        const unique = [...new Set(data.urls)];
        await Promise.all(unique.map(async (u) => {
          try {
            // Opaque allowed (no-cors)
            const res = await fetch(new Request(u, { mode: 'no-cors', credentials: 'omit' }));
            if (res) await cache.put(u, res.clone());
          } catch (_) { /* ignore */ }
        }));
      })()
    );
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  try {
    // For cross-origin images, allow caching opaque responses
    const res = await fetch(request);
if (res && (res.ok || res.type === "opaque")) {
  await cache.put(request, res.clone());
}

    if (res) cache.put(request, res.clone());
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((res) => {
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || networkPromise || Response.error();
}
