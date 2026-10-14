// Deterministic fakes for the YouTube-based search/playback path:
//   * /api/search and /api/resolve run the REAL handlers from api/_lib.js on top of a fake `ytmusic-api` catalog,
//     so the frontend is tested against the real server code (mapping, ranking, error codes), not a hand-written reply;
//   * https://www.youtube.com/iframe_api is replaced by a fake IFrame Player with controllable behaviour per video id.
//
// IMPORTANT: this proves the *application* behaves correctly. It does NOT prove that real YouTube / ytmusic-api
// answer the way the fakes do; that can only be verified on the deployed site.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { createHandlers } = require(path.join(here, '..', '..', 'api', '_lib.js'));

/** Fake YouTube Music catalog. Ids look like real video ids (11 chars of [\w-]). */
export const CATALOG = [
    { id: 'omtAAAAAAAA', name: 'One More Time', artist: 'Daft Punk', album: 'Discovery', duration: 320, type: 'SONG' },
    {
        id: 'glAAAAAAAAA',
        name: 'Get Lucky',
        artist: 'Daft Punk',
        album: 'Random Access Memories',
        duration: 369,
        type: 'SONG',
    },
    {
        id: 'atwAAAAAAAA',
        name: 'Around the World',
        artist: 'Daft Punk',
        album: 'Homework',
        duration: 428,
        type: 'SONG',
    },
    {
        id: 'omtLiveAAAA',
        name: 'One More Time (Live)',
        artist: 'Daft Punk',
        album: 'Alive',
        duration: 400,
        type: 'SONG',
    },
    { id: 'omtVideoAAA', name: 'One More Time', artist: 'Daft Punk', album: '', duration: 321, type: 'VIDEO' },
    {
        id: 'blAAAAAAAAA',
        name: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        duration: 200,
        type: 'SONG',
    },
    { id: 'sbAAAAAAAAA', name: 'Starboy', artist: 'The Weeknd', album: 'Starboy', duration: 230, type: 'SONG' },
];
export const YT = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

const asYtMusic = (c) => ({
    type: c.type,
    videoId: c.id,
    name: c.name,
    artist: { name: c.artist, artistId: 'UC' + c.id },
    album: c.album ? { name: c.album, albumId: 'MP' + c.id } : null,
    duration: c.duration,
    thumbnails: [{ url: `https://lh3.googleusercontent.com/${c.id}=w60-h60-l90-rj`, width: 60, height: 60 }],
});

