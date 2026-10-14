// End-to-end tests for the YouTube search + playback path (the default of the shipped build).
// The /api/* functions run for real on top of a fake catalog and YouTube's IFrame Player is replaced by a controllable
// fake (tests/helpers/mock-youtube.mjs). These tests prove the application logic; they cannot prove real YouTube
// behaviour, which has to be checked on the deployed site.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    setup,
    submitSearch,
    waitSearchSettled,
    audioState,
    toastTexts,
    trackRows,
    searchPlaceholder,
} from '../helpers/fixture.mjs';

let env;
before(async () => (env = await setup()));
after(async () => env.close());

const OMT = 'omtAAAAAAAA';
const GL = 'glAAAAAAAAA';
const ATW = 'atwAAAAAAAA';
const OMT_VIDEO = 'omtVideoAAA';

const open = (youtube = {}, opts = {}) => env.open({}, { source: 'youtube', youtube, ...opts });
async function withResults(youtube = {}, opts = {}) {
    const s = await open(youtube, opts);
    await submitSearch(s.page, 'daft punk');
    await waitSearchSettled(s.page);
    return s;
}
const row = (page, vid) => page.locator(`#search-tracks-container .track-item[data-track-id="yt:${vid}"]`);
const playBtn = (page) => page.locator('.now-playing-bar .play-pause-btn');
const title = (page) => page.textContent('.now-playing-bar .title');
const playing = (page, minTime = 0.4) =>
    page.waitForFunction(
        (min) => {
            const a = document.getElementById('audio-player');
            return !a.paused && a.currentTime > min && a.readyState >= 2;
        },
        minTime,
        { timeout: 20000 }
    );
const anyToast = (page, timeout = 30000) =>
    page.waitForFunction(() => document.querySelector('#download-notifications .download-task'), null, { timeout });
const loads = async (s) => (await s.net.yt.log('loadVideoById')).map((e) => e.id);

test('search: results come from /api/search, only tracks are offered, nothing talks to the TIDAL instances', async () => {
    const s = await withResults();
    try {
        const rows = await trackRows(s.page);
        assert.deepEqual(
            rows.map((r) => r.id),
            ['yt:' + OMT, 'yt:' + GL, 'yt:' + ATW, 'yt:omtLiveAAAA', 'yt:' + OMT_VIDEO]
        );
        assert.equal(rows[0].title, 'One More Time');
        assert.equal(rows[0].artist, 'Daft Punk');
        assert.equal(s.net.yt.count('search'), 1);
        assert.equal(s.net.count(/(monochrome|geeked|qqdl|kinoplus)[^/]*\/search/), 0, 'no hifi-API search');
        const artists = await s.page.textContent('#search-artists-container');
        assert.match(artists, /Only tracks are available/);
        assert.deepEqual(s.pageErrors, []);
        assert.equal(await s.page.locator('#fake-yt-iframe').count(), 0, 'YouTube is not loaded before a track plays');
    } finally {
        await s.close();
    }
});

