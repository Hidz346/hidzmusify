import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, submitSearch, waitSearchSettled, audioState, toastTexts } from '../helpers/fixture.mjs';

let env;
before(async () => (env = await setup()));
after(async () => env.close());

/** Open the app, search "daft punk" and wait for the three results. */
async function withResults(mock = {}, opts = {}) {
    const s = await env.open(mock, opts);
    await submitSearch(s.page, 'daft punk');
    await waitSearchSettled(s.page);
    return s;
}
const row = (page, id) => page.locator(`#search-tracks-container .track-item[data-track-id="${id}"]`);
const playBtn = (page) => page.locator('.now-playing-bar .play-pause-btn');
const playing = (page, minTime = 0.4) =>
    page.waitForFunction(
        (min) => {
            const a = document.getElementById('audio-player');
            return !a.paused && a.currentTime > min && a.readyState >= 2;
        },
        minTime,
        { timeout: 30000 }
    );

test('Play on a valid, authorized stream makes real audio play (not just a Pause icon)', async () => {
    const s = await withResults();
    try {
        await row(s.page, 1001).click();
        await playing(s.page);
        const a = await audioState(s.page);
        assert.match(a.src, /mock-cdn\.test\/audio\/1001\.wav$/);
        assert.equal(a.paused, false);
        assert.ok(a.t > 0.4, `currentTime must advance, got ${a.t}`);
        assert.equal(
            s.net.count(/\/trackManifests\//),
            1,
            'a valid manifest must be accepted on the first answer (no instance rotation)'
        );
        assert.equal(s.net.count(/mock-cdn\.test\/manifests\/1001\.json/), 1);
        assert.deepEqual(s.pageErrors, []);
        assert.match(await s.page.textContent('.now-playing-bar .title'), /One More Time/);
    } finally {
        await s.close();
    }
});

test('pause / resume / seek / volume behave', async () => {
    const s = await withResults();
    try {
        await row(s.page, 1001).click();
        await playing(s.page);

        await playBtn(s.page).click(); // pause
        await s.page.waitForFunction(() => document.getElementById('audio-player').paused, null, { timeout: 5000 });
        const pausedAt = (await audioState(s.page)).t;
        await s.page.waitForTimeout(800);
        assert.ok(Math.abs((await audioState(s.page)).t - pausedAt) < 0.05, 'time must not advance while paused');

        await playBtn(s.page).click(); // resume
        await playing(s.page, pausedAt + 0.3);

        await s.page.evaluate(() => (document.getElementById('audio-player').currentTime = 4)); // seek (needs Range support)
        await s.page.waitForFunction(
            () => {
                const a = document.getElementById('audio-player');
                return !a.seeking && a.currentTime >= 4 && !a.paused;
            },
            null,
            { timeout: 15000 }
        );

        const vol = await s.page.evaluate(() => {
            const a = document.getElementById('audio-player');
            a.volume = 0.25;
            return a.volume;
        });
        assert.equal(vol, 0.25);
        assert.equal((await audioState(s.page)).errCode, null);
    } finally {
        await s.close();
    }
});

test('switching track loads the new source and plays it', async () => {
    const s = await withResults();
    try {
        await row(s.page, 1001).click();
        await playing(s.page);
        await row(s.page, 1002).click();
        await s.page.waitForFunction(
            () => /\/1002\.wav/.test(document.getElementById('audio-player').currentSrc),
            null,
            { timeout: 20000 }
        );
        await playing(s.page);
        assert.match(await s.page.textContent('.now-playing-bar .title'), /Get Lucky/);
    } finally {
        await s.close();
    }
});

test('rapid track switching ends on the last clicked track, one stream playing, no errors', async () => {
    const s = await withResults();
    try {
        await row(s.page, 1001).click();
        await row(s.page, 1002).click();
        await row(s.page, 1003).click();
        await s.page.waitForFunction(
            () => /\/1003\.wav/.test(document.getElementById('audio-player').currentSrc),
            null,
            { timeout: 20000 }
        );
        await playing(s.page);
        await s.page.waitForTimeout(1500);
        const a = await audioState(s.page);
        assert.match(a.src, /1003\.wav$/);
        assert.equal(a.paused, false);
        assert.match(await s.page.textContent('.now-playing-bar .title'), /Around the World/);
        assert.deepEqual(s.pageErrors, []);
    } finally {
        await s.close();
    }
});

test('instance without /trackManifests/ support: falls back to the legacy /track/ endpoint', async () => {
    const s = await withResults({ stream: 'legacyOnly' });
    try {
        await row(s.page, 1001).click();
        await playing(s.page);
        assert.match((await audioState(s.page)).src, /1001\.wav$/);
        assert.ok(s.net.count(/\/track\/\?/) >= 1);
    } finally {
        await s.close();
    }
});

test('manifest response without attributes.uri: falls back to /track/ instead of failing', async () => {
    const s = await withResults({ stream: 'noUri' });
    try {
        await row(s.page, 1001).click();
        await playing(s.page);
    } finally {
        await s.close();
    }
});

test('signed manifest download fails (404): falls back to /track/', async () => {
    const s = await withResults({ stream: 'manifest404' });
    try {
        await row(s.page, 1001).click();
        await playing(s.page);
    } finally {
        await s.close();
    }
});

test('signed manifest download hangs: bounded by a timeout, then falls back', async () => {
    const s = await withResults({ stream: 'hang' });
    try {
        await row(s.page, 1001).click();
        await s.page.waitForFunction(() => !document.getElementById('audio-player').paused, null, { timeout: 60000 });
    } finally {
        await s.close();
    }
});

test('no stream can be resolved: visible error, play button reset, nothing "playing"', async () => {
    const s = await withResults({ stream: 'none' });
    try {
        await row(s.page, 1001).click();
        await s.page.waitForFunction(() => document.querySelector('#download-notifications .download-task'), null, {
            timeout: 60000,
        });
        const toasts = await toastTexts(s.page);
        assert.ok(
            toasts.some((t) => /Couldn't play this track/.test(t)),
            `expected a playback error toast, got ${JSON.stringify(toasts)}`
        );
        const a = await audioState(s.page);
        assert.equal(a.paused, true);
        assert.equal(a.src, '', 'no bogus source must be set');
    } finally {
        await s.close();
    }
});

test('provider goes down after search: error toast within a bounded time (no endless spinner)', async () => {
    const s = await withResults();
    try {
        s.net.opts.api = 'down';
        const t0 = Date.now();
        await row(s.page, 1001).click();
        await s.page.waitForFunction(() => document.querySelector('#download-notifications .download-task'), null, {
            timeout: 90000,
        });
        assert.ok(Date.now() - t0 < 80000);
        assert.ok((await toastTexts(s.page)).some((t) => /Couldn't play this track/.test(t)));
        assert.equal((await audioState(s.page)).paused, true);
    } finally {
        await s.close();
    }
});

test('stream URL returns bytes that are not audio: decode/support error is reported', async () => {
    const s = await withResults({ stream: 'badAudio' });
    try {
        await row(s.page, 1001).click();
        await s.page.waitForFunction(() => document.querySelector('#download-notifications .download-task'), null, {
            timeout: 60000,
        });
        assert.ok((await toastTexts(s.page)).some((t) => /Couldn't play this track/.test(t)));
        assert.equal((await audioState(s.page)).paused, true);
    } finally {
        await s.close();
    }
});

test('browser autoplay policy rejection (NotAllowedError): user is told to press Play, no retry loop', async () => {
    const s = await withResults(
        {},
        {
            init: () => {
                HTMLMediaElement.prototype.play = function () {
                    window.__playCalls = (window.__playCalls || 0) + 1;
                    return Promise.reject(
                        new DOMException('play() failed because the user did not interact', 'NotAllowedError')
                    );
                };
            },
        }
    );
    try {
        await row(s.page, 1001).click();
        await s.page.waitForFunction(() => document.querySelector('#download-notifications .download-task'), null, {
            timeout: 30000,
        });
        assert.ok((await toastTexts(s.page)).some((t) => /blocked autoplay/i.test(t)));
        await s.page.waitForTimeout(2500);
        assert.ok((await s.page.evaluate(() => window.__playCalls)) <= 2, 'must not hammer play() in a loop');
    } finally {
        await s.close();
    }
});
