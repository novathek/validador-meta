/* ================================================================
   sw.js — Service Worker · META Asistencia 2026
   Estrategia: Cache-first para assets estáticos,
   Network-first para Firebase (requiere conexión para asistencia).
   ================================================================ */

const CACHE_NAME = 'meta-asistencia-v3';

// Assets que se cachean para funcionar offline
const STATIC_ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
];

// ── Instalar: pre-cachear todos los assets estáticos ─────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-cacheando assets...');
      // Cachear de a uno para que un fallo no rompa todo
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] No se pudo cachear:', url, err.message)
          )
        )
      );
    }).then(() => {
      console.log('[SW] Instalado correctamente');
      return self.skipWaiting();
    })
  );
});

// ── Activar: limpiar caches viejos ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando cache viejo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      console.log('[SW] Activado');
      return self.clients.claim();
    })
  );
});

// ── Fetch: Cache-first para estáticos, pass-through para Firebase ─
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Firebase y Firestore siempre van a la red (necesitan autenticación en tiempo real)
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com')
  ) {
    return; // dejar pasar, sin interceptar
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Devolver desde cache y actualizar en background
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response && response.status === 200 && response.type !== 'opaque') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => null);
        return cached;
      }
      // No está en cache → ir a la red
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline y no está en cache: para HTML mostrar index.html si existe
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