test('click a result: real playback state (time advances, pause icon, title), hidden 1x1 player', async () => {
    const s = await withResults();
    try {
        await row(s.page, OMT).click();
        await playing(s.page);
        const a = await audioState(s.page);
        assert.equal(a.paused, false);
        assert.ok(a.t > 0.4, `currentTime must advance, got ${a.t}`);
        assert.equal(a.duration, 200, 'duration comes from the YouTube player');
        assert.deepEqual(await loads(s), [OMT]);
        assert.match(await title(s.page), /One More Time/);
        const host = await s.page.evaluate(() => {
            const h = document.getElementById('hz-yt-host');
            const r = h.getBoundingClientRect();
            return { w: r.width, h: r.height, left: r.left, top: r.top, opacity: getComputedStyle(h).opacity };
        });
        assert.equal(host.w, 1);
        assert.ok(host.left < 0 && host.top < 0, 'player is parked off-screen');
        assert.equal(host.opacity, '0');
        const created = await s.net.yt.log('new');
        assert.equal(created.length, 1);
        assert.equal(created[0].vars.origin, new URL(s.page.url()).origin);
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('pause resumes the SAME video (no restart); time freezes while paused; seek and volume reach the player', async () => {
    const s = await withResults();
    try {
        await row(s.page, OMT).click();
        await playing(s.page);

        await playBtn(s.page).click(); // pause
        await s.page.waitForFunction(() => document.getElementById('audio-player').paused, null, { timeout: 5000 });
        const pausedAt = (await audioState(s.page)).t;
        await s.page.waitForTimeout(700);
        assert.ok(Math.abs((await audioState(s.page)).t - pausedAt) < 0.05, 'time must not advance while paused');
        assert.equal((await s.net.yt.log('pauseVideo')).length, 1);

        await playBtn(s.page).click(); // resume
        await playing(s.page, pausedAt + 0.3);
        assert.deepEqual(await loads(s), [OMT], 'resume must not reload the video');

        await s.page.evaluate(() => (document.getElementById('audio-player').currentTime = 100));
        await s.page.waitForFunction(() => document.getElementById('audio-player').currentTime >= 100, null, {
            timeout: 5000,
        });
        assert.deepEqual(
            (await s.net.yt.log('seekTo')).map((e) => e.t),
            [100]
        );

        const vol = await s.page.evaluate(() => {
            const a = document.getElementById('audio-player');
            a.volume = 0.25;
            return a.volume;
        });
        assert.equal(vol, 0.25);
        assert.ok((await s.net.yt.log('setVolume')).some((e) => e.v === 25));
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('queue: Next / Prev and automatic advance at the end of a video', async () => {
    const s = await withResults();
    try {
        await row(s.page, OMT).click();
        await playing(s.page);

        await s.page.click('#next-btn');
        await s.page.waitForFunction(() =>
            /Get Lucky/.test(document.querySelector('.now-playing-bar .title').textContent)
        );
        await playing(s.page, 0.2);
        assert.deepEqual(await loads(s), [OMT, GL]);

        await s.net.yt.finish(); // Get Lucky ends -> Around the World
        await s.page.waitForFunction(
            () => /Around the World/.test(document.querySelector('.now-playing-bar .title').textContent),
            null,
            {
                timeout: 10000,
            }
        );
        await playing(s.page, 0.2);
        assert.deepEqual(await loads(s), [OMT, GL, ATW]);

        await s.page.click('#prev-btn');
        await s.page.waitForFunction(() =>
            /Get Lucky/.test(document.querySelector('.now-playing-bar .title').textContent)
        );
        assert.equal((await loads(s)).at(-1), GL);
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('rapid track switching ends on the last clicked track, one video playing', async () => {
    const s = await withResults();
    try {
        await row(s.page, OMT).click();
        await row(s.page, GL).click();
        await row(s.page, ATW).click();
        await s.page.waitForFunction(() =>
            /Around the World/.test(document.querySelector('.now-playing-bar .title').textContent)
        );
        await playing(s.page);
        await s.page.waitForTimeout(800);
        assert.equal((await loads(s)).at(-1), ATW);
        assert.equal((await audioState(s.page)).paused, false);
        assert.equal(await s.page.locator('#fake-yt-iframe').count(), 1, 'one player instance is reused');
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('video blocked for embedding: an alternative version is resolved and played, user is told', async () => {
    const s = await withResults({ behavior: { [OMT]: 'err101' } });
    try {
        await row(s.page, OMT).click();
        await playing(s.page);
        assert.deepEqual(await loads(s), [OMT, OMT_VIDEO]);
        const resolve = s.net.yt.hits.filter((h) => h.kind === 'resolve');
        assert.equal(resolve.length, 1);
        assert.equal(resolve[0].query.exclude, OMT, 'the failed video is excluded from the next lookup');
        assert.ok((await toastTexts(s.page)).some((t) => /alternative version/i.test(t)));
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('no playable version at all: honest error, nothing "playing", play button reset', async () => {
    const s = await withResults({ behavior: { [OMT]: 'err101', [OMT_VIDEO]: 'err150' } });
    try {
        await row(s.page, OMT).click();
        await anyToast(s.page);
        const toasts = await toastTexts(s.page);
        assert.ok(
            toasts.some((t) => /Couldn't play this track|can't play this video/i.test(t)),
            JSON.stringify(toasts)
        );
        const a = await audioState(s.page);
        assert.equal(a.paused, true);
        assert.deepEqual(await loads(s), [OMT, OMT_VIDEO]);
        // pressing Play after a failure starts the track again instead of "resuming" nothing
        await s.net.yt.setBehavior({ [OMT]: 'ok' });
        await playBtn(s.page).click();
        await playing(s.page, 0.2);
        assert.equal((await loads(s)).at(-1), OMT);
    } finally {
        await s.close();
    }
});

test('autoplay blocked by the browser: told quickly to press Play, and Play then really starts the track', async () => {
    const s = await withResults({ behavior: { [OMT]: 'blocked' } });
    try {
        const t0 = Date.now();
        await row(s.page, OMT).click();
        await anyToast(s.page, 10000);
        assert.ok(Date.now() - t0 < 8000, 'must not wait for the full start timeout');
        assert.ok((await toastTexts(s.page)).some((t) => /blocked autoplay/i.test(t)));
        assert.equal((await audioState(s.page)).paused, true);

        await s.net.yt.setBehavior({ [OMT]: 'ok' }); // "the user gesture" lets it through
        await playBtn(s.page).click();
        await playing(s.page, 0.2);
        assert.deepEqual(await loads(s), [OMT, OMT]);
    } finally {
        await s.close();
    }
});

test('a video that never starts: after a bounded wait the alternative version is played', async () => {
    const s = await withResults({ behavior: { [OMT]: 'hang' } });
    try {
        const t0 = Date.now();
        await row(s.page, OMT).click();
        await playing(s.page, 0.2);
        const dt = Date.now() - t0;
        assert.ok(dt > 8000 && dt < 20000, `expected ~10 s, took ${dt} ms`);
        assert.deepEqual(await loads(s), [OMT, OMT_VIDEO]);
        assert.ok((await toastTexts(s.page)).some((t) => /alternative version/i.test(t)));
    } finally {
        await s.close();
    }
});

test('no version ever starts: error after at most two waits (no endless spinner), play button reset', async () => {
    const s = await withResults({ behavior: { [OMT]: 'hang', [OMT_VIDEO]: 'hang' } });
    try {
        const t0 = Date.now();
        await row(s.page, OMT).click();
        await anyToast(s.page, 40000);
        const dt = Date.now() - t0;
        assert.ok(dt > 18000 && dt < 30000, `expected ~20 s, took ${dt} ms`);
        const toasts = await toastTexts(s.page);
        assert.ok(
            toasts.some((t) => /took too long|Couldn't play this track/i.test(t)),
            JSON.stringify(toasts)
        );
        assert.equal((await audioState(s.page)).paused, true);
        assert.deepEqual(await loads(s), [OMT, OMT_VIDEO]);
    } finally {
        await s.close();
    }
});

test('the YouTube player script cannot be loaded (ad blocker / offline): visible error, no crash', async () => {
    const s = await withResults({ iframeApi: 'fail' });
    try {
        await row(s.page, OMT).click();
        await anyToast(s.page, 15000);
        assert.ok(
            (await toastTexts(s.page)).some((t) => /Couldn't load the YouTube player|Couldn't play this track/i.test(t))
        );
        assert.equal((await audioState(s.page)).paused, true);
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('search errors are shown honestly (never "No tracks found")', async () => {
    const cases = [
        { search: 'down', re: /Could not reach the music source/ },
        { search: 'zod', re: /unexpected format/ },
        { search: 'upstreamHang', re: /took too long/ },
        { search: 'http404', re: /not available on this site/i },
        { search: 'html', re: /unexpected response/i },
        { search: 'http500', re: /Search failed \(HTTP 500\)/i },
    ];
    for (const c of cases) {
        const s = await open({ search: c.search });
        try {
            await submitSearch(s.page, 'daft punk');
            await waitSearchSettled(s.page, 30000);
            const text = await searchPlaceholder(s.page);
            assert.ok(text, `${c.search}: expected a message`);
            assert.doesNotMatch(text, /No tracks found/i, `${c.search}: an outage must not look like "no results"`);
            assert.match(text, c.re, `${c.search}: got "${text}"`);
            assert.deepEqual(s.pageErrors, [], c.search);
        } finally {
            await s.close();
        }
    }
});

test('a search that never answers ends with a timeout message', async () => {
    const s = await open({ search: 'hang' });
    try {
        const t0 = Date.now();
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page, 30000);
        const dt = Date.now() - t0;
        assert.ok(dt > 10000 && dt < 25000, `expected ~15 s, took ${dt} ms`);
        assert.match(await searchPlaceholder(s.page), /timed out/i);
    } finally {
        await s.close();
    }
});

test('no matches is "No tracks found", not an error', async () => {
    const s = await open();
    try {
        await submitSearch(s.page, 'zzzzqqqq');
        await waitSearchSettled(s.page);
        assert.match(await searchPlaceholder(s.page), /No tracks found/i);
    } finally {
        await s.close();
    }
});

test('a newer search wins over a slower older one', async () => {
    const s = await open({ searchDelayMs: (q) => (q === 'daft punk' ? 2500 : 0) });
    try {
        await submitSearch(s.page, 'daft punk');
        await s.page.waitForTimeout(300);
        await submitSearch(s.page, 'weeknd');
        await waitSearchSettled(s.page);
        await s.page.waitForTimeout(3500); // the slow first answer arrives now and must be ignored
        const ids = (await trackRows(s.page)).map((r) => r.id);
        assert.deepEqual(ids, ['yt:blAAAAAAAAA', 'yt:sbAAAAAAAAA']);
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('a library track with a TIDAL id is resolved to a YouTube video once and remembered', async () => {
    const tidalTrack = {
        id: 1001,
        title: 'One More Time',
        duration: 320,
        explicit: false,
        artist: { id: 11, name: 'Daft Punk' },
        artists: [{ id: 11, name: 'Daft Punk' }],
        album: { id: 2001, title: 'Discovery', cover: '11111111-1111-1111-1111-111111111111' },
        audioQuality: 'LOSSLESS',
    };
    const init = (t) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem(
            'monochrome-queue',
            JSON.stringify({
                queue: [t],
                shuffledQueue: [],
                originalQueueBeforeShuffle: [],
                currentQueueIndex: 0,
                shuffleActive: false,
                repeatMode: 0,
            })
        );
    };
    const s = await open({}, { init: `(${init})(${JSON.stringify(tidalTrack)})` });
    try {
        await s.page.waitForFunction(
            () => /One More Time/.test(document.querySelector('.now-playing-bar .title')?.textContent || ''),
            null,
            {
                timeout: 10000,
            }
        );
        await playBtn(s.page).click();
        await playing(s.page);
        assert.deepEqual(await loads(s), [OMT]);
        const resolve = s.net.yt.hits.filter((h) => h.kind === 'resolve');
        assert.equal(resolve.length, 1);
        assert.equal(resolve[0].query.title, 'One More Time');
        assert.equal(resolve[0].query.artist, 'Daft Punk');
        assert.equal(resolve[0].query.duration, '320');
        const map = await s.page.evaluate(() => JSON.parse(localStorage.getItem('hz-yt-map-v1') || '{}'));
        assert.equal(map['1001'], OMT);

        // second play of the same track: answered from the remembered mapping, no new /api/resolve
        await s.page.reload({ waitUntil: 'domcontentloaded' });
        await s.page.waitForFunction(
            () => /One More Time/.test(document.querySelector('.now-playing-bar .title')?.textContent || ''),
            null,
            {
                timeout: 15000,
            }
        );
        await s.page.waitForTimeout(1200);
        await playBtn(s.page).click();
        await playing(s.page);
        assert.equal(s.net.yt.count('resolve'), 1);
    } finally {
        await s.close();
    }
});

test('/api/resolve down for a library track: honest error, nothing playing', async () => {
    const tidalTrack = {
        id: 1002,
        title: 'Get Lucky',
        duration: 369,
        artist: { id: 11, name: 'Daft Punk' },
        artists: [{ id: 11, name: 'Daft Punk' }],
        album: { id: 2002, title: 'Random Access Memories' },
    };
    const init = (t) =>
        localStorage.setItem(
            'monochrome-queue',
            JSON.stringify({
                queue: [t],
                shuffledQueue: [],
                originalQueueBeforeShuffle: [],
                currentQueueIndex: 0,
                shuffleActive: false,
                repeatMode: 0,
            })
        );
    const s = await open({ resolve: 'down' }, { init: `(${init})(${JSON.stringify(tidalTrack)})` });
    try {
        await s.page.waitForFunction(
            () => /Get Lucky/.test(document.querySelector('.now-playing-bar .title')?.textContent || ''),
            null,
            {
                timeout: 10000,
            }
        );
        await playBtn(s.page).click();
        await anyToast(s.page, 20000);
        assert.ok((await toastTexts(s.page)).some((t) => /Couldn't play this track|Search failed|try again/i.test(t)));
        assert.equal((await audioState(s.page)).paused, true);
        assert.deepEqual(await loads(s), []);
    } finally {
        await s.close();
    }
});

test('hz-yt-visible=1 shows the YouTube player (debug switch)', async () => {
    const s = await withResults(
        {},
        {
            init: () => localStorage.setItem('hz-yt-visible', '1'),
        }
    );
    try {
        await row(s.page, OMT).click();
        await playing(s.page);
        const r = await s.page.evaluate(() => {
            const b = document.getElementById('hz-yt-host').getBoundingClientRect();
            return { w: b.width, h: b.height, left: b.left };
        });
        assert.ok(r.w >= 200 && r.h >= 100 && r.left >= 0);
    } finally {
        await s.close();
    }
});

test('/api/ requests are never served from the service-worker cache', async () => {
    const s = await open({}, { serviceWorkers: 'allow' });
    try {
        await s.page.evaluate(() => navigator.serviceWorker.ready);
        await s.page.reload({ waitUntil: 'domcontentloaded' });
        await s.page.waitForTimeout(1500);
        await submitSearch(s.page, 'daft punk');
        await waitSearchSettled(s.page);
        const cached = await s.page.evaluate(async () => {
            const out = [];
            for (const name of await caches.keys()) {
                const c = await caches.open(name);
                for (const k of await c.keys()) out.push(new URL(k.url).pathname);
            }
            return out;
        });
        assert.ok(!cached.some((p) => p.startsWith('/api/')), JSON.stringify(cached));
    } finally {
        await s.close();
    }
});
