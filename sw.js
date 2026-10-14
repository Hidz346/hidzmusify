const CACHE_NAME = hidzmusify-v13;
self.addEventListener(install, () => self.skipWaiting());
self.addEventListener(activate, (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))).then(() => self.clients.claim()));
});
self.addEventListener(fetch, (e) => {
  if (e.request.method !== GET) return;
  const u = new URL(e.request.url);
  if (u.pathname.startsWith(/api/) || /lrclib|lyricsplus|lrc\.red|youtube|googlevideo/.test(u.hostname)) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
