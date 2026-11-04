// Service worker simples: guarda os arquivos do app para abrir rapido e funcionar sem sinal.
// Os dados ficam no Firebase (que tambem guarda cache local do banco).
const CACHE = 'barbearia-v5';
const ASSETS = ['./', 'index.html', 'styles.css?v=5', 'app.js?v=5', 'firebase-config.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase e fontes: deixa passar direto

  // rede primeiro (pega atualizacoes), cache como reserva
  e.respondWith(
    // no-cache: sempre confere com o servidor, para nunca misturar HTML novo com CSS velho
    fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
