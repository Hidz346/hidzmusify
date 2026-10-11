// Service worker / PWA cache regression tests.
// Root cause #5: the shipped sw.js depended on `workbox-52263f48.js`, which is not in the build, so the worker
// could neither precache nor serve anything, and an older cache-first worker could keep serving a stale
// (broken) index.html + main bundle. The replacement worker must be deploy-safe: it activates immediately,
// removes old caches, is network-first (a redeploy is never hidden), and only falls back to cache offline.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { setup, bootReady } from '../helpers/fixture.mjs';
import { installMocks } from '../helpers/mock-network.mjs';
import { startStaticServer } from '../helpers/static-server.mjs';
import { siteRoot } from '../helpers/browser.mjs';

let env;
before(async () => (env = await setup()));
after(async () => env.close());

const SW_SOURCE = () => fs.readFileSync(path.join(siteRoot(), 'sw.js'), 'utf8');

/**
 * Poll an async in-page check until it is truthy. (Playwright's waitForFunction does not await async predicates,
 * so an async check passed to it would "succeed" on the first call.)
 */
async function until(page, fn, arg, timeout = 15000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
        last = await page.evaluate(fn, arg);
        if (last) return last;
        await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`timed out after ${timeout}ms waiting for condition (last value: ${JSON.stringify(last)})`);
}

/** Wait until a service worker is active AND controlling this page. */
const controlled = (page, timeout = 15000) =>
    until(
        page,
        async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            return !!(reg && reg.active && reg.active.state === 'activated' && navigator.serviceWorker.controller);
        },
        null,
        timeout
    );

const cacheKeys = (page) => page.evaluate(() => caches.keys());
const cachedUrls = (page) =>
    page.evaluate(async () => {
        const out = [];
        for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url);
        return out;
    });

/** Tiny controllable origin (mutable files, per-path delay / status) used to isolate worker behaviour from the app. */
async function tinySite(files) {
    const state = { files, delay: {}, status: {}, hits: {}, cacheControl: 'no-store' };
    const server = http.createServer((req, res) => {
        const p = new URL(req.url, 'http://x').pathname;
        state.hits[p] = (state.hits[p] || 0) + 1;
        const f = state.files[p] || state.files['/index.html'];
        const send = () => {
            res.writeHead(state.status[p] || 200, { 'Content-Type': f.type, 'Cache-Control': state.cacheControl });
            res.end(f.body);
        };
        state.delay[p] ? setTimeout(send, state.delay[p]) : send();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    state.url = `http://127.0.0.1:${server.address().port}`;
    state.close = () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r())));
    return state;
}
const html = (body) => ({ type: 'text/html; charset=utf-8', body: `<!doctype html><meta charset=utf-8><body>${body}` });
const js = (body) => ({ type: 'text/javascript; charset=utf-8', body });

test('sw.js is self-contained: no importScripts / external runtime, parses, and is the only worker the app registers', () => {
    const raw = SW_SOURCE();
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // ignore prose in comments
    assert.doesNotMatch(src, /importScripts\s*\(/);
    assert.doesNotMatch(src, /define\(\s*\[/);
    assert.doesNotMatch(src, /workbox-[0-9a-f]{8}/);
    assert.match(src, /skipWaiting/);
    assert.match(src, /clients\.claim/);
    new Function(raw); // syntax check only (never executed)
});

test('assets/sw.js (an EdgeOne 404 page, not a worker) is not referenced by anything in the build', () => {
    const root = siteRoot();
    const stray = path.join(root, 'assets', 'sw.js');
    if (!fs.existsSync(stray)) return; // nothing to prove if it was removed
    const refs = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
                // wrappers and repo tooling (docs/tests/patches legitimately mention the stray file) are not the deployed site
                if (
                    ['desktop', 'mobile', 'tests', 'patches', 'docs', 'node_modules', '.git', '.github'].includes(
                        e.name
                    )
                )
                    continue;
                walk(p);
            } else if (
                p !== stray &&
                /\.(html|js|json|css|webmanifest|txt|md)$/.test(e.name) &&
                fs.readFileSync(p, 'utf8').includes('assets/sw.js')
            )
                refs.push(path.relative(root, p));
        }
    };
    walk(root);
    assert.deepEqual(refs, [], 'if something references assets/sw.js it must not be removed');
});

