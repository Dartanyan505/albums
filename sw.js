/* Album Site — Service Worker (No-API)
   Cache-first for covers, SWR for local assets
*/
const VERSION = 'v2.0.0';
const STATIC_CACHE = `static-${VERSION}`;
const IMG_CACHE = `img-${VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './albums.json',
  './icons/apple-music.png',
  './icons/spotify.png',
  './icons/yt-music.png',
  './icons/logo-192.png',
  './icons/logo-512.png',
  './icons/share.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (![STATIC_CACHE, IMG_CACHE].includes(k)) return caches.delete(k);
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Yerel kapaklar ve resimler → cache-first
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  // Same-origin statik dosyalar → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
  }
});

// Opsiyonel: sayfadan gelen cover URL’lerini önbelleğe almak
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'PRECACHE_COVERS' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(IMG_CACHE);
        const unique = [...new Set(data.urls)];
        await Promise.all(unique.map(async (u) => {
          try {
            const res = await fetch(u, { mode: 'no-cors' });
            if (res) await cache.put(u, res.clone());
          } catch (_) {}
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
    const res = await fetch(request);
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) await cache.put(request, res.clone());
    return res || cached || Response.error();
  } catch (_) {
    return cached || Response.error();
  }
}
