// NEXUS HUB — service worker mínimo: deixa o app abrir sem internet com a última versão.
// Nunca guarda respostas de APIs de mercado (dado velho pareceria atual) e não mexe em outros apps do domínio.
const VERSION = 'nx3-20261107';
const SHELL = ['./', 'icon.svg', 'icon-192.png', 'badge-96.png', 'manifest.webmanifest'];
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

// ---------- alertas no celular (Web Push) ----------
// O servidor do NEXUS manda {title, body, url, kind, tag}; aqui vira a notificação do aparelho.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'NEXUS HUB', body: e.data ? e.data.text() : '' }; }
  const title = String(d.title || 'NEXUS HUB').slice(0, 120);
  const opt = {
    body: String(d.body || '').slice(0, 300), icon: 'icon-192.png', badge: 'badge-96.png',
    data: { url: typeof d.url === 'string' && d.url.startsWith('#/') ? d.url : '#/alerts' },
    timestamp: Number(d.ts) || Date.now(), lang: 'pt-BR',
  };
  if (d.tag) { opt.tag = String(d.tag).slice(0, 64); opt.renotify = true; }
  e.waitUntil(self.registration.showNotification(title, opt));
});
// toque na notificação: abre (ou traz para a frente) o app na tela certa
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || '#/alerts';
  const scope = self.registration.scope, url = scope + hash;
  // só a janela do próprio app (a raiz não pega a do /beta/ nem a apresentação)
  const mine = (w) => { const u = w.url.split(/[?#]/)[0]; return u === scope || u === scope + 'index.html'; };
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find(mine);
    if (c) { c.postMessage({ type: 'nx-open', hash }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
