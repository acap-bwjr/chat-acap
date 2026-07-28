// Service worker mínimo: habilita instalação (PWA) + cache do app shell.
// Estratégia: network-first (sempre pega o mais novo online), com fallback ao cache offline.
const CACHE = 'calmo-atendimento-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Não interceptar API/websocket (precisam sempre da rede)
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  // Só cacheia mesma origem
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Só devolver o index quando for NAVEGAÇÃO. Devolver HTML no lugar de um
        // .js quebra o import() dinâmico (o navegador recusa: "expected a
        // JavaScript module script but the server responded with text/html") —
        // era isso que fazia o relatório em PDF não sair, porque o pdfmake é
        // carregado por import() sob demanda.
        if (req.mode === 'navigate') return caches.match('/');
        return Response.error();
      }),
  );
});
