// Deterministic fake of every external dependency HidzMusify talks to, installed through Playwright
// request interception. No real network is used, so tests do not depend on upstream uptime or
// authorization. The mock follows the upstream-documented hifi-API contract (see Monochrome js/HiFi.ts):
//   /search/?q=|s=|a=|al=|p=|v=      -> { version, data: { tracks|artists|albums|playlists|videos: { items } } }
//   /info/?id=                        -> { version, data: { id, title, isrc?, ... } }
//   /trackManifests/?id=...           -> { version, data: { data: { id, type, attributes: { uri, formats, ... } }, links } }
//   /track/?id=&quality=              -> { version, data: { manifest(base64 json), trackId, ... } }   (legacy playbackinfo)
//   attributes.uri                    -> signed manifest document; here JSON { urls: [audio] }
//
// IMPORTANT: this proves the *application* behaves correctly against a contract-conformant server.
// It does NOT prove the real upstream servers are reachable or that they authorize this domain.

const API_HOSTS = new Set([
    'api.monochrome.tf',
    'monochrome-api.samidy.com',
    'hifi.geeked.wtf',
    'wolf.qqdl.site',
    'maus.qqdl.site',
    'vogel.qqdl.site',
    'katze.qqdl.site',
    'hund.qqdl.site',
    'tidal.kinoplus.online',
    'eu-central.monochrome.tf',
    'us-west.monochrome.tf',
    'arran.monochrome.tf',
]);

export const CDN_HOST = 'mock-cdn.test';

const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

/** 16-bit PCM mono WAV with a sine tone. */
export function makeWav({ seconds = 6, freq = 440, rate = 8000 } = {}) {
    const n = seconds * rate;
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000), i * 2);
    const h = Buffer.alloc(44);
    h.write('RIFF', 0);
    h.writeUInt32LE(36 + data.length, 4);
    h.write('WAVEfmt ', 8);
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(1, 22);
    h.writeUInt32LE(rate, 24);
    h.writeUInt32LE(rate * 2, 28);
    h.writeUInt16LE(2, 32);
    h.writeUInt16LE(16, 34);
    h.write('data', 36);
    h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
}

const ALBUMS = {
    2001: { id: 2001, title: 'Discovery', cover: '11111111-1111-1111-1111-111111111111', releaseDate: '2001-03-12' },
    2002: {
        id: 2002,
        title: 'Random Access Memories',
        cover: '22222222-2222-2222-2222-222222222222',
        releaseDate: '2013-05-17',
    },
    2003: { id: 2003, title: 'Homework', cover: '33333333-3333-3333-3333-333333333333', releaseDate: '1997-01-20' },
    2004: { id: 2004, title: 'After Hours', cover: '44444444-4444-4444-4444-444444444444', releaseDate: '2020-03-20' },
};
const ARTISTS = {
    11: { id: 11, name: 'Daft Punk', picture: '55555555-5555-5555-5555-555555555555', type: 'MAIN' },
    12: { id: 12, name: 'The Weeknd', picture: '66666666-6666-6666-6666-666666666666', type: 'MAIN' },
};

export const TRACKS = [
    { id: 1001, title: 'One More Time', duration: 320, artist: 11, album: 2001, isrc: 'FRZ030000001' },
    { id: 1002, title: 'Get Lucky', duration: 369, artist: 11, album: 2002 },
    { id: 1003, title: 'Around the World', duration: 428, artist: 11, album: 2003 },
    { id: 2001, title: 'Blinding Lights', duration: 200, artist: 12, album: 2004 },
    { id: 2002, title: 'Starboy', duration: 230, artist: 12, album: 2004 },
].map((t) => ({
    id: t.id,
    title: t.title,
    duration: t.duration,
    isrc: t.isrc,
    explicit: false,
    allowStreaming: true,
    streamReady: true,
    audioQuality: 'LOSSLESS',
    audioModes: ['STEREO'],
    mediaMetadata: { tags: ['LOSSLESS'] },
    trackNumber: 1,
    volumeNumber: 1,
    artist: ARTISTS[t.artist],
    artists: [ARTISTS[t.artist]],
    album: ALBUMS[t.album],
}));

