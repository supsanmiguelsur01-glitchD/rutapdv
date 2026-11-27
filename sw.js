/* VERTICORE · Service Worker Fase 2
   Abre al instante: la app se carga de lo guardado en el teléfono si la red tarda más de 3 s
   (antes esperaba la red sin límite y la pantalla se quedaba en blanco al volver a la app o al actualizar). */
const VERSION = "1795794027772";
const CACHE_PREFIX = "rutapdv-";
const CACHE = CACHE_PREFIX + VERSION;
const REQUIRED = ["index.html"];
const OPTIONAL = ["./", "app.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
const ESPERA_RED_MS = 3000;

async function fetchAndCache(cache, path) {
  const request = new Request(path, { cache: "reload" });
  const response = await fetch(request);
  if (!response || !response.ok) throw new Error("No se pudo guardar " + path + " (HTTP " + (response && response.status) + ")");
  await cache.put(path, response.clone());
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const path of REQUIRED) await fetchAndCache(cache, path);
    const results = await Promise.allSettled(OPTIONAL.map(path => fetchAndCache(cache, path)));
    results.forEach((result, index) => { if (result.status === "rejected") console.warn("Recurso opcional no almacenado:", OPTIONAL[index], result.reason); });
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // la versión anterior se borra solo cuando la nueva ya tiene su index.html guardado
    const nuevo = await caches.open(CACHE);
    if (await nuevo.match("index.html")) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    }
    await self.clients.claim();
  })());
});

// la app es una sola página: cualquier apertura usa el index.html guardado más reciente
async function appGuardada() {
  const current = await caches.open(CACHE);
  return (await current.match("index.html")) || (await caches.match("index.html")) || (await current.match("./")) || (await caches.match("./"));
}
async function guardarApp(response) {
  try {
    if (!response || response.status !== 200 || response.type === "opaque") return;
    const cache = await caches.open(CACHE);
    await cache.put("index.html", response.clone());
  } catch (e) {}
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;   // revisión de versión: va directo a la red

  const url = new URL(request.url);
  if (url.origin !== self.location.origin ||
      url.pathname.includes("/pendientes/") ||
      url.pathname.includes("/cumplimiento/") ||
      url.pathname.endsWith(".pmtiles")) return;

  const esApp = request.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname);

  if (esApp) {
    // la app pide bajar la versión nueva antes de recargar: red y se guarda
    if (url.searchParams.has("pre")) {
      event.respondWith(fetch(request, { cache: "no-store" }).then(r => { const c = r.clone(); event.waitUntil(guardarApp(c)); return r; }));
      return;
    }
    // red con tiempo límite: si tarda, se abre lo guardado y la red termina de guardar la versión nueva por detrás
    event.respondWith((async () => {
      const red = fetch(request, { cache: "no-store" }).then(r => { if (r && r.ok) { const c = r.clone(); event.waitUntil(guardarApp(c)); } return r; });
      const guardada = await appGuardada();
      if (!guardada) {
        try { return await red; } catch (e) {
          return new Response("VERTICORE necesita internet la primera vez que se abre en este teléfono.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
        }
      }
      const limite = new Promise(res => setTimeout(() => res(null), ESPERA_RED_MS));
      try {
        const r = await Promise.race([red.catch(() => null), limite]);
        if (r && r.ok) return r;
      } catch (e) {}
      return guardada;
    })());
    return;
  }

  const networkFirst = /\/manifest\.json$/.test(url.pathname) || url.pathname.includes("/data/");
  if (networkFirst) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response && response.ok && response.status === 200) { const cache = await caches.open(CACHE); await cache.put(request, response.clone()); }
        return response;
      } catch (error) {
        const fallback = await caches.match(request);
        if (fallback) return fallback;
        return new Response("Sin conexión.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.status === 200) { const cache = await caches.open(CACHE); await cache.put(request, response.clone()); }
      return response;
    } catch (error) {
      return new Response("Recurso no disponible sin conexión.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
  })());
});
