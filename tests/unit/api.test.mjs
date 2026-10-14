// Unit tests for the serverless helpers in api/_lib.js. `ytmusic-api` is replaced by a fake so the tests are
// deterministic and need no network (they prove our mapping, ranking and error handling, NOT that YouTube is up).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = require(path.join(here, '..', '..', 'api', '_lib.js'));
const { createHandlers, toTrack, score, rank, normalize } = lib;

const song = (videoId, name, artist, duration, extra = {}) => ({
    type: 'SONG',
    videoId,
    name,
    artist: { name: artist, artistId: 'UC' + videoId },
    duration,
    thumbnails: [{ url: `https://lh3.googleusercontent.com/${videoId}=w60-h60-l90-rj`, width: 60, height: 60 }],
    ...extra,
});

function call(handler, { query = {}, method = 'GET' } = {}) {
    return new Promise((resolve, reject) => {
        const res = {
            code: 0,
            headers: {},
            setHeader(k, v) {
                this.headers[k.toLowerCase()] = v;
            },
            status(c) {
                this.code = c;
                return this;
            },
            send(b) {
                resolve({ code: this.code, headers: this.headers, body: JSON.parse(b) });
            },
        };
        Promise.resolve(handler({ method, query }, res)).catch(reject);
    });
}

const fakeYT = (over = {}) => ({
    searchSongs: async () => [],
    searchVideos: async () => [],
    ...over,
});

test('toTrack: maps a YouTube Music song to the HidzMusify track shape', () => {
    const t = toTrack(
        song('abcDEF12345', 'Where My Money', 'Chris Travis', 227, { album: { name: 'Album X' } }),
        'song'
    );
    assert.equal(t.id, 'yt:abcDEF12345');
    assert.equal(t.hzYt, 'abcDEF12345');
    assert.equal(t.title, 'Where My Money');
    assert.equal(t.duration, 227);
    assert.equal(t.artists[0].name, 'Chris Travis');
    assert.equal(t.artist.name, 'Chris Travis');
    assert.equal(t.album.title, 'Album X');
    assert.equal(t.album.id, '', 'no album id: album links must not navigate to the (unavailable) album page');
    assert.match(t.cover, /=w544-h544/, 'small thumbnail is upscaled');
    assert.equal(t.kind, 'song');
});

test('toTrack: artist arrays, missing artist and invalid ids', () => {
    const multi = toTrack(
        { videoId: 'abcDEF12345', name: 'X', artist: [{ name: 'A' }, { name: 'B' }], duration: 10 },
        'video'
    );
    assert.deepEqual(
        multi.artists.map((a) => a.name),
        ['A', 'B']
    );
    assert.equal(multi.kind, 'video');
    const none = toTrack({ videoId: 'abcDEF12345', name: '', duration: undefined, thumbnails: [] }, 'song');
    assert.equal(none.artists[0].name, 'Unknown Artist');
    assert.equal(none.title, 'Unknown Title');
    assert.equal(none.duration, 0);
    assert.equal(toTrack({ videoId: '<script>', name: 'x' }, 'song'), null);
    assert.equal(toTrack({ name: 'x' }, 'song'), null);
});

test('toTrack: only https thumbnails are accepted', () => {
    const t = toTrack(
        { videoId: 'abcDEF12345', name: 'X', thumbnails: [{ url: 'javascript:alert(1)', width: 1 }] },
        'song'
    );
    assert.equal(t.cover, '');
});

test('normalize: accents, brackets and punctuation', () => {
    assert.equal(normalize('Beyoncé – Halo (feat. X) [Official Video]'), 'beyonce halo');
});

const target = { title: 'Where My Money', artist: 'Chris Travis', duration: 227 };
const cand = (id, title, artist, duration, kind = 'song') => toTrack(song(id, title, artist, duration), kind);

test('score/rank: the exact recording wins, other recordings are rejected', () => {
    const list = [
        cand('liveAAAAAAA', 'Where My Money (Live)', 'Chris Travis', 262),
        cand('exactAAAAAA', 'Where My Money', 'Chris Travis', 228),
        cand('otherSong11', 'Money Trees', 'Chris Travis', 227),
        cand('wrongArtist', 'Where My Money', 'Someone Else', 227),
        cand('longVideoAA', 'Where My Money', 'Chris Travis', 1800, 'video'),
    ];
    const ranked = rank(target, list);
    assert.equal(ranked[0].hzYt, 'exactAAAAAA');
    assert.ok(ranked[0].score > 0.9);
    assert.ok(!ranked.some((r) => r.hzYt === 'liveAAAAAAA'), 'live version rejected');
    assert.ok(!ranked.some((r) => r.hzYt === 'otherSong11'), 'different song rejected');
    assert.ok(!ranked.some((r) => r.hzYt === 'longVideoAA'), 'a 30 minute video is not a 3:47 song');
});

test('score: a variant the user asked for is not penalised; unknown duration is neutral', () => {
    const live = { title: 'Song (Live)', artist: 'Band', duration: 200 };
    assert.ok(score(live, cand('liveSongAAA', 'Song (Live)', 'Band', 201)) > 0.9);
    const noDur = { title: 'Where My Money', artist: 'Chris Travis', duration: 0 };
    assert.ok(score(noDur, cand('exactAAAAAA', 'Where My Money', 'Chris Travis', 228)) >= lib.MIN_SCORE);
});

test('rank: exclude list and duplicates', () => {
    const a = cand('exactAAAAAA', 'Where My Money', 'Chris Travis', 227);
    assert.equal(rank(target, [a, a]).length, 1);
    assert.equal(rank(target, [a], ['exactAAAAAA']).length, 0);
});