function match(query, type) {
    const words = String(query || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return [];
    return CATALOG.filter(
        (c) => c.type === type && words.every((w) => `${c.name} ${c.artist} ${c.album}`.toLowerCase().includes(w))
    ).map(asYtMusic);
}

/** The browser-side fake of https://www.youtube.com/iframe_api (executed inside the page). */
const FAKE_IFRAME_API = String.raw`
(function () {
  var cfg = (window.__ytCfg = window.__ytCfg || { behavior: {}, defaultBehavior: 'ok', startDelay: 60, durations: {} });
  var log = (window.__ytLog = window.__ytLog || []);
  function Player(mount, opts) {
    var self = this;
    this.opts = opts || {};
    this._state = -1; this._vid = null; this._t0 = 0; this._pos = 0; this._vol = 100; this._muted = false; this._rate = 1; this._timers = [];
    window.__yt = this;
    log.push({ fn: 'new', width: String(this.opts.width), height: String(this.opts.height), vars: this.opts.playerVars });
    var f = document.createElement('iframe');
    f.id = 'fake-yt-iframe'; f.width = this.opts.width; f.height = this.opts.height; f.setAttribute('srcdoc', '<title>fake youtube</title>');
    mount.parentNode.replaceChild(f, mount);
    setTimeout(function () { if (self.opts.events && self.opts.events.onReady) self.opts.events.onReady({ target: self }); }, 20);
  }
  Player.prototype = {
    _set: function (st) { this._state = st; var e = this.opts.events; if (e && e.onStateChange) e.onStateChange({ data: st, target: this }); },
    _later: function (ms, fn) { this._timers.push(setTimeout(fn.bind(this), ms)); },
    _clear: function () { this._timers.forEach(clearTimeout); this._timers = []; },
    _err: function (code) { var e = this.opts.events; if (e && e.onError) e.onError({ data: code, target: this }); },
    getPlayerState: function () { return this._state; },
    getDuration: function () { return this._vid ? (cfg.durations[this._vid] || 200) : 0; },
    getCurrentTime: function () {
      if (this._state === 1) return Math.min(this._pos + ((performance.now() - this._t0) / 1000) * this._rate, this.getDuration());
      return this._pos;
    },
    loadVideoById: function (a) {
      var id = typeof a === 'string' ? a : a.videoId, start = (a && a.startSeconds) || 0;
      log.push({ fn: 'loadVideoById', id: id, start: start });
      this._clear(); this._vid = id; this._pos = start;
      var b = cfg.behavior[id] || cfg.defaultBehavior;
      this._set(3);
      if (b === 'ok') this._later(cfg.startDelay, function () { this._t0 = performance.now(); this._set(1); });
      else if (/^err\d+$/.test(b)) this._later(cfg.startDelay, function () { this._set(-1); this._err(Number(b.slice(3))); });
      else if (b === 'blocked') this._later(cfg.startDelay, function () { this._set(5); });
      /* 'hang': stays in BUFFERING forever */
    },
    playVideo: function () {
      log.push({ fn: 'playVideo' });
      if (this._state === 2 || this._state === 5 || this._state === 0) { this._t0 = performance.now(); this._set(1); }
    },
    pauseVideo: function () {
      log.push({ fn: 'pauseVideo' });
      if (this._state === 1) { this._pos = this.getCurrentTime(); this._set(2); }
    },
    stopVideo: function () { log.push({ fn: 'stopVideo' }); this._clear(); this._pos = 0; this._vid = null; this._set(5); },
    seekTo: function (t) { log.push({ fn: 'seekTo', t: t }); this._pos = t; this._t0 = performance.now(); },
    setVolume: function (v) { log.push({ fn: 'setVolume', v: v }); this._vol = v; },
    getVolume: function () { return this._vol; },
    mute: function () { log.push({ fn: 'mute' }); this._muted = true; },
    unMute: function () { log.push({ fn: 'unMute' }); this._muted = false; },
    isMuted: function () { return this._muted; },
    setPlaybackRate: function (r) { log.push({ fn: 'setPlaybackRate', r: r }); this._rate = r; },
    getPlaybackRate: function () { return this._rate; },
    destroy: function () {},
    /* test helper: the video reached its end */
    finish: function () { this._pos = this.getDuration(); this._set(0); }
  };
  window.YT = { Player: Player, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  setTimeout(function () { if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady(); }, 10);
})();
`;

/**
 * @typedef {Object} YouTubeMockOptions
 * @property {'ok'|'down'|'zod'|'upstreamHang'|'http404'|'html'|'hang'|'http500'} [search]  /api/search behaviour
 *     down = ytmusic fails (-> real handler answers 502), zod = ytmusic response shape changed (502 upstream_changed),
 *     upstreamHang = ytmusic never answers (real handler's own deadline -> 504), http404 = functions not deployed,
 *     html = the SPA fallback answers with index.html, hang = the request is never answered, http500 = plain 500
 * @property {'ok'|'down'|'http404'} [resolve]  /api/resolve behaviour
 * @property {(query:string)=>number} [searchDelayMs]  artificial latency per search query
 * @property {'ok'|'fail'|'hang'} [iframeApi]  behaviour of https://www.youtube.com/iframe_api
 * @property {Record<string,string>} [behavior]  per video id: ok | err100 | err101 | err150 | err2 | blocked | hang
 */

/** Install the fakes on a Playwright page. Returns a live options object plus request counters. */
export async function installYouTubeMocks(page, opts = {}) {
    const o = {
        search: 'ok',
        resolve: 'ok',
        searchDelayMs: () => 0,
        iframeApi: 'ok',
        behavior: {},
        ...opts,
    };
    const hits = [];

    const broken = (kind) => async () => {
        if (kind === 'zod') throw Object.assign(new Error('response shape changed'), { name: 'ZodError' });
        if (kind === 'upstreamHang') return new Promise(() => {});
        throw new Error('mock: upstream refused the request');
    };
    const fakeYT = (mode) => ({
        searchSongs: async (q) => {
            if (mode() !== 'ok') return broken(mode())();
            return match(q, 'SONG');
        },
        searchVideos: async (q) => {
            if (mode() !== 'ok') return broken(mode())();
            return match(q, 'VIDEO');
        },
    });
    const searchApi = createHandlers({
        getYT: async () => fakeYT(() => (['down', 'zod', 'upstreamHang'].includes(o.search) ? o.search : 'ok')),
        deadlineMs: 1500,
    });
    const resolveApi = createHandlers({
        getYT: async () => fakeYT(() => (o.resolve === 'down' ? 'down' : 'ok')),
        deadlineMs: 1500,
    });

    const run = (handler, url) =>
        new Promise((resolve, reject) => {
            const query = Object.fromEntries(url.searchParams.entries());
            const res = {
                code: 200,
                headers: {},
                setHeader(k, v) {
                    this.headers[k.toLowerCase()] = String(v);
                },
                status(c) {
                    this.code = c;
                    return this;
                },
                send(b) {
                    resolve({ status: this.code, headers: this.headers, body: b });
                },
            };
            Promise.resolve(handler({ method: 'GET', query }, res)).catch(reject);
        });

    const cors = { 'access-control-allow-origin': '*' };
    const serve = async (route, kind, mode, handler) => {
        const u = new URL(route.request().url());
        hits.push({ kind, query: Object.fromEntries(u.searchParams.entries()), mode });
        if (mode === 'hang') return; // never answered
        if (mode === 'http404')
            return route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404: NOT_FOUND</h1>' });
        if (mode === 'html')
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title>' });
        if (mode === 'http500') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
        if (kind === 'search') {
            const delay = o.searchDelayMs(u.searchParams.get('q') || '');
            if (delay) await new Promise((r) => setTimeout(r, delay));
        }
        const r = await run(handler, u);
        return route.fulfill({
            status: r.status,
            contentType: 'application/json; charset=utf-8',
            headers: { ...cors, 'cache-control': r.headers['cache-control'] || 'no-store' },
            body: r.body,
        });
    };

    // Routes registered later win, so these override the generic "pass 127.0.0.1 through" rule of installMocks().
    await page.route('**/api/search*', (route) => serve(route, 'search', o.search, searchApi.search));
    await page.route('**/api/resolve*', (route) => serve(route, 'resolve', o.resolve, resolveApi.resolve));
    await page.route('https://www.youtube.com/**', (route) => {
        const u = new URL(route.request().url());
        hits.push({ kind: 'youtube', path: u.pathname });
        if (u.pathname !== '/iframe_api') return route.fulfill({ status: 404, body: '' });
        if (o.iframeApi === 'fail') return route.abort('connectionrefused');
        if (o.iframeApi === 'hang') return;
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_IFRAME_API });
    });
    await page.route(/^https:\/\/(lh3\.googleusercontent\.com|i\.ytimg\.com|yt3\.ggpht\.com)\//, (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: PNG_1X1 })
    );
    // per-video behaviour for the fake player
    await page.addInitScript((behavior) => {
        window.__ytCfg = { behavior: { ...behavior }, defaultBehavior: 'ok', startDelay: 60, durations: {} };
        window.__ytLog = [];
    }, o.behavior);

    return {
        hits,
        opts: o,
        count: (kind) => hits.filter((h) => h.kind === kind).length,
        /** Change the fake player's behaviour for video ids while the page is running. */
        setBehavior: (map) =>
            page.evaluate((m) => {
                Object.assign(window.__ytCfg.behavior, m);
            }, map),
        /** Calls the app made on the fake player (loadVideoById, pauseVideo, seekTo, ...). */
        log: (fn) => page.evaluate((f) => window.__ytLog.filter((e) => !f || e.fn === f), fn || null),
        /** The video reached its end. */
        finish: () => page.evaluate(() => window.__yt.finish()),
    };
}
