// Boot regression tests. Root cause #1 (SyntaxError in the main bundle) and #2 (boot blocked by TIDAL auth)
// both present as "dead page": the static shell renders but nothing responds.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setup, submitSearch, waitSearchSettled, trackRows } from '../helpers/fixture.mjs';
import { siteRoot } from '../helpers/browser.mjs';

let env;
before(async () => (env = await setup()));
after(async () => env.close());

/** True SPA behaviour: pressing Enter must route inside the app, not reload the document. */
async function enterIsSpa(page) {
    await page.evaluate(() => (window.__hzMarker = 'alive'));
    await submitSearch(page, 'daft punk');
    await page.waitForURL(/\/search\/daft%20punk/, { timeout: 10000 });
    return page.evaluate(() => window.__hzMarker === 'alive');
}

/**
 * JS files that the page can actually load: start at the scripts/preloads in index.html and follow every
 * `./name.js` / `assets/name.js` string found in a reachable file (static imports, dynamic imports, worker URLs,
 * Vite's mapDeps lists). Unreferenced leftovers (an old bundle, the stray assets/sw.js HTML page) are not the
 * app's problem and must not fail this test; anything the app can load must parse.
 */
function reachableScripts(root) {
    const dir = path.join(root, 'assets');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const queue = [...html.matchAll(/assets\/([\w.-]+\.js)/g)].map((m) => m[1]);
    const seen = new Set();
    while (queue.length) {
        const f = queue.shift();
        if (seen.has(f) || !fs.existsSync(path.join(dir, f))) continue;
        seen.add(f);
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        // `./sw.js` is the service-worker registration URL: it resolves against the document (/sw.js), not assets/.
        for (const m of src.matchAll(/(?:\.\/|assets\/)([\w.-]+\.js)\b/g)) if (m[1] !== 'sw.js') queue.push(m[1]);
    }
    return [...seen];
}

test('every JS file the app can load parses as an ES module (SyntaxError regression)', () => {
    const root = siteRoot();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hidz-syntax-'));
    const assets = reachableScripts(root);
    assert.ok(assets.length > 20, `expected the built chunks to be reachable from index.html, got ${assets.length}`);
    const failures = [];
    for (const f of assets) {
        const copy = path.join(tmp, f + '.mjs');
        fs.copyFileSync(path.join(root, 'assets', f), copy);
        try {
            execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' });
        } catch (e) {
            const line = String(e.stderr)
                .split('\n')
                .find((l) => /^\w*Error:/.test(l));
            failures.push(`${f}: ${(line || 'does not parse').slice(0, 200)}`);
        }
    }
    assert.deepEqual(failures, []);
});

test('app boots on a healthy network: no page errors, Enter in search routes inside the SPA', async () => {
    const s = await env.open({});
    try {
        assert.deepEqual(s.pageErrors, [], 'no uncaught errors during boot');
        assert.equal(await enterIsSpa(s.page), true, 'document must not reload on Enter');
        await waitSearchSettled(s.page);
        assert.ok((await trackRows(s.page)).length >= 1);
    } finally {
        await s.close();
    }
});

test('boot survives TIDAL auth being unreachable (connection refused)', async () => {
    const s = await env.open({ tidalAuth: 'fail' });
    try {
        assert.deepEqual(s.pageErrors, [], 'a failed token warm-up must not surface as an unhandled rejection');
        assert.equal(await enterIsSpa(s.page), true);
        await waitSearchSettled(s.page);
        assert.ok((await trackRows(s.page)).length >= 1, 'search still works through the instance path');
    } finally {
        await s.close();
    }
});

test('boot survives TIDAL auth hanging forever (stalled connection)', async () => {
    const s = await env.open({ tidalAuth: 'hang' });
    try {
        assert.equal(await enterIsSpa(s.page), true, 'init must not wait for the token request');
        await waitSearchSettled(s.page);
        assert.ok((await trackRows(s.page)).length >= 1);
    } finally {
        await s.close();
    }
});

test('boot survives the contributors endpoint hanging forever', async () => {
    const s = await env.open({ contributors: 'hang' });
    try {
        assert.equal(await enterIsSpa(s.page), true, 'optional About-page data must not block boot');
    } finally {
        await s.close();
    }
});

test('boot survives blocked localStorage reads (privacy mode)', async () => {
    const s = await env.open(
        {},
        {
            init: () => {
                const orig = Storage.prototype.getItem;
                Storage.prototype.getItem = function (k) {
                    if (String(k).startsWith('monochrome-api-instances'))
                        throw new DOMException('blocked', 'SecurityError');
                    return orig.call(this, k);
                };
            },
        }
    );
    try {
        assert.equal(await enterIsSpa(s.page), true);
        await waitSearchSettled(s.page);
        assert.ok((await trackRows(s.page)).length >= 1);
    } finally {
        await s.close();
    }
});
