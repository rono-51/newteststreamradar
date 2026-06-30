/* ═══════════════════════════════════════════════════════
   SERVICE WORKER — StreamRadar PWA
   ───────────────────────────────────────────────────────
   Qué hace:
   • Cachea todos los assets estáticos (HTML, CSS, JS, fuentes, logos)
   • La app carga instantáneamente aunque no haya internet
   • Los WebSockets de Kick siguen funcionando (red real)
   • Las alertas de notificación llegan incluso si el tab está cerrado
     (via Push API — requiere servidor para producción)
═══════════════════════════════════════════════════════ */

const CACHE_NAME  = 'streamradar-v1';
const CACHE_URLS  = [
  '/',
  '/index.html',
  '/render.html',
  '/worker.js',
  '/manifest.json',
  '/assets/fonts/Anton-Regular.ttf',
  '/assets/logos/streamradar_logo.png',
  /* Banners de streamers */
  '/assets/banners/antonicratv.jpg',
  '/assets/banners/daarick.jpg',
  '/assets/banners/sideral.jpg',
  '/assets/banners/sachauzumaki.jpg',
  '/assets/banners/emetsuki.jpg',
  '/assets/banners/esbebote.jpg',
  '/assets/banners/cristorata7.jpg',
];

/* ── INSTALL: precachear assets estáticos ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      /* Cachear de forma individual para no fallar si alguno no existe */
      return Promise.allSettled(
        CACHE_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] No se pudo cachear ${url}:`, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpiar caches viejos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: estrategia Cache First para assets, Network First para API ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Dejar pasar WebSockets y requests a kick.com / pusher directamente */
  if (
    event.request.method !== 'GET'          ||
    url.hostname.includes('kick.com')       ||
    url.hostname.includes('pusher.com')     ||
    url.hostname.includes('ws-us2')         ||
    url.protocol === 'ws:'                  ||
    url.protocol === 'wss:'
  ) {
    return; /* Sin interceptar — va directo a la red */
  }

  /* Para assets locales: Cache First (instantáneo) */
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      /* No está en caché: buscar en red y guardar */
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        /* Offline y no hay caché: devolver página de fallback */
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ── NOTIFICACIONES PUSH (para uso futuro con servidor) ── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'StreamRadar', {
      body:  data.body  || '',
      icon:  data.icon  || '/assets/logos/streamradar_logo.png',
      badge: '/assets/logos/streamradar_logo.png',
      tag:   data.tag   || 'sr-alert',
      data:  data.url   || '/',
      vibrate: [200, 100, 200],
    })
  );
});

/* Click en notificación → abrir la app */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const target = event.notification.data || '/';
      const existing = cls.find(c => c.url.includes('streamradar') && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(target);
    })
  );
});