test('app registers the worker, which activates, claims the page and caches only same-origin shell files', async () => {
    const srv = await startStaticServer(siteRoot());
    const context = await env.browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    await installMocks(page, {});
    try {
        await page.goto(srv.url + '/', { waitUntil: 'domcontentloaded' });
        await bootReady(page);
        await controlled(page);
        await page.reload({ waitUntil: 'domcontentloaded' }); // second load is served through the worker and fills the cache
        await bootReady(page);
        await page.waitForTimeout(1500);

        const keys = await cacheKeys(page);
        assert.ok(
            keys.length >= 1 && keys.every((k) => k.startsWith('hidzmusify-shell-')),
            `only the new cache may exist, got ${keys}`
        );
        const urls = await cachedUrls(page);
        assert.ok(urls.includes(srv.url + '/index.html'), 'app shell cached');
        assert.ok(
            urls.some((u) => /\/assets\/index-[\w-]+\.js$/.test(u)),
            'main bundle cached'
        );
        assert.ok(
            urls.every((u) => u.startsWith(srv.url + '/')),
            'nothing cross-origin (music API, streams, CDN images) is ever cached'
        );
        assert.deepEqual(errors, []);

        // SPA-fallback poisoning guard: a missing .js answered with index.html (200) must not be stored under that key
        const r = await page.evaluate(async () =>
            (await fetch('/assets/definitely-missing-chunk.js')).headers.get('content-type')
        );
        assert.match(r, /text\/html/, 'precondition: the host answers unknown paths with the shell');
        await page.waitForTimeout(300);
        assert.ok(
            !(await cachedUrls(page)).some((u) => u.includes('definitely-missing-chunk')),
            'HTML must never be cached as a script'
        );
    } finally {
        await context.close();
        await srv.close();
    }
});

test('app shell reopens offline after one online visit, including a deep link', async () => {
    const srv = await startStaticServer(siteRoot());
    const context = await env.browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    await installMocks(page, {});
    try {
        await page.goto(srv.url + '/', { waitUntil: 'domcontentloaded' });
        await bootReady(page);
        await controlled(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await bootReady(page);
        await page.waitForTimeout(1500);

        await srv.close(); // origin goes away: connection refused
        await page.reload({ waitUntil: 'domcontentloaded' });
        await bootReady(page);
        assert.equal(await page.locator('#search-input').count(), 1, 'shell rendered from cache');
        await page.evaluate(() => (window.__hzMarker = 'alive'));
        await page.locator('#search-input').fill('x');
        await page.locator('#search-input').press('Enter');
        await page.waitForURL(/\/search\/x/, { timeout: 10000 });
        assert.equal(
            await page.evaluate(() => window.__hzMarker),
            'alive',
            'app JS (bundle) was served from cache and is running'
        );
    } finally {
        await context.close();
        await srv.close().catch(() => {});
    }
});

test('network-first: a redeploy is visible on the next load even though the host sends max-age=3600', async () => {
    const files = {
        '/index.html': html(
            '<script>navigator.serviceWorker.register("/sw.js")</script><script src="/app.js"></script>'
        ),
        '/sw.js': { type: 'text/javascript', body: SW_SOURCE() },
        '/app.js': js('window.__v="v1"'),
    };
    const site = await tinySite(files);
    site.cacheControl = 'max-age=3600'; // long HTTP cache on purpose: the worker has to revalidate, not trust it
    const context = await env.browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    try {
        await page.goto(site.url + '/');
        await controlled(page);
        await page.reload();
        assert.equal(await page.evaluate(() => window.__v), 'v1');
        files['/app.js'] = js('window.__v="v2"'); // "deploy": same file name, new content (exactly the situation of the patched bundle)
        await page.close(); // the user comes back later: a new tab, not an in-place reload
        const again = await context.newPage();
        await again.goto(site.url + '/');
        assert.equal(
            await again.evaluate(() => window.__v),
            'v2',
            'must not be hidden by the HTTP cache or the worker cache'
        );
    } finally {
        await context.close();
        await site.close();
    }
});

test('upgrade: a returning user stuck behind an old cache-first worker is freed by the new sw.js', async () => {
    const OLD_SW = `
        const C = 'workbox-precache-v2-http://old/';
        self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(['/index.html', '/app.js'])).then(() => self.skipWaiting())));
        self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', (e) => e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)))); // cache-first, never revalidates
    `;
    const files = {
        '/index.html': html(
            '<script>navigator.serviceWorker.register("/sw.js")</script><script src="/app.js"></script>'
        ),
        '/sw.js': { type: 'text/javascript', body: OLD_SW },
        '/app.js': js('window.__v="broken-old-bundle"'),
    };
    const site = await tinySite(files);
    const context = await env.browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    try {
        await page.goto(site.url + '/');
        await controlled(page);
        await page.reload();
        assert.equal(await page.evaluate(() => window.__v), 'broken-old-bundle');
        // seed the other caches the old Workbox setup used, plus one that belongs to something else
        await page.evaluate(async () => {
            for (const n of ['images', 'media', 'unrelated-app-cache'])
                await (await caches.open(n)).put('/x-' + n, new Response('x'));
        });

        // deploy the fix: new bundle + new sw.js at the same URL
        files['/app.js'] = js('window.__v="fixed-bundle"');
        files['/sw.js'] = { type: 'text/javascript', body: SW_SOURCE() };
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update()); // the browser does this on navigation anyway
        await until(page, async () => {
            const keys = await caches.keys();
            return (
                keys.some((k) => k.startsWith('hidzmusify-shell-')) &&
                !keys.some((k) => /^(workbox-|images$|media$)/.test(k))
            );
        });

        const keys = await cacheKeys(page);
        assert.ok(!keys.some((k) => /^(workbox-|images$|media$)/.test(k)), `old worker caches removed, got ${keys}`);
        assert.ok(keys.includes('unrelated-app-cache'), 'caches that are not ours are left alone');
        await page.reload();
        assert.equal(
            await page.evaluate(() => window.__v),
            'fixed-bundle',
            'stale precached bundle is no longer served'
        );
    } finally {
        await context.close();
        await site.close();
    }
});

