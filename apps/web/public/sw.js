/* Flight Watch Party service worker.
 *
 * Caches the app shell (HTML/JS/CSS/icons/manifest) so the page loads even
 * if the hotspot hiccups. NEVER caches media: the video is a local blob:
 * URL and never touches the network anyway.
 */
const VERSION = 'fw-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept the WebSocket, media, or anything not same-origin GET.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname === '/ws') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          // Cache static build assets (hashed filenames are immutable).
          if (response.ok && (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname))) {
            const clone = response.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached ?? caches.match('/'));
      return cached ?? network;
    }),
  );
});
