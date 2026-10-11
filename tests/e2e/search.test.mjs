import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, submitSearch, waitSearchSettled, trackRows, searchPlaceholder } from '../helpers/fixture.mjs';

let env;
before(async () => (env = await setup()));
after(async () => env.close());

test('title query returns normalized, relevant tracks', async () => {
    const s = await env.open({});
    try {
        await submitSearch(s.page, 'get lucky');
        await waitSearchSettled(s.page);
        const rows = await trackRows(s.page);
        assert.deepEqual(
            rows.map((r) => r.title),
            ['Get Lucky']
        );
        assert.equal(rows[0].artist, 'Daft Punk');
        assert.match(await s.page.textContent('#search-results-title'), /get lucky/);
    } finally {
        await s.close();
    }
});

test('artist query returns only that artist', async () => {
    const s = await env.open({});
    try {
        await submitSearch(s.page, 'the weeknd');
        await waitSearchSettled(s.page);
        const rows = await trackRows(s.page);
        assert.deepEqual(rows.map((r) => r.title).sort(), ['Blinding Lights', 'Starboy']);
        assert.ok(rows.every((r) => r.artist === 'The Weeknd'));
    } finally {
        await s.close();
    }
});

test('whitespace-only query does not call the API nor navigate', async () => {
    const s = await env.open({});
    try {
        const before = s.net.count(/\/search\//);
        await submitSearch(s.page, '   ');
        await s.page.waitForTimeout(1500);
        assert.equal(s.net.count(/\/search\//), before);
        assert.doesNotMatch(s.page.url(), /\/search\//);
    } finally {
        await s.close();
    }
});

test('query with special characters is encoded correctly', async () => {
    const s = await env.open({});
    try {
        await submitSearch(s.page, 'a&b=c#d?e');
        await waitSearchSettled(s.page);
        const q = s.net.hits
            .filter((h) => /\/search\//.test(h.path))
            .map((h) => new URL('https://x' + h.path).searchParams.get('q'))
            .filter(Boolean);
        assert.ok(q.includes('a&b=c#d?e'), `server must receive the literal query, got ${JSON.stringify(q)}`);
    } finally {
        await s.close();
    }
});

test('valid "no matches" is an empty state, quickly, and not an error', async () => {
    const s = await env.open({});
    try {
        const t0 = Date.now();
        await submitSearch(s.page, 'zzzzqqqq');
        await waitSearchSettled(s.page, 20000);
        assert.match(await searchPlaceholder(s.page), /No tracks found/);
        assert.doesNotMatch(await searchPlaceholder(s.page), /error/i);
        assert.ok(Date.now() - t0 < 15000, 'empty results must not rotate through every instance for minutes');
        assert.equal(
            await s.page.locator('[data-hz-retry-search]').count(),
            0,
            'no retry button for a successful empty search'
        );
    } finally {
        await s.close();
    }
});

test('all providers down -> clear error state with retry, not "No tracks found", and it terminates', async () => {
    const s = await env.open({ api: 'down' });
    try {
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page, 60000);
        const text = await searchPlaceholder(s.page);
        assert.match(text, /Error during search/i);
        assert.doesNotMatch(text, /No tracks found/);
        assert.equal(await s.page.locator('#search-tracks-container [data-hz-retry-search]').count(), 1);
    } finally {
        await s.close();
    }
});

test('HTTP 500 from every provider -> error state', async () => {
    const s = await env.open({ api: 'http500' });
    try {
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page, 60000);
        assert.match(await searchPlaceholder(s.page), /Error during search/i);
    } finally {
        await s.close();
    }
});

test('non-JSON (garbage) responses -> error state, UI does not hang', async () => {
    const s = await env.open({ api: 'garbage' });
    try {
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page, 60000);
        assert.match(await searchPlaceholder(s.page), /Error during search/i);
    } finally {
        await s.close();
    }
});

test('retry button re-runs the search after the provider recovers', async () => {
    const s = await env.open({ api: 'down' });
    try {
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page, 60000);
        await s.page.unrouteAll({ behavior: 'ignoreErrors' });
        await (await import('../helpers/mock-network.mjs')).installMocks(s.page, {});
        await s.page.click('#search-tracks-container [data-hz-retry-search]');
        await waitSearchSettled(s.page);
        assert.equal((await trackRows(s.page)).length, 3);
    } finally {
        await s.close();
    }
});

test('rapid successive queries: only the last query is shown, even if an older one answers later', async () => {
    const s = await env.open({ searchDelayMs: (q) => (/daft/i.test(q) ? 5000 : 0) });
    try {
        await submitSearch(s.page, 'daft punk'); // slow
        await s.page.waitForURL(/\/search\/daft%20punk/);
        await submitSearch(s.page, 'the weeknd'); // fast
        await waitSearchSettled(s.page);
        await s.page.waitForTimeout(7000); // long enough for the slow response to arrive
        const rows = await trackRows(s.page);
        assert.deepEqual(rows.map((r) => r.title).sort(), ['Blinding Lights', 'Starboy']);
        assert.match(await s.page.textContent('#search-results-title'), /the weeknd/);
    } finally {
        await s.close();
    }
});

test('a provider that is down is skipped: another instance still answers', async () => {
    // first instance in rotation is random, so route half of the hosts to refuse connections
    const s = await env.open({});
    try {
        await s.page.route(
            /https:\/\/(api\.monochrome\.tf|wolf\.qqdl\.site|maus\.qqdl\.site|vogel\.qqdl\.site|katze\.qqdl\.site|hund\.qqdl\.site)\//,
            (r) => {
                return r.abort('connectionrefused');
            }
        );
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page);
        assert.equal((await trackRows(s.page)).length, 3);
    } finally {
        await s.close();
    }
});

test('track data missing optional fields does not crash the UI', async () => {
    const s = await env.open({});
    try {
        await s.page.route(/https:\/\/[^/]+\/search\/\?q=/, (r) =>
            r.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify({
                    version: '2.7',
                    data: {
                        tracks: { items: [{ id: 9001, title: 'Bare Minimum' }, { id: 9002 }] },
                        artists: { items: [] },
                        albums: { items: [] },
                        playlists: { items: [] },
                        videos: { items: [] },
                    },
                }),
            })
        );
        await submitSearch(s.page, 'bare');
        await waitSearchSettled(s.page);
        assert.ok((await trackRows(s.page)).length >= 1);
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});