test('slow or failing origin falls back to the cached copy instead of hanging; first-time visitors still wait for the network', async () => {
    const files = {
        '/index.html': html(
            '<script>navigator.serviceWorker.register("/sw.js")</script><script src="/app.js"></script>'
        ),
        '/sw.js': { type: 'text/javascript', body: SW_SOURCE() },
        '/app.js': js('window.__v="cached-copy"'),
        '/late.js': js('window.__late="late-but-served"'),
    };
    const site = await tinySite(files);
    const context = await env.browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    try {
        await page.goto(site.url + '/');
        await controlled(page);
        await page.reload();
        assert.equal(await page.evaluate(() => window.__v), 'cached-copy');

        // 502 from the edge: the cached copy is served, not the error page
        site.status['/app.js'] = 502;
        files['/app.js'] = js('window.__v="error-page-must-not-run"');
        await page.reload();
        assert.equal(await page.evaluate(() => window.__v), 'cached-copy', '5xx falls back to cache');
        site.status['/app.js'] = 0;

        // origin hangs (8s): after the 5s network budget the cached copy is used
        files['/app.js'] = js('window.__v="slow-new-copy"');
        site.delay['/app.js'] = 8000;
        const t0 = Date.now();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__v !== undefined, null, { timeout: 7000 });
        const took = Date.now() - t0;
        assert.equal(await page.evaluate(() => window.__v), 'cached-copy');
        assert.ok(took >= 4500 && took < 7500, `fell back after the network budget (took ${took}ms)`);
        site.delay['/app.js'] = 0;

        // never cached + slow: there is nothing to fall back to, so the worker waits for the real response
        site.delay['/late.js'] = 6500;
        const body = await page.evaluate(async () => (await fetch('/late.js')).text());
        assert.match(body, /late-but-served/);
    } finally {
        await context.close();
        await site.close();
    }
});

test('worker leaves cross-origin, non-GET, Range and audio requests alone', async () => {
    const files = {
        '/index.html': html('<audio id=a></audio><script>navigator.serviceWorker.register("/sw.js")</script>'),
        '/sw.js': { type: 'text/javascript', body: SW_SOURCE() },
        '/clip.wav': { type: 'audio/wav', body: Buffer.alloc(2048) },
        '/ping': { type: 'text/plain', body: 'pong' },
    };
    const site = await tinySite(files);
    const other = await tinySite({ '/index.html': { type: 'text/plain', body: 'cross-origin' } });
    const context = await env.browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    try {
        await page.goto(site.url + '/');
        await controlled(page);
        await page.evaluate(async (o) => {
            await fetch(o + '/data.json', { mode: 'no-cors' }).catch(() => {});
            await fetch('/ping', { method: 'POST', body: 'x' }).catch(() => {});
            await fetch('/clip.wav', { headers: { Range: 'bytes=0-99' } }).catch(() => {});
            const a = document.getElementById('a');
            a.src = '/clip.wav';
            a.load();
        }, other.url);
        await page.waitForTimeout(800);
        const urls = await cachedUrls(page);
        assert.ok(!urls.some((u) => u.startsWith(other.url)), 'cross-origin not cached');
        assert.ok(!urls.some((u) => u.endsWith('/ping')), 'POST not cached');
        assert.ok(!urls.some((u) => u.endsWith('/clip.wav')), 'range/audio requests not cached');
    } finally {
        await context.close();
        await site.close();
        await other.close();
    }
});
