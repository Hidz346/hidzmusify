/* ===== HidzMusify YouTube source (injected by patches/apply-patches.mjs, after prelude.js) =====
 * Why: the TIDAL/hifi-API instances this app was built on are gone (DNS removed / upstream auth revoked),
 * so search and playback can never succeed through them. Search now goes to our own /api/search (YouTube
 * Music, see api/_lib.js) and playback goes through the official YouTube IFrame Player API.
 *
 * Playback design: the app's own <audio> element stays in charge of the UI (progress bar, play/pause icon,
 * queue, Next/Prev, media session ...). While a YouTube track is active we shadow the element's
 * currentTime / duration / paused / volume / play() / pause() with versions that talk to the YouTube player,
 * and re-dispatch the DOM events (play, playing, pause, timeupdate, ended, ...). Every existing listener
 * keeps working untouched. When a non-YouTube track (podcast, local file) is played the shadows are removed.
 *
 * Switches (localStorage):
 *   hz-source = "tidal"  -> use the legacy TIDAL path again (e.g. if working instances come back)
 *   hz-yt-visible = "1"  -> show the YouTube player (bottom-right) instead of hiding it; useful to see what
 *                           YouTube answers when a video does not start
 *
 * The YouTube player is created lazily, so nothing is loaded from youtube.com until the first track plays.
 */
Object.assign(__hzMsg, {
    ytApiLoad: "Couldn't load the YouTube player. Check your connection or disable the ad blocker for this site.",
    ytNoMatch: "Couldn't find a playable version of this track.",
    ytError: "YouTube can't play this video",
    ytTimeout: 'The track took too long to start. Please try again.',
    ytAlt: 'The first version was unavailable, playing an alternative version.',
    ytBlocked: 'Your browser blocked autoplay. Press Play to start the track.',
    onlyTracks: 'Only tracks are available in this version.',
    searchHttp: 'Search failed',
    searchMissing: 'The search service is not available on this site (not deployed yet).',
    searchShape: 'Search returned an unexpected response.',
});

