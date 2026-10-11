/* HidzMusify service worker (no external runtime).
 *
 * Why this replaced the generated Workbox worker: the old `sw.js` loaded `./workbox-52263f48.js`, a
 * file that is not part of the deployed build. Without it the worker could not precache or serve
 * anything, while an earlier worker that *did* have it would keep serving a precached (and by now
 * broken) `index.html` + main bundle on a cache-first basis. This version:
 *   - activates immediately (skipWaiting + clients.claim) so a deploy always reaches returning users;
 *   - drops every cache left behind by the old worker (workbox-*, images, media, older versions);
 *   - is NETWORK-FIRST for the app shell and same-origin static files (revalidated against the server,
 *     so a redeploy is never hidden behind a stale copy), using the cache only when the network fails,
 *     answers 5xx, or takes longer than NETWORK_TIMEOUT_MS;
 *   - never touches cross-origin requests (music APIs, streams, CDN images), non-GET requests, Range
 *     requests or audio/video, so search results and audio are never cached or faked by the worker.
 * The PWA stays installable (manifest.json is unchanged) and keeps working offline for visited pages.
 *
 * To force every client to drop its cache on the next deploy, change VERSION below.
 */
'use strict';

const VERSION = '2026-10-11.1';
const CACHE = 'hidzmusify-shell-' + VERSION;
const NETWORK_TIMEOUT_MS = 5000;
const MAX_ENTRIES = 300;
/* Caches this worker (or its predecessor) owns; anything else on the origin is left alone. */
const OWNED_CACHE = /^(hidzmusify-shell-|workbox-|images$|media$)/;

const SCOPE = self.registration.scope;
const SHELL_URL = new URL('index.html', SCOPE).href;

self.addEventListener('install', (event) => {
    // Best-effort warm-up of the shell so a first-time visitor can reopen the app offline.
    event.waitUntil(
        (async () => {
            try {
                const res = await fetch(SHELL_URL, { cache: 'reload' });
                if (res.ok && isHtml(res)) {
                    const cache = await caches.open(CACHE);
                    await cache.put(SHELL_URL, res);
                }
            } catch (_) {
                /* offline during install: runtime caching will fill the cache later */
            }
            await self.skipWaiting();
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(names.filter((n) => n !== CACHE && OWNED_CACHE.test(n)).map((n) => caches.delete(n)));
            await self.clients.claim();
        })()
    );
});

self.addEventListener('message', (event) => {
    const d = event.data;
    // `{type:"SKIP_WAITING"}` is what workbox-window (used by the app's registration code) sends;
    // `{action:"skipWaiting"}` is the app's own fallback message.
    if (d && (d.type === 'SKIP_WAITING' || d.action === 'skipWaiting')) self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // APIs, streams and CDN images go straight to the network
    if (url.pathname.endsWith('/sw.js')) return; // the worker script itself is always fetched fresh by the browser
    if (req.headers.has('range')) return; // partial content cannot be cached
    if (req.destination === 'audio' || req.destination === 'video') return;
    event.respondWith(networkFirst(event, req, url));
});

function isHtml(res) {
    return (res.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

/** Navigations map to the page they asked for when it is a real .html file, otherwise to the SPA shell. */
function cacheKeyFor(req, url) {
    if (req.mode !== 'navigate') return req.url;
    const p = url.pathname;
    return p.endsWith('.html') && !p.endsWith('/index.html') ? url.origin + p : SHELL_URL;
}

function cacheable(res, isNav) {
    if (!res || res.status !== 200 || res.type !== 'basic') return false;
    // A missing file on an SPA host comes back as index.html with 200: never store that under a .js/.json key.
    return isNav ? isHtml(res) : !isHtml(res);
}

async function trim(cache) {
    const keys = await cache.keys();
    if (keys.length > MAX_ENTRIES)
        await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => cache.delete(k)));
}

async function networkFirst(event, req, url) {
    const isNav = req.mode === 'navigate';
    const key = cacheKeyFor(req, url);
    const cache = await caches.open(CACHE);

    // `no-cache` = always revalidate with the server, so neither the browser HTTP cache nor an
    // intermediate cache can hand back an outdated bundle that kept the same file name.
    const network = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (cacheable(res, isNav)) {
            const copy = res.clone();
            event.waitUntil(
                cache
                    .put(key, copy)
                    .then(() => trim(cache))
                    .catch(() => {})
            );
        }
        return res;
    });

    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
    });

    try {
        const res = await Promise.race([network, timeout]);
        if (res) {
            clearTimeout(timer);
            if (res.status >= 500) {
                const cached = await cache.match(key);
                if (cached) return cached;
            }
            return res;
        }
        // Network is slow: prefer a cached copy if there is one, otherwise keep waiting for the network.
        const cached = await cache.match(key);
        if (cached) {
            event.waitUntil(network.catch(() => {}));
            return cached;
        }
        return await network;
    } catch (err) {
        clearTimeout(timer);
        const cached = await cache.match(key);
        if (cached) return cached;
        throw err; // genuinely offline and never cached: the browser shows its normal offline error
    }
}
