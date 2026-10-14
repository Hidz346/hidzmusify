'use strict';
/*
 * HidzMusify server helpers (Vercel Node functions: /api/search and /api/resolve).
 *
 * - No secrets, no cookies, no user data. Same-origin only (the site calls /api/* on its own domain).
 * - Data source: YouTube Music through the unofficial `ytmusic-api` package (same package + calls as the
 *   MUSIK source this was adapted from). Being unofficial, it can stop working when YouTube changes; every
 *   failure is reported to the caller as an honest error (never fake or empty "success").
 * - Files starting with `_` inside /api are helpers, not routes.
 */

const MAX_TEXT = 200;
const DEADLINE_MS = 8000;
const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';
const MIN_SCORE = 0.5;
const MIN_TITLE = 0.6;

/** Words that mark a different recording than the one asked for (penalised unless the target has them too). */
const VARIANT_WORDS = new Set([
    'live',
    'cover',
    'karaoke',
    'instrumental',
    'remix',
    'slowed',
    'reverb',
    'sped',
    'nightcore',
    '8d',
    'acoustic',
    'mashup',
    'tribute',
    'demo',
    'reaction',
    'tutorial',
    'lesson',
    'concert',
]);
const STOP_WORDS = new Set([
    'the',
    'a',
    'an',
    'of',
    'feat',
    'ft',
    'featuring',
    'official',
    'audio',
    'video',
    'lyrics',
    'lyric',
    'hd',
    'hq',
    'remastered',
    'remaster',
    'version',
    'music',
    'visualizer',
]);

const clean = (s) =>
    String(s == null ? '' : s)
        .replace(/\s+/g, ' ')
        .trim();

