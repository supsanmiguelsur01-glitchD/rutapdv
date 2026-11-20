/* VERTICORE · Service Worker Fase 1
   Instalación resistente, actualización segura y apertura sin conexión. */
const VERSION = "1795188394902";
const CACHE_PREFIX = "rutapdv-";
const CACHE = CACHE_PREFIX + VERSION;
const REQUIRED = ["index.html"];
const OPTIONAL = ["./", "app.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

async function fetchAndCache(cache, path) {
  const request = new Request(path, { cache: "reload" });
  const response = await fetch(request);
  if (!response || !response.ok) throw new Error("No se pudo guardar " + path + " (HTTP " + (response && response.status) + ")");
  await cache.put(path, response.clone());
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // index.html es obligatorio. Si falla, la versión anterior continúa activa.
    for (const path of REQUIRED) await fetchAndCache(cache, path);
    // Un icono o manifiesto faltante no debe tumbar toda la instalación.
    const results = await Promise.allSettled(OPTIONAL.map(path => fetchAndCache(cache, path)));
    results.forEach((result, index) => {
      if (result.status === "rejected") console.warn("Recurso opcional no almacenado:", OPTIONAL[index], result.reason);
    });
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFallback(request) {
  const current = await caches.open(CACHE);
  return (await current.match(request)) ||
         (await current.match("index.html")) ||
         (await caches.match(request)) ||
         (await caches.match("index.html"));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin ||
      url.pathname.includes("/pendientes/") ||
      url.pathname.includes("/cumplimiento/") ||
      url.pathname.endsWith(".pmtiles")) return;

  const networkFirst = request.mode === "navigate" ||
    /\/(index\.html|manifest\.json)$/.test(url.pathname) ||
    url.pathname.endsWith("/") ||
    url.pathname.includes("/data/");

  if (networkFirst) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const fallback = await cacheFallback(request);
        if (fallback) return fallback;
        return new Response("VERTICORE no está disponible sin conexión en este dispositivo.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return new Response("Recurso no disponible sin conexión.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
  })());
});
