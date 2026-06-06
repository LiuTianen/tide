/* 潮汐 — Service Worker (Network-First, auto-update) */
const CACHE = 'tide-v3';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
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
    ])).catch(() => {})
  );
  self.skipWaiting(); // 立即激活新 SW
});

self.addEventListener('activate', e => {
  // 清理旧缓存
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('tide-') && k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim(); // 立即接管所有页面
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/tide/api/')) return;
  // Network-First：先走网络，失败时回退缓存
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