function matchTracks(q) {
    const words = String(q || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return [];
    return TRACKS.filter((t) => {
        const hay = `${t.title} ${t.artist.name} ${t.album.title}`.toLowerCase();
        return words.every((w) => hay.includes(w));
    });
}

const section = (items) => ({ items, limit: items.length, offset: 0, totalNumberOfItems: items.length });

function uniq(arr, key) {
    const m = new Map();
    for (const x of arr) m.set(x[key], x);
    return [...m.values()];
}

/**
 * @typedef {Object} MockOptions
 * @property {'ok'|'fail'|'hang'} [tidalAuth]     auth.tidal.com/v1/oauth2/token behaviour
 * @property {'ok'|'fail'|'hang'} [contributors]  api.samidy.com/api/contributors behaviour
 * @property {'ok'|'down'|'http500'|'hang'|'garbage'} [api]  behaviour of every hifi-API instance
 * @property {'ok'|'noUri'|'manifest404'|'legacyOnly'|'none'|'badAudio'|'hang'} [stream] stream resolution behaviour (none = neither /trackManifests/ nor /track/ can resolve)
 * @property {(query:string)=>number} [searchDelayMs]  artificial latency per search query
 * @property {boolean} [qobuzFail]               make Qobuz hosts fail fast (default true)
 */

/**
 * Install the fake network on a Playwright page (or context).
 * @returns {{ hits: Array<{t:number, method:string, host:string, path:string}>, count: (re:RegExp)=>number, wav: Buffer }}
 */
export async function installMocks(page, opts = {}) {
    const o = {
        tidalAuth: 'ok',
        contributors: 'ok',
        api: 'ok',
        stream: 'ok',
        searchDelayMs: () => 0,
        qobuzFail: true,
        ...opts,
    };
    const wav = makeWav();
    const hits = [];
    const t0 = Date.now();
    const json = (route, body, status = 200) =>
        route.fulfill({
            status,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify(body),
        });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

    await page.route('**/*', async (route) => {
        const req = route.request();
        const u = new URL(req.url());
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.continue();
        hits.push({ t: Date.now() - t0, method: req.method(), host: u.hostname, path: u.pathname + u.search });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors } });

        // ---- TIDAL OAuth ----
        if (u.hostname === 'auth.tidal.com') {
            if (o.tidalAuth === 'hang') return; // never answered
            if (o.tidalAuth === 'fail') return route.abort('connectionrefused');
            return json(route, { access_token: 'mock-app-token', expires_in: 3600, token_type: 'Bearer' });
        }
        // direct TIDAL APIs are the last-resort fallback; keep them unavailable in the mock so the tests
        // exercise the instance path (and so a fallback can never mask a bug).
        if (u.hostname === 'api.tidal.com' || u.hostname === 'openapi.tidal.com') {
            return route.fulfill({ status: 503, headers: cors, body: 'mock: direct TIDAL unavailable' });
        }
        // ---- misc third parties ----
        if (u.hostname === 'api.samidy.com' && u.pathname === '/api/contributors') {
            if (o.contributors === 'hang') return;
            if (o.contributors === 'fail') return route.abort('connectionrefused');
            return json(route, []);
        }
        if (u.hostname === 'auth.samidy.com') {
            // credentialed request -> CORS needs the exact origin + allow-credentials (a wildcard is rejected by browsers)
            return route.fulfill({
                status: 401,
                contentType: 'application/json',
                headers: {
                    'access-control-allow-origin': req.headers()['origin'] || '*',
                    'access-control-allow-credentials': 'true',
                },
                body: '{"message":"unauthorized"}',
            });
        }
        if (u.hostname.startsWith('tidal-uptime.')) return route.fulfill({ status: 404, headers: cors, body: '' });
        if (
            u.hostname === 'resources.tidal.com' ||
            u.hostname === 'images.monochrome.qzz.io' ||
            u.hostname === 'wsrv.nl'
        )
            return route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: PNG_1X1 });
        if (u.hostname.includes('qobuz') || u.hostname.includes('run.app')) {
            return o.qobuzFail
                ? route.abort('connectionrefused')
                : route.fulfill({ status: 404, headers: cors, body: '' });
        }

        // ---- signed manifest + audio CDN ----
        if (u.hostname === CDN_HOST) {
            const m = u.pathname.match(/^\/manifests\/(\d+)\.json$/);
            if (m) {
                if (o.stream === 'manifest404') return route.fulfill({ status: 404, headers: cors, body: 'nope' });
                if (o.stream === 'hang') return;
                return route.fulfill({
                    status: 200,
                    contentType: 'application/vnd.tidal.bts',
                    headers: cors,
                    body: JSON.stringify({
                        mimeType: 'audio/wav',
                        codecs: 'pcm',
                        encryptionType: 'NONE',
                        urls: [`https://${CDN_HOST}/audio/${m[1]}.wav`],
                    }),
                });
            }
            if (/^\/audio\/\d+\.wav$/.test(u.pathname)) {
                if (o.stream === 'badAudio')
                    return route.fulfill({
                        status: 200,
                        contentType: 'audio/wav',
                        headers: cors,
                        body: Buffer.from('this is not audio'),
                    });
                const range = req.headers()['range'];
                if (range) {
                    const mm = /bytes=(\d+)-(\d*)/.exec(range);
                    const start = Number(mm[1]);
                    const end = mm[2] ? Math.min(Number(mm[2]), wav.length - 1) : wav.length - 1;
                    return route.fulfill({
                        status: 206,
                        contentType: 'audio/wav',
                        headers: {
                            ...cors,
                            'accept-ranges': 'bytes',
                            'content-range': `bytes ${start}-${end}/${wav.length}`,
                        },
                        body: wav.subarray(start, end + 1),
                    });
                }
                return route.fulfill({
                    status: 200,
                    contentType: 'audio/wav',
                    headers: { ...cors, 'accept-ranges': 'bytes' },
                    body: wav,
                });
            }
            return route.fulfill({ status: 404, headers: cors, body: '' });
        }

        // ---- hifi-API instances ----
        if (API_HOSTS.has(u.hostname)) {
            if (o.api === 'down') return route.abort('connectionrefused');
            if (o.api === 'hang') return;
            if (o.api === 'http500') return route.fulfill({ status: 500, headers: cors, body: 'mock: internal error' });
            if (o.api === 'garbage')
                return route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    headers: cors,
                    body: '<html>not json</html>',
                });
            const p = u.pathname.replace(/\/+$/, '');
            const q = u.searchParams;

            if (p === '/search') {
                const query = q.get('q') ?? q.get('s') ?? q.get('a') ?? q.get('al') ?? q.get('p') ?? q.get('v') ?? '';
                const delay = o.searchDelayMs(query);
                if (delay) await new Promise((r) => setTimeout(r, delay));
                if (/boom/i.test(query))
                    return route.fulfill({ status: 500, headers: cors, body: 'mock: search exploded' });
                const tracks = matchTracks(query);
                const artists = uniq(
                    tracks.map((t) => t.artist),
                    'id'
                );
                const albums = uniq(
                    tracks.map((t) => t.album),
                    'id'
                );
                if (q.has('q'))
                    return json(route, {
                        version: '2.7',
                        data: {
                            tracks: section(tracks),
                            artists: section(artists),
                            albums: section(albums),
                            playlists: section([]),
                            videos: section([]),
                        },
                    });
                if (q.has('s')) return json(route, { version: '2.7', data: section(tracks) });
                if (q.has('a')) return json(route, { version: '2.7', data: { artists: section(artists) } });
                if (q.has('al')) return json(route, { version: '2.7', data: { albums: section(albums) } });
                return json(route, { version: '2.7', data: section([]) });
            }
            if (p === '/info') {
                const t = TRACKS.find((x) => String(x.id) === q.get('id'));
                return t ? json(route, { version: '2.7', data: t }) : json(route, { detail: 'not found' }, 404);
            }
            if (p === '/album') {
                const a = ALBUMS[q.get('id')];
                if (!a) return json(route, { detail: 'not found' }, 404);
                const items = TRACKS.filter((t) => t.album.id === a.id).map((item) => ({ item, type: 'track' }));
                return json(route, {
                    version: '2.7',
                    data: { ...a, numberOfTracks: items.length, artist: ARTISTS[11], artists: [ARTISTS[11]], items },
                });
            }
            if (p === '/trackManifests') {
                const id = q.get('id');
                if (o.stream === 'legacyOnly' || o.stream === 'none')
                    return json(route, { detail: 'trackManifests not supported on this instance' }, 404);
                const attributes = {
                    trackPresentation: 'FULL',
                    uri: o.stream === 'noUri' ? undefined : `https://${CDN_HOST}/manifests/${id}.json`,
                    hash: 'mockhash',
                    formats: ['FLAC'],
                    albumAudioNormalizationData: { replayGain: -7.2, peakAmplitude: 0.98 },
                    trackAudioNormalizationData: { replayGain: -8.1, peakAmplitude: 0.99 },
                };
                return json(route, {
                    version: '2.7',
                    data: {
                        data: { id, type: 'trackManifests', attributes },
                        links: { self: `/trackManifests/${id}` },
                    },
                });
            }
            if (p === '/track') {
                const id = q.get('id');
                if (o.stream === 'none') return json(route, { detail: 'track not found' }, 404);
                const manifest = Buffer.from(
                    JSON.stringify({
                        mimeType: 'audio/wav',
                        codecs: 'pcm',
                        encryptionType: 'NONE',
                        urls: [`https://${CDN_HOST}/audio/${id}.wav`],
                    })
                ).toString('base64');
                return json(route, {
                    version: '2.7',
                    data: {
                        trackId: Number(id),
                        assetPresentation: 'FULL',
                        audioQuality: 'LOSSLESS',
                        manifestMimeType: 'application/vnd.tidal.bts',
                        manifest,
                    },
                });
            }
            // everything else (recommendations, mixes, lyrics, similar...) -> clean "not found"
            return route.fulfill({
                status: 404,
                contentType: 'application/json',
                headers: cors,
                body: '{"detail":"mock: not implemented"}',
            });
        }

        // fonts / analytics / anything else: answer instantly so page load never waits on the real internet
        if (/\.(css|woff2?)$/.test(u.pathname) || u.hostname.includes('fonts.'))
            return route.fulfill({ status: 200, contentType: 'text/css', headers: cors, body: '' });
        if (/\.(png|jpe?g|webp|gif|svg)$/i.test(u.pathname))
            return route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: PNG_1X1 });
        return route.fulfill({ status: 404, headers: cors, body: '' });
    });

    return {
        hits,
        wav,
        /** live options object: tests may flip e.g. `net.opts.api = 'down'` mid-test */
        opts: o,
        count: (re) => hits.filter((h) => re.test(`${h.host}${h.path}`)).length,
    };
}
