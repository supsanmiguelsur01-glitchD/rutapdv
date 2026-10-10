/* RutaPDV · service worker: permite instalar la app y abrirla sin conexión */
const VERSION = "1791665421279";
const CACHE = "rutapdv-" + VERSION;
const CORE = ["./", "index.html", "app.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("rutapdv-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;   // mapas y fuentes: directo a internet
  const fresh = req.mode === "navigate" || /\/(index\.html|manifest\.json)$/.test(url.pathname) || url.pathname.endsWith("/") || url.pathname.includes("/data/");
  if (fresh){
    // primero la red (datos y versión siempre al día); sin conexión, lo último guardado
    e.respondWith(fetch(req).then(r => { if (r.ok){ const cp = r.clone(); caches.open(CACHE).then(c => c.put(req.mode === "navigate" ? "./" : req, cp)); } return r; })
      .catch(() => caches.match(req.mode === "navigate" ? "./" : req, {ignoreSearch: true}).then(r => r || caches.match("./"))));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { if (n.ok){ const cp = n.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return n; })));
});