test('/api/search: validation', async () => {
    const { search } = createHandlers({ getYT: async () => fakeYT() });
    assert.equal((await call(search, { query: {} })).code, 400);
    assert.equal((await call(search, { query: { q: '   ' } })).code, 400);
    assert.equal((await call(search, { query: { q: 'x'.repeat(201) } })).code, 400);
    assert.equal((await call(search, { query: { q: 'ok' }, method: 'POST' })).code, 405);
});

test('/api/search: songs first, videos fill in, duplicates removed, limit honoured', async () => {
    const yt = fakeYT({
        searchSongs: async () => [song('songAAAAAAA', 'S1', 'A', 100), song('songBBBBBBB', 'S2', 'A', 100)],
        searchVideos: async () => [song('songAAAAAAA', 'S1', 'A', 100), song('videoCCCCCC', 'V1', 'A', 100)],
    });
    const { search } = createHandlers({ getYT: async () => yt });
    const r = await call(search, { query: { q: 'abc' } });
    assert.equal(r.code, 200);
    assert.deepEqual(
        r.body.items.map((t) => t.hzYt),
        ['songAAAAAAA', 'songBBBBBBB', 'videoCCCCCC']
    );
    assert.match(r.headers['cache-control'], /s-maxage/);
    const limited = await call(search, { query: { q: 'abc', limit: '1' } });
    assert.equal(limited.body.items.length, 1);
});

test('/api/search: no results is a 200 with an empty list and is not cached', async () => {
    const { search } = createHandlers({ getYT: async () => fakeYT() });
    const r = await call(search, { query: { q: 'zzzz' } });
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.items, []);
    assert.equal(r.headers['cache-control'], 'no-store');
});

test('/api/search: one failing list does not hide the other', async () => {
    const yt = fakeYT({
        searchSongs: async () => {
            throw Object.assign(new Error('zod'), { name: 'ZodError' });
        },
        searchVideos: async () => [song('videoCCCCCC', 'V1', 'A', 100)],
    });
    const { search } = createHandlers({ getYT: async () => yt });
    const r = await call(search, { query: { q: 'abc' } });
    assert.equal(r.code, 200);
    assert.equal(r.body.items.length, 1);
});

test('/api/search: outage is an error, never an empty "success"', async () => {
    const boom = async () => {
        throw new Error('403');
    };
    const { search } = createHandlers({ getYT: async () => fakeYT({ searchSongs: boom, searchVideos: boom }) });
    const r = await call(search, { query: { q: 'abc' } });
    assert.equal(r.code, 502);
    assert.equal(r.body.error, 'upstream_error');
    assert.ok(!('items' in r.body));

    const zod = async () => {
        throw Object.assign(new Error('shape'), { name: 'ZodError' });
    };
    const z = createHandlers({ getYT: async () => fakeYT({ searchSongs: zod, searchVideos: zod }) });
    const rz = await call(z.search, { query: { q: 'abc' } });
    assert.equal(rz.code, 502);
    assert.equal(rz.body.error, 'upstream_changed');

    const init = createHandlers({
        getYT: async () => {
            throw new Error('init failed');
        },
    });
    assert.equal((await call(init.search, { query: { q: 'abc' } })).code, 502);
});

test('/api/search: a hanging upstream ends with 504 inside the deadline', async () => {
    const { search } = createHandlers({ getYT: () => new Promise(() => {}), deadlineMs: 60 });
    const t0 = Date.now();
    const r = await call(search, { query: { q: 'abc' } });
    assert.equal(r.code, 504);
    assert.equal(r.body.error, 'timeout');
    assert.ok(Date.now() - t0 < 1500);
});

test('/api/resolve: ranked candidates for a library track, with exclusions', async () => {
    const yt = fakeYT({
        searchSongs: async () => [
            song('liveAAAAAAA', 'Where My Money (Live)', 'Chris Travis', 262),
            song('exactAAAAAA', 'Where My Money', 'Chris Travis', 228),
        ],
    });
    const { resolve } = createHandlers({ getYT: async () => yt });
    const q = { title: 'Where My Money', artist: 'Chris Travis', duration: '227' };
    const r = await call(resolve, { query: q });
    assert.equal(r.code, 200);
    assert.deepEqual(
        r.body.candidates.map((c) => c.hzYt),
        ['exactAAAAAA']
    );
    const ex = await call(resolve, { query: { ...q, exclude: 'exactAAAAAA,<bad>' } });
    assert.deepEqual(ex.body.candidates, []);
    assert.equal(ex.headers['cache-control'], 'no-store');
});

test('/api/resolve: falls back to videos when no song matches well; validation; outage', async () => {
    const yt = fakeYT({
        searchSongs: async () => [song('otherSong11', 'Something Else', 'Nobody', 100)],
        searchVideos: async () => [song('videoMatchA', 'Where My Money', 'Chris Travis', 229)],
    });
    const { resolve } = createHandlers({ getYT: async () => yt });
    const r = await call(resolve, { query: { title: 'Where My Money', artist: 'Chris Travis', duration: '227' } });
    assert.equal(r.body.candidates[0].hzYt, 'videoMatchA');

    assert.equal((await call(resolve, { query: {} })).code, 400);
    const boom = async () => {
        throw new Error('403');
    };
    const down = createHandlers({ getYT: async () => fakeYT({ searchSongs: boom, searchVideos: boom }) });
    assert.equal((await call(down.resolve, { query: { title: 'x' } })).code, 502);
});
