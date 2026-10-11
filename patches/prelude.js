/* ===== HidzMusify runtime hardening prelude (injected by patches/apply-patches.mjs) =====
 * Module-scope helpers used by the patched call sites in the bundle. Everything is prefixed `__hz`
 * so it cannot collide with minified identifiers. Names that exist only later in the bundle
 * (`ys`, `Bl`) are referenced lazily, inside functions, never at load time.
 */

/* User-facing strings in one place (the app UI is English, so these are English too). */
const __hzMsg = {
    searchUnavailable: "Search is unavailable right now: couldn't reach any music provider. Please try again.",
    searchTimeout: 'Search timed out. Check your connection and try again.',
    searchRetry: 'Try again',
    playBlocked: 'Your browser blocked autoplay. Press Play to start the track.',
    playFailed: "Couldn't play this track",
};

/** AbortSignal that also fires after `ms` (and when `signal` aborts). Safe on browsers without AbortSignal.any/timeout. */
const __hzSig = (signal, ms) => {
    try {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
            const timeout = AbortSignal.timeout(ms);
            if (!signal) return timeout;
            if (AbortSignal.any) return AbortSignal.any([signal, timeout]);
            const ctl = new AbortController();
            const abort = () => ctl.abort();
            signal.addEventListener('abort', abort, { once: true });
            timeout.addEventListener('abort', abort, { once: true });
            return ctl.signal;
        }
    } catch (_) {
        /* fall through to the caller's own signal */
    }
    return signal || undefined;
};

/** Short, readable reason string for a thrown value. */
const __hzReason = (err) => {
    const m = (err && (err.message || err.name)) || String(err || 'unknown error');
    return String(m).replace(/\s+/g, ' ').slice(0, 160);
};

/**
 * Visible toast (re-uses the app's own notification container + styles). Calls with the same `kind`
 * within 4s are collapsed so one failure never produces a stack of identical toasts.
 */
const __hzNotify = (message, kind, ms) => {
    try {
        const now = Date.now();
        const seen = (__hzNotify.seen = __hzNotify.seen || {});
        const key = kind || 'generic';
        if (now - (seen[key] || 0) < 4000) return;
        seen[key] = now;
        const host = ys(); // app's #download-notifications container (hoisted function declaration)
        const el = document.createElement('div');
        el.className = 'download-task';
        el.setAttribute('role', 'alert');
        el.style.cssText = 'display:flex;align-items:start';
        el.textContent = message;
        host.appendChild(el);
        setTimeout(() => {
            el.style.animation = 'slide-out 0.3s ease forwards';
            setTimeout(() => el.remove(), 300);
        }, ms || 6000);
    } catch (_) {
        console.warn('[HidzMusify]', message);
    }
};

/** Depth-limited search for a non-empty string stored under one of `keys` anywhere in `value`. */
const __hzFindStr = (value, keys, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return false;
    for (const k of keys) if (typeof value[k] === 'string' && value[k]) return true;
    for (const v of Object.values(value)) if (__hzFindStr(v, keys, depth + 1)) return true;
    return false;
};

/**
 * `/trackManifests/` response check. It must agree with `normalizeTrackManifestResponse`, which reads
 * `data.data.attributes.uri` (the signed manifest URL; documented in Monochrome js/HiFi.ts
 * `TrackManifestAttributes`). The previous check demanded legacy keys (`manifest`, `url`, ...) that a
 * valid `/trackManifests/` response never contains, so every valid response was rejected.
 */
const __hzManifestOk = (r) => {
    if (!r || typeof r !== 'object') return false;
    const d = r.data && r.data.data ? r.data.data : r.data || r;
    const uri = d && d.attributes && d.attributes.uri;
    return typeof uri === 'string' && uri.length > 0;
};

/** Legacy `/track/` playback-info response check (base64 `manifest` or a direct URL). */
const __hzLegacyOk = (r) => __hzFindStr(r, ['manifest', 'OriginalTrackUrl', 'originalTrackUrl', 'url', 'streamUrl']);

/* "Try again" button rendered inside the search error state (event delegation, no per-render wiring). */
document.addEventListener('click', (ev) => {
    const btn = ev.target && ev.target.closest && ev.target.closest('[data-hz-retry-search]');
    if (!btn) return;
    ev.preventDefault();
    const q = decodeURIComponent(btn.getAttribute('data-hz-retry-search') || '');
    if (q && typeof Bl !== 'undefined' && Bl.instance) Bl.instance.renderSearchPage(q);
});
/* ===== end prelude ===== */
