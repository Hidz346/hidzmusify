import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, submitSearch, waitSearchSettled, trackRows, searchPlaceholder } from '../helpers/fixture.mjs';

let env;
before(async () => (env = await setup()));
after(async () => env.close());

test('API outage does not break other routes (library, settings, recent still render)', async () => {
    const s = await env.open({ api: 'down' });
    try {
        for (const p of ['library', 'settings', 'recent']) {
            await s.page.evaluate((path) => {
                history.pushState({}, '', path);
                window.dispatchEvent(new PopStateEvent('popstate'));
            }, `/${p}`);
            await s.page.waitForFunction(
                (id) => document.getElementById(id)?.classList.contains('active'),
                `page-${p}`,
                { timeout: 10000 }
            );
        }
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('deep link / refresh on /search/<query> renders results (SPA fallback + routing)', async () => {
    const s = await env.open({}, { path: '/search/daft%20punk', waitBoot: false });
    try {
        await waitSearchSettled(s.page);
        assert.equal((await trackRows(s.page)).length, 3);
        await s.page.reload({ waitUntil: 'domcontentloaded' });
        await waitSearchSettled(s.page);
        assert.equal((await trackRows(s.page)).length, 3);
    } finally {
        await s.close();
    }
});

test('browser back/forward shows the results of the matching query, never a stale one', async () => {
    const s = await env.open({});
    try {
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page);
        await submitSearch(s.page, 'the weeknd');
        await s.page.waitForFunction(
            () => /weeknd/i.test(document.getElementById('search-results-title')?.textContent || ''),
            null,
            { timeout: 15000 }
        );
        await waitSearchSettled(s.page);
        assert.deepEqual(
            (await trackRows(s.page)).map((r) => r.artist),
            ['The Weeknd', 'The Weeknd']
        );

        await s.page.goBack();
        await s.page.waitForFunction(
            () => /daft punk/i.test(document.getElementById('search-results-title')?.textContent || ''),
            null,
            { timeout: 15000 }
        );
        await waitSearchSettled(s.page);
        assert.equal((await trackRows(s.page)).length, 3);
        assert.ok((await trackRows(s.page)).every((r) => r.artist === 'Daft Punk'));

        await s.page.goForward();
        await s.page.waitForFunction(
            () => /weeknd/i.test(document.getElementById('search-results-title')?.textContent || ''),
            null,
            { timeout: 15000 }
        );
        await waitSearchSettled(s.page);
        assert.ok((await trackRows(s.page)).every((r) => r.artist === 'The Weeknd'));
    } finally {
        await s.close();
    }
});

test('connection drops mid-session: search shows an error state, not an endless loader', async () => {
    const s = await env.open({});
    try {
        // NB: context.setOffline() does not affect requests answered by route handlers, so cut the cable at the route layer.
        // Routes registered later win, so this overrides the mock for every non-local request.
        await s.page.route('**/*', (r) =>
            new URL(r.request().url()).hostname === '127.0.0.1' ? r.fallback() : r.abort('internetdisconnected')
        );
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page, 60000);
        assert.match(await searchPlaceholder(s.page), /Error during search/i);
    } finally {
        await s.close();
    }
});

test('every provider hangs: the watchdog still ends the loading state with a message', async () => {
    const s = await env.open({ api: 'hang' });
    try {
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page, 90000);
        assert.match(await searchPlaceholder(s.page), /timed out|Error during search/i);
        assert.equal(await s.page.locator('#search-tracks-container [data-hz-retry-search]').count(), 1);
    } finally {
        await s.close();
    }
});

test('mobile viewport: boot, search and results render', async () => {
    const s = await env.open({}, { viewport: { width: 390, height: 844 } });
    try {
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page);
        assert.equal((await trackRows(s.page)).length, 3);
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `no horizontal page scroll on mobile, got ${overflow}px`);
    } finally {
        await s.close();
    }
});
