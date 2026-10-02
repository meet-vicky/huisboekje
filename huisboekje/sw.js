// Bewaart de app op het toestel zodat ze ook zonder internet opent.
// Verhoog het versienummer als je bestanden aanpast, dan halen alle toestellen de nieuwe versie.
const CACHE = "huisboekje-v1";
const SHELL = ["./", "./index.html", "./app.js", "./config.js", "./firebase.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !isFont) return; // Firebase-verkeer niet onderscheppen
  // Eerst van het toestel tonen (snel, werkt offline), op de achtergrond bijwerken.
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || fresh;
  }));
});
