self.addEventListener('install', (e) => {
  console.log('[Service Worker] Installed');
});

self.addEventListener('fetch', (e) => {
  // Basic pass-through for online-first behavior
  e.respondWith(fetch(e.request));
});