const __hzYt = (() => {
    const store = (k, v) => {
        try {
            if (v === undefined) return localStorage.getItem(k);
            localStorage.setItem(k, v);
        } catch (_) {
            /* blocked storage: behave as if empty */
        }
        return null;
    };
    const cfg = {
        enabled: store('hz-source') !== 'tidal',
        visible: store('hz-yt-visible') === '1',
        searchTimeoutMs: 15000,
        resolveTimeoutMs: 15000,
        apiTimeoutMs: 15000,
        startTimeoutMs: 10000,
    };
    const MAP_KEY = 'hz-yt-map-v1';
    const MAP_MAX = 500;
    const PROPS = [
        'currentTime',
        'duration',
        'paused',
        'ended',
        'readyState',
        'seeking',
        'volume',
        'muted',
        'playbackRate',
    ];

    const S = {
        api: null,
        ready: null,
        yt: null,
        host: null,
        el: null,
        track: null,
        videoId: null,
        loaded: false,
        paused: true,
        ended: false,
        wantPlay: false,
        userPaused: false,
        vol: 1,
        muted: false,
        rate: 1,
        seekPos: 0,
        seekAt: 0,
        timer: 0,
        cueTimer: 0,
        waiter: null,
    };

    /* ------------------------------------------------------------------ helpers */
    const emit = (type) => {
        if (!S.el) return;
        try {
            S.el.dispatchEvent(new Event(type));
        } catch (_) {
            /* never let a listener break the player */
        }
    };

    function settle(kind, value) {
        const w = S.waiter;
        if (!w) return;
        S.waiter = null;
        clearTimeout(w.timer);
        clearTimeout(S.cueTimer);
        if (kind === 'ok') w.resolve(value);
        else w.reject(value);
    }

    function newWaiter(ms, onTimeout) {
        settle('err', Object.assign(new Error('superseded'), { code: 'SUPERSEDED' }));
        return new Promise((resolve, reject) => {
            S.waiter = { resolve, reject, timer: setTimeout(() => settle('err', onTimeout()), ms) };
        });
    }

    const ytState = () => {
        try {
            return S.yt && S.yt.getPlayerState ? S.yt.getPlayerState() : -1;
        } catch (_) {
            return -1;
        }
    };

    const curTime = () => {
        if (S.seekAt && Date.now() - S.seekAt < 400) return S.seekPos; // the iframe lags right after a seek
        try {
            const t = S.yt && S.yt.getCurrentTime ? S.yt.getCurrentTime() : 0;
            return Number.isFinite(t) ? t : 0;
        } catch (_) {
            return 0;
        }
    };

    const dur = () => {
        let d = 0;
        try {
            d = S.yt && S.yt.getDuration ? S.yt.getDuration() : 0;
        } catch (_) {
            /* fall through */
        }
        if (d > 0) return d;
        return S.track && S.track.duration > 0 ? S.track.duration : NaN;
    };

    function applyVolume() {
        if (!S.yt) return;
        try {
            S.yt.setVolume(Math.round(Math.min(1, Math.max(0, S.vol)) * 100));
            if (S.muted) S.yt.mute();
            else if (S.yt.isMuted && S.yt.isMuted()) S.yt.unMute();
        } catch (_) {
            /* player not ready yet; applied again on the next call */
        }
    }

    function startTimer() {
        if (S.timer) return;
        S.timer = setInterval(() => {
            emit('timeupdate');
            // Background tabs: browsers sometimes pause hidden iframes; resume unless the user paused.
            if (S.wantPlay && !S.userPaused && document.hidden && ytState() === 2) {
                try {
                    S.yt.playVideo();
                } catch (_) {
                    /* ignore */
                }
            }
        }, 250);
    }
    function stopTimer() {
        if (S.timer) clearInterval(S.timer);
        S.timer = 0;
    }

    /* ------------------------------------------------------------------ YouTube IFrame API */
    function loadApi() {
        if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
        if (S.api) return S.api;
        S.api = new Promise((resolve, reject) => {
            const fail = () => {
                clearTimeout(timer);
                S.api = null;
                reject(new Error(__hzMsg.ytApiLoad));
            };
            const timer = setTimeout(fail, cfg.apiTimeoutMs);
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                clearTimeout(timer);
                try {
                    if (typeof prev === 'function') prev();
                } catch (_) {
                    /* ignore */
                }
                resolve(window.YT);
            };
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            s.async = true;
            s.onerror = fail;
            document.head.appendChild(s);
        });
        return S.api;
    }

    function ensurePlayer() {
        if (S.ready) return S.ready;
        S.ready = loadApi()
            .then(
                (YT) =>
                    new Promise((resolve, reject) => {
                        const host = document.createElement('div');
                        host.id = 'hz-yt-host';
                        host.style.cssText = cfg.visible
                            ? 'position:fixed;right:8px;bottom:96px;width:240px;height:135px;z-index:99999;background:#000'
                            : 'position:fixed;top:-1000px;left:-1000px;width:1px;height:1px;opacity:0;pointer-events:none';
                        const mount = document.createElement('div');
                        host.appendChild(mount);
                        document.body.appendChild(host);
                        S.host = host;
                        const timer = setTimeout(() => reject(new Error(__hzMsg.ytApiLoad)), cfg.apiTimeoutMs);
                        S.yt = new YT.Player(mount, {
                            height: cfg.visible ? '135' : '1',
                            width: cfg.visible ? '240' : '1',
                            playerVars: {
                                autoplay: 1,
                                controls: 0,
                                playsinline: 1,
                                rel: 0,
                                disablekb: 1,
                                origin: location.origin,
                            },
                            events: {
                                onReady: () => {
                                    clearTimeout(timer);
                                    resolve(S.yt);
                                },
                                onStateChange: onState,
                                onError: onError,
                            },
                        });
                    })
            )
            .catch((err) => {
                S.ready = null;
                try {
                    if (S.host) S.host.remove();
                } catch (_) {
                    /* ignore */
                }
                S.yt = null;
                S.host = null;
                throw err;
            });
        return S.ready;
    }

    function onState(ev) {
        if (!S.el) return;
        const st = ev && ev.data;
        if (st === 1) {
            // PLAYING
            if (S.userPaused) {
                try {
                    S.yt.pauseVideo(); // user paused while the video was still loading
                } catch (_) {
                    /* ignore */
                }
                return;
            }
            S.ended = false;
            if (S.paused) {
                S.paused = false;
                emit('play');
            }
            if (!S.loaded) {
                S.loaded = true;
                emit('loadedmetadata');
                emit('durationchange');
                emit('loadeddata');
                emit('canplay');
            }
            applyVolume();
            settle('ok');
            emit('playing');
            startTimer();
        } else if (st === 2) {
            // PAUSED
            if (S.wantPlay && !S.userPaused && document.hidden) return; // resumed by the timer
            if (!S.paused) {
                S.paused = true;
                stopTimer();
                emit('pause');
            }
        } else if (st === 3) {
            emit('waiting');
        } else if (st === 5) {
            // CUED while a start is pending: the browser blocked autoplay (no user gesture). Do not wait for the
            // full start timeout; report it quickly so the page can ask the user to press play.
            if (S.waiter && S.videoId) {
                clearTimeout(S.cueTimer);
                S.cueTimer = setTimeout(() => {
                    const cur = ytState();
                    if (S.waiter && (cur === 5 || cur === -1))
                        settle('err', new DOMException(__hzMsg.ytBlocked, 'NotAllowedError'));
                }, 2500);
            }
        } else if (st === 0) {
            // ENDED: same event order as a real media element
            S.ended = true;
            S.paused = true;
            S.wantPlay = false;
            stopTimer();
            emit('timeupdate');
            emit('pause');
            emit('ended');
        }
    }

    const REASONS = {
        2: 'invalid video id',
        5: 'player error',
        100: 'video removed or private',
        101: 'embedding disabled by the owner',
        150: 'embedding disabled by the owner',
    };
    function onError(ev) {
        const code = ev && ev.data;
        const err = new Error(`${__hzMsg.ytError} (${REASONS[code] || 'error ' + code})`);
        err.code = 'YT_' + code;
        err.ytCode = code;
        settle('err', err);
    }

    /* ------------------------------------------------------------------ <audio> shadowing */
    function seekTo(t) {
        if (!S.yt || !Number.isFinite(t)) return;
        const d = dur();
        const to = Math.max(0, d > 0 ? Math.min(t, d) : t);
        S.seekPos = to;
        S.seekAt = Date.now();
        emit('seeking');
        try {
            S.yt.seekTo(to, true);
        } catch (_) {
            /* ignore */
        }
        setTimeout(() => {
            emit('seeked');
            emit('timeupdate');
        }, 50);
    }

    function pause() {
        S.wantPlay = false;
        S.userPaused = true;
        if (S.paused) return;
        S.paused = true;
        try {
            if (S.yt) S.yt.pauseVideo();
        } catch (_) {
            /* ignore */
        }
        stopTimer();
        emit('pause');
    }

    function play() {
        S.wantPlay = true;
        S.userPaused = false;
        if (!S.yt || !S.videoId) return Promise.resolve();
        if (!S.paused && !S.ended) return Promise.resolve();
        const wasEnded = S.ended;
        const done = newWaiter(5000, () => new DOMException('Playback did not start', 'NotAllowedError'));
        S.ended = false;
        S.paused = false;
        emit('play');
        try {
            if (wasEnded) S.yt.seekTo(0, true);
            S.yt.playVideo();
        } catch (err) {
            settle('err', err);
        }
        return done;
    }

    function attach(el) {
        if (S.el === el && el.__hzYt) return;
        if (S.el && S.el !== el) release();
        S.el = el;
        el.__hzYt = true;
        S.vol = Number.isFinite(el.volume) ? el.volume : 1;
        S.muted = !!el.muted;
        S.rate = el.playbackRate || 1;
        const def = (k, d) => Object.defineProperty(el, k, { configurable: true, ...d });
        def('currentTime', { get: curTime, set: (v) => seekTo(Number(v)) });
        def('duration', { get: dur });
        def('paused', { get: () => S.paused });
        def('ended', { get: () => S.ended });
        def('readyState', { get: () => (S.loaded ? 4 : 0) });
        def('seeking', { get: () => false });
        def('volume', {
            get: () => S.vol,
            set: (v) => {
                S.vol = Math.min(1, Math.max(0, Number(v) || 0));
                applyVolume();
                emit('volumechange');
            },
        });
        def('muted', {
            get: () => S.muted,
            set: (v) => {
                S.muted = !!v;
                applyVolume();
                emit('volumechange');
            },
        });
        def('playbackRate', {
            get: () => S.rate,
            set: (v) => {
                S.rate = Number(v) || 1;
                try {
                    if (S.yt) S.yt.setPlaybackRate(S.rate);
                } catch (_) {
                    /* unsupported rate */
                }
                emit('ratechange');
            },
        });
        el.play = play;
        el.pause = pause;
    }

    /** Remove the shadows (native element behaviour is back) and stop the YouTube video. */
    function release() {
        const el = S.el;
        if (!el) return;
        settle('err', Object.assign(new Error('released'), { code: 'SUPERSEDED' }));
        stopTimer();
        try {
            if (S.yt && S.videoId) S.yt.stopVideo();
        } catch (_) {
            /* ignore */
        }
        for (const k of PROPS) delete el[k];
        delete el.play;
        delete el.pause;
        el.__hzYt = false;
        S.el = null;
        S.videoId = null;
        S.loaded = false;
        S.paused = true;
        S.ended = false;
        S.wantPlay = false;
        try {
            el.volume = S.vol;
            el.muted = S.muted;
            el.playbackRate = S.rate;
        } catch (_) {
            /* ignore */
        }
    }

    /* ------------------------------------------------------------------ track -> YouTube video */
    const mapRead = () => {
        try {
            return JSON.parse(store(MAP_KEY) || '{}') || {};
        } catch (_) {
            return {};
        }
    };
    const mapWrite = (m) => {
        const keys = Object.keys(m);
        for (const k of keys.slice(0, Math.max(0, keys.length - MAP_MAX))) delete m[k];
        store(MAP_KEY, JSON.stringify(m));
    };
    const mapSet = (id, vid) => {
        const m = mapRead();
        delete m[id];
        m[id] = vid;
        mapWrite(m);
    };
    const mapDel = (id) => {
        const m = mapRead();
        if (id in m) {
            delete m[id];
            mapWrite(m);
        }
    };

    const artistsOf = (t) =>
        (t.artists && t.artists.length ? t.artists : t.artist ? [t.artist] : [])
            .map((a) => a && a.name)
            .filter(Boolean)
            .join(' ');

    /** Ordered list of YouTube video ids worth trying for this track (excluding ones already tried). */
    async function candidates(track, tried) {
        if (track.hzYt && !tried.length) return [track.hzYt];
        const known = !track.hzYt && !tried.length ? mapRead()[track.id] : null;
        if (known) return [known];
        const qs = new URLSearchParams({
            title: String(track.title || '').slice(0, 200),
            artist: artistsOf(track).slice(0, 200),
        });
        if (track.duration > 0) qs.set('duration', String(Math.round(track.duration)));
        if (tried.length) qs.set('exclude', tried.join(','));
        const res = await fetch('/api/resolve?' + qs, {
            signal: __hzSig(null, cfg.resolveTimeoutMs),
            headers: { Accept: 'application/json' },
        });
        let body = null;
        try {
            body = await res.json();
        } catch (_) {
            /* handled below */
        }
        if (!res.ok)
            throw new Error(
                (body && body.message) ||
                    (res.status === 404 ? __hzMsg.searchMissing : `${__hzMsg.searchHttp} (HTTP ${res.status})`)
            );
        if (!body || !Array.isArray(body.candidates)) throw new Error(__hzMsg.searchShape);
        return body.candidates.map((c) => c.hzYt).filter(Boolean);
    }

    function startVideo(id, startSeconds) {
        S.videoId = id;
        S.loaded = false;
        S.ended = false;
        S.paused = false;
        S.wantPlay = true;
        S.userPaused = false;
        const started = newWaiter(cfg.startTimeoutMs, () => {
            const st = ytState();
            if (st === -1 || st === 5) return new DOMException(__hzMsg.ytBlocked, 'NotAllowedError'); // never started: autoplay blocked
            return Object.assign(new Error(__hzMsg.ytTimeout), { code: 'YT_TIMEOUT' });
        });
        emit('play');
        applyVolume();
        try {
            S.yt.loadVideoById({ videoId: id, startSeconds: Math.max(0, startSeconds || 0) });
        } catch (err) {
            settle('err', err);
        }
        return started.catch((err) => {
            if (err && err.code !== 'SUPERSEDED') {
                S.videoId = null; // nothing is loaded: the play button must start the track again, not "resume" it
                S.loaded = false;
                S.paused = true;
                S.wantPlay = false;
                stopTimer();
                emit('pause');
            }
            throw err;
        });
    }

    const videoSpecific = (e) =>
        e &&
        (e.ytCode === 100 ||
            e.ytCode === 101 ||
            e.ytCode === 150 ||
            e.ytCode === 2 ||
            e.ytCode === 5 ||
            e.code === 'YT_TIMEOUT');

    /** Called by the patched Player.playTrackFromQueue for every track that plays through YouTube. */
    async function playTrack(P, track, el, startTime, seq) {
        attach(el);
        const tried = [];
        let lastErr = null;
        let timeouts = 0;
        for (let attempt = 0; attempt < 3; attempt++) {
            const ids = await candidates(track, tried);
            if (P.playbackSequence !== seq) return;
            const id = ids.find((x) => !tried.includes(x));
            if (!id) throw lastErr || Object.assign(new Error(__hzMsg.ytNoMatch), { code: 'YT_NOMATCH' });
            tried.push(id);
            try {
                await ensurePlayer();
                if (P.playbackSequence !== seq) return;
                S.track = track;
                P.currentRgValues = null;
                P.applyReplayGain();
                await startVideo(id, startTime);
                if (P.playbackSequence !== seq) return;
                if (attempt > 0) __hzNotify(__hzMsg.ytAlt, 'ytalt');
                if (!track.hzYt) {
                    track.hzYt = id;
                    mapSet(track.id, id);
                }
                return;
            } catch (err) {
                if (err && err.code === 'SUPERSEDED') return;
                if (P.playbackSequence !== seq) return;
                lastErr = err;
                if (!videoSpecific(err)) throw err;
                // A video that does not start within the timeout gets one alternative, not two: never keep the user
                // waiting for 3 x timeout.
                if (err.code === 'YT_TIMEOUT' && ++timeouts >= 2) throw err;
                if (track.hzYt === id && String(track.id).indexOf('yt:') !== 0) {
                    track.hzYt = null;
                    mapDel(track.id);
                }
            }
        }
        throw lastErr || new Error(__hzMsg.ytNoMatch);
    }

    /** Is this track played through YouTube? (podcasts, trackers, local files and videos keep their own path) */
    function wants(track) {
        if (!cfg.enabled || !track) return false;
        if (track.hzYt) return true;
        if (track.isPodcast || track.isTracker || track.isLocal || track.audioUrl || track.type === 'video')
            return false;
        const id = String(track.id || '');
        return !(id.startsWith('podcast_') || id.startsWith('tracker-'));
    }

    /* ------------------------------------------------------------------ search */
    async function search(query, opts) {
        const callerSignal = opts && opts.signal;
        let res;
        try {
            res = await fetch('/api/search?q=' + encodeURIComponent(query), {
                signal: __hzSig(callerSignal, cfg.searchTimeoutMs),
                headers: { Accept: 'application/json' },
            });
        } catch (err) {
            // Our own timeout must look like a normal error: an AbortError is treated by the page as "superseded".
            if (err && err.name === 'AbortError' && !(callerSignal && callerSignal.aborted))
                throw new Error(__hzMsg.searchTimeout);
            throw err;
        }
        let body = null;
        try {
            body = await res.json();
        } catch (_) {
            /* handled below */
        }
        if (!res.ok)
            throw new Error(
                (body && body.message) ||
                    (res.status === 404 ? __hzMsg.searchMissing : `${__hzMsg.searchHttp} (HTTP ${res.status})`)
            );
        if (!body || !Array.isArray(body.items)) throw new Error(__hzMsg.searchShape);
        const none = { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 };
        const items = body.items.filter((t) => t && t.hzYt);
        return {
            tracks: { items, limit: items.length, offset: 0, totalNumberOfItems: items.length },
            videos: none,
            artists: none,
            albums: none,
            playlists: none,
            hzYt: true,
        };
    }

    /** Clicking a search result queues every result (from the clicked one) so Next/Prev and auto-advance work. */
    function searchQueue(row, track, rows) {
        try {
            if (cfg.enabled && track && track.hzYt && row && row.parentElement) {
                const tracks = Array.from(row.parentElement.querySelectorAll('[data-track-id]'))
                    .map((r) => rows.get(r))
                    .filter((t) => t && t.hzYt);
                const i = tracks.findIndex((t) => t.id === track.id);
                if (i >= 0) return [tracks, i];
            }
        } catch (_) {
            /* fall back to the single track */
        }
        return [[track], 0];
    }

    return {
        cfg,
        get enabled() {
            return cfg.enabled;
        },
        wants,
        playTrack,
        ready: (el) => S.el === el && !!S.videoId && S.loaded,
        release,
        search,
        searchQueue,
    };
})();
/* ===== end YouTube source ===== */
