// Pendientes · service worker (comparte dominio con RutaPDV: solo toca sus propias cachés): funciona sin internet y recibe lo que se comparte desde WhatsApp.
const CACHE = "pendientes-v1792633781230";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("pendientes-v") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.pathname.endsWith("/share-target")) {
    e.respondWith(recibirCompartido(e.request));
    return;
  }
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Red primero (para tener siempre la última versión); si no hay señal, usa la copia guardada.
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});

async function recibirCompartido(req) {
  let texto = "";
  try {
    const form = await req.formData();
    const partes = [form.get("title"), form.get("text"), form.get("url")].filter(v => typeof v === "string" && v.trim());
    texto = partes.join("\n");
    for (const f of form.getAll("chat")) {
      if (!(f instanceof File)) continue;
      if (/zip/i.test(f.type) || /\.zip$/i.test(f.name)) texto += "\n" + await txtDeZip(await f.arrayBuffer());
      else texto += "\n" + await f.text();
    }
  } catch (err) {}
  const c = await caches.open("pendientes-compartido");
  await c.put("shared", new Response(texto.trim(), { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  return Response.redirect("./?shared=1", 303);
}

// Lee el primer .txt de un .zip (WhatsApp a veces exporta así).
async function txtDeZip(buf) {
  const v = new DataView(buf); let p = 0; const dec = new TextDecoder();
  while (p + 30 <= buf.byteLength && v.getUint32(p, true) === 0x04034b50) {
    const metodo = v.getUint16(p + 8, true), tam = v.getUint32(p + 18, true);
    const nLen = v.getUint16(p + 26, true), xLen = v.getUint16(p + 28, true);
    const nombre = dec.decode(new Uint8Array(buf, p + 30, nLen));
    const ini = p + 30 + nLen + xLen; const datos = new Uint8Array(buf, ini, tam);
    if (/\.txt$/i.test(nombre) && tam > 0) {
      if (metodo === 0) return dec.decode(datos);
      if (metodo === 8 && "DecompressionStream" in self) {
        const s = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(s).text();
      }
    }
    p = ini + tam;
  }
  return "";
}