/** Lower-case, strip accents/brackets/punctuation. Brackets usually hold "(feat. X)", "[Official Video]" noise. */
function normalize(s) {
    return clean(s)
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function tokens(s) {
    return new Set(
        normalize(s)
            .split(' ')
            .filter((w) => w && !STOP_WORDS.has(w))
    );
}

/** Bracketed text also counts for variant detection ("Song (Live)"), so look at the raw lower-cased words too. */
function variantTokens(s) {
    const raw = clean(s)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(' ');
    return new Set(raw.filter((w) => VARIANT_WORDS.has(w)));
}

function overlap(a, b) {
    let n = 0;
    for (const x of a) if (b.has(x)) n++;
    return n;
}

function artistNames(item) {
    const a = Array.isArray(item && item.artist) ? item.artist : item && item.artist ? [item.artist] : [];
    return a.filter((x) => x && x.name).map((x) => ({ id: x.artistId ? String(x.artistId) : '', name: clean(x.name) }));
}

/** Upscale Google/YouTube thumbnail URLs; accept https only. */
function highRes(url) {
    const u = String(url || '');
    if (!/^https:\/\//i.test(u)) return '';
    return u
        .replace(/=w\d+-h\d+[^/]*$/, '=w544-h544-l90-rj')
        .replace(/\/(?:default|mqdefault|hqdefault)\.jpg$/, '/hqdefault.jpg');
}

function bestThumb(thumbs) {
    if (!Array.isArray(thumbs) || !thumbs.length) return '';
    const sorted = [...thumbs].filter((t) => t && t.url).sort((a, b) => (b.width || 0) - (a.width || 0));
    return highRes(sorted.length ? sorted[0].url : '');
}

/** ytmusic-api SongDetailed / VideoDetailed -> the track shape the HidzMusify UI renders. */
function toTrack(item, kind) {
    const videoId = clean(item && item.videoId);
    if (!/^[\w-]{6,20}$/.test(videoId)) return null;
    const artists = artistNames(item);
    const cover = bestThumb(item.thumbnails);
    const album = item.album && item.album.name ? clean(item.album.name) : '';
    const list = artists.length ? artists : [{ id: '', name: 'Unknown Artist' }];
    return {
        id: 'yt:' + videoId,
        hzYt: videoId,
        title: clean(item.name) || 'Unknown Title',
        duration: Number.isFinite(Number(item.duration)) ? Math.round(Number(item.duration)) : 0,
        explicit: Boolean(item.isExplicit),
        artist: list[0],
        artists: list,
        album: { id: '', title: album, cover },
        image: cover,
        cover,
        type: 'track',
        trackNumber: 1,
        volumeNumber: 1,
        source: 'youtube',
        kind: kind === 'video' ? 'video' : 'song',
    };
}

/** How well `cand` (a track from toTrack) matches what the library entry asked for. Range about -1..1. */
function score(target, cand) {
    const tt = tokens(target.title);
    const ct = tokens(cand.title);
    let titleScore = 0;
    if (tt.size && ct.size) {
        const hit = overlap(tt, ct);
        titleScore = (hit / tt.size) * 0.75 + (hit / ct.size) * 0.25;
    }

    // Hard gate: the title must match on its own. Artist + duration alone must never turn a different song of the
    // same artist into a "match".
    if (titleScore < MIN_TITLE) return -1;

    const ta = tokens(target.artist);
    let artistScore = 0.5; // unknown artist: neutral
    if (ta.size) {
        const pool = new Set([...tokens(cand.artists.map((a) => a.name).join(' ')), ...ct]);
        artistScore = overlap(ta, pool) / ta.size;
    }

    let durScore = 0.3; // unknown duration: neutral
    const td = Number(target.duration) || 0;
    if (td > 0 && cand.duration > 0) {
        const d = Math.abs(td - cand.duration);
        durScore = d <= 2 ? 1 : d <= 5 ? 0.8 : d <= 10 ? 0.4 : d <= 20 ? 0.1 : -0.6;
    }

    const wanted = new Set([...variantTokens(target.title), ...variantTokens(target.artist)]);
    let penalty = 0;
    for (const w of variantTokens(cand.title)) if (!wanted.has(w)) penalty += 0.35;

    return (
        0.45 * titleScore +
        0.2 * artistScore +
        0.3 * durScore +
        (cand.kind === 'song' ? 0.05 : 0) -
        Math.min(penalty, 0.7)
    );
}

function rank(target, candidates, exclude) {
    const skip = new Set(exclude || []);
    const seen = new Set();
    const out = [];
    for (const c of candidates) {
        if (!c || skip.has(c.hzYt) || seen.has(c.hzYt)) continue;
        seen.add(c.hzYt);
        const s = score(target, c);
        if (s >= MIN_SCORE) out.push({ ...c, score: Math.round(s * 1000) / 1000 });
    }
    return out.sort((a, b) => b.score - a.score);
}

function withDeadline(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Music source timed out'), { code: 'ETIMEDOUT' })), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** `ytmusic-api` is loaded lazily (cold start cost only on first use) and re-initialised after a failure. */
let ytPromise = null;
async function defaultGetYT() {
    if (!ytPromise) {
        ytPromise = (async () => {
            const mod = await import('ytmusic-api');
            const cand = [mod.default && mod.default.default, mod.default, mod.YTMusic];
            const YTMusic = cand.find((c) => typeof c === 'function');
            if (!YTMusic) throw new Error('ytmusic-api: unexpected module shape');
            const yt = new YTMusic();
            await yt.initialize();
            return yt;
        })().catch((err) => {
            ytPromise = null;
            throw err;
        });
    }
    return ytPromise;
}

function query(req) {
    if (req && req.query && typeof req.query === 'object') return req.query;
    try {
        return Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
    } catch (_) {
        return {};
    }
}

function send(res, status, body, cache) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cache || 'no-store');
    res.status(status).send(JSON.stringify(body));
}

function failure(res, err) {
    const zod = err && err.name === 'ZodError';
    if (err && err.code === 'ETIMEDOUT')
        return send(res, 504, { error: 'timeout', message: 'The music source took too long to answer.' });
    if (zod)
        return send(res, 502, {
            error: 'upstream_changed',
            message: 'The music source returned an unexpected format.',
        });
    console.error('[hidzmusify-api]', err && (err.stack || err.message || err));
    return send(res, 502, { error: 'upstream_error', message: 'Could not reach the music source.' });
}

/**
 * Runs one upstream list call. A failure in one list (songs OR videos) must not hide the other list, but if
 * every list fails the caller re-throws the first error, so an upstream outage is never shown as "no results".
 */
async function attempt(fn) {
    try {
        const r = await fn();
        return { list: Array.isArray(r) ? r : [], err: null };
    } catch (err) {
        return { list: [], err };
    }
}

function createHandlers({ getYT = defaultGetYT, deadlineMs = DEADLINE_MS } = {}) {
    async function search(req, res) {
        if (req.method && req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
        const q = clean(query(req).q);
        if (!q) return send(res, 400, { error: 'missing_query', message: 'Query is required.' });
        if (q.length > MAX_TEXT) return send(res, 400, { error: 'query_too_long', message: 'Query is too long.' });
        const limit = Math.min(Math.max(parseInt(query(req).limit, 10) || 25, 1), 40);
        try {
            const items = await withDeadline(
                (async () => {
                    const yt = await getYT();
                    // Sequential on purpose: parallel requests tend to trigger 403s from the upstream.
                    const a = await attempt(() => yt.searchSongs(q));
                    const songs = a.list.map((x) => toTrack(x, 'song'));
                    let videos = [];
                    let err = a.err;
                    if (songs.filter(Boolean).length < 8) {
                        const v = await attempt(() => yt.searchVideos(q));
                        videos = v.list.map((x) => toTrack(x, 'video'));
                        err = err || v.err;
                    }
                    const all = [...songs, ...videos].filter(Boolean);
                    if (!all.length && err) throw err;
                    const seen = new Set();
                    return all.filter((t) => !seen.has(t.hzYt) && seen.add(t.hzYt)).slice(0, limit);
                })(),
                deadlineMs
            );
            return send(res, 200, { items, total: items.length }, items.length ? CACHE_OK : 'no-store');
        } catch (err) {
            return failure(res, err);
        }
    }

    async function resolve(req, res) {
        if (req.method && req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
        const p = query(req);
        const title = clean(p.title);
        const artist = clean(p.artist);
        if (!title) return send(res, 400, { error: 'missing_title', message: 'Title is required.' });
        if (title.length > MAX_TEXT || artist.length > MAX_TEXT) return send(res, 400, { error: 'text_too_long' });
        const duration = Number(p.duration) > 0 ? Number(p.duration) : 0;
        const exclude = clean(p.exclude)
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^[\w-]{6,20}$/.test(s))
            .slice(0, 10);
        const target = { title, artist, duration };
        try {
            const candidates = await withDeadline(
                (async () => {
                    const yt = await getYT();
                    const q = clean(`${artist} ${title}`);
                    const a = await attempt(() => yt.searchSongs(q));
                    const songs = a.list.map((x) => toTrack(x, 'song'));
                    let ranked = rank(target, songs, exclude);
                    let err = a.err;
                    if (!ranked.length || ranked[0].score < 0.8) {
                        const v = await attempt(() => yt.searchVideos(q));
                        const videos = v.list.map((x) => toTrack(x, 'video'));
                        ranked = rank(target, [...songs, ...videos], exclude);
                        err = err || v.err;
                    }
                    if (!ranked.length && err) throw err;
                    return ranked.slice(0, 5);
                })(),
                deadlineMs
            );
            return send(res, 200, { candidates }, candidates.length ? CACHE_OK : 'no-store');
        } catch (err) {
            return failure(res, err);
        }
    }

    return { search, resolve };
}

module.exports = { createHandlers, toTrack, score, rank, normalize, tokens, highRes, MIN_SCORE };
