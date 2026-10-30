/* 自研 Service Worker：缓存应用外壳与同源静态资源，不缓存任何用户数据。 */
const CACHE_VERSION = 'ads-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/app-icon-512.png',
  '/icons/app-icon-maskable-512.png',
  '/media/images/ui/menu-hero.png',
  '/media/images/ui/level-cards-sheet.png',
  '/media/images/ui/risk-icon-sheet.png',
  '/media/images/ui/control-buttons-sheet.png',
  '/media/images/ui/star-sheet.png',
  '/media/images/road/road-asphalt-tile.png',
  '/media/images/vehicles/vehicle-ego.png',
  '/media/images/vehicles/vehicle-sedan.png',
  '/media/images/vehicles/vehicle-suv.png',
  '/media/images/vehicles/vehicle-truck.png',
  '/media/images/actors/pedestrian-sheet.png',
  '/media/images/props/cone.png',
  '/media/images/props/barrier.png',
  '/media/audio/sfx-aeb.m4a',
  '/media/audio/sfx-collision.m4a',
  '/media/audio/sfx-countdown.m4a',
  '/media/audio/sfx-report.m4a',
  '/media/audio/sfx-takeover-alert.m4a',
  '/media/audio/sfx-turn-signal.m4a',
  '/media/audio/sfx-ui-click.m4a',
  '/media/audio/sfx-warning.m4a',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

const putInCache = (request, response) => {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return response;
  }
  const copy = response.clone();
  caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
  return response;
};

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => putInCache(request, response))
        .catch(() =>
          caches
            .match('/index.html')
            .then((cached) => cached ?? new Response('离线缓存不可用', { status: 503 })),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request)
          .then((response) => putInCache(request, response))
          .catch(() => undefined);
        return cached;
      }
      return fetch(request).then((response) => putInCache(request, response));
    }),
  );
});
