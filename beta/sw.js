// NEXUS HUB — service worker mínimo: deixa o app abrir sem internet com a última versão.
// Nunca guarda respostas de APIs de mercado (dado velho pareceria atual) e não mexe em outros apps do domínio.
const VERSION = 'nx3-20261015';
const SHELL = ['./', 'icon.svg', 'icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('nx3-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return; // APIs e outros apps: direto na rede
  if (req.mode === 'navigate') {
    // página: sempre a versão mais nova da rede; sem internet, a última guardada
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(url.pathname, cp)); } return r; })
      .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match(scope.pathname))));
    return;
  }
  if (/\.(png|svg|webmanifest)$/.test(url.pathname)) e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
