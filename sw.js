/* 潮汐 — Service Worker (Cache-First) */
const CACHE = 'tide-v1';
const ASSETS = [
  '/tide/',
  '/tide/index.html',
  '/tide/manifest.json',
  '/tide/css/variables.css',
  '/tide/css/base.css',
  '/tide/css/layout.css',
  '/tide/css/components.css',
  '/tide/css/pages.css',
  '/tide/js/api.js',
  '/tide/js/db.js',
  '/tide/js/sync.js',
  '/tide/js/auth.js',
  '/tide/js/transactions.js',
  '/tide/js/categories.js',
  '/tide/js/stats.js',
  '/tide/js/settings.js',
  '/tide/js/export.js',
  '/tide/js/router.js',
  '/tide/js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/tide/api/')) return; // 不缓存 API
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
