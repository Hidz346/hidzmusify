#!/usr/bin/env node
// Reproducible, fail-loud patcher for the shipped HidzMusify bundle.
//
// WHY THIS EXISTS
//   HidzMusify ships only build output (no src/, no package.json), so the minified bundle cannot be fixed
//   at source level, and the original build toolchain is not available. Instead of hand-editing minified code,
//   every change is an exact-match replacement that must match exactly N times. If the bundle ever changes
//   (e.g. a new build) this script refuses to run instead of silently corrupting it.
//
// usage: node patches/apply-patches.mjs <original-index-bundle.js> <output-bundle.js>
//   The input is always the ORIGINAL bundle; edits are applied in order to an in-memory copy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
    console.error('usage: node apply-patches.mjs <original-index-bundle.js> <output-bundle.js>');
    process.exit(2);
}

const prelude = fs.readFileSync(path.join(here, 'prelude.js'), 'utf8');
let src = fs.readFileSync(inFile, 'utf8');

/** @type {{id:string, why:string, find:string, replace:string, count?:number}[]} */
const edits = [
    // ------------------------------------------------------------------ boot
    {
        id: 'P0-prelude',
        why: 'Inject shared helpers (timeouts, toast, response validators, retry button) at module scope.',
        find: '!function(){const e=document.createElement("link").relList',
        replace: prelude + '\n!function(){const e=document.createElement("link").relList',
    },
    {
        id: 'P1-instances-redeclared-const',
        why:
            'loadInstancesFromGitHub() declared `const e` twice in one scope (cached string, then fallback instance ' +
            "table) -> `SyntaxError: Identifier 'e' has already been declared` -> the browser rejects the whole main " +
            'module and the app never boots (dead UI, search form reloads the page). Also: a throwing localStorage ' +
            '(blocked storage) must not poison the shared load promise.',
        find: 'const e=localStorage.getItem(this.STORAGE_KEY);if(e)try{const t=JSON.parse(e),i=Date.now(),a=t?.data;',
        replace:
            'let cachedRaw=null;try{cachedRaw=localStorage.getItem(this.STORAGE_KEY)}catch{}if(cachedRaw)try{const t=JSON.parse(cachedRaw),i=Date.now(),a=t?.data;',
    },
    {
        id: 'P1b-instances-list-timeout',
        why: 'Fetching the instance list had no timeout; a stalled uptime worker blocked every search/stream forever.',
        find: 'const i=await fetch(a,{cache:"no-store"});if(!i.ok)continue;',
        replace: 'const i=await fetch(a,{cache:"no-store",signal:__hzSig(null,6e3)});if(!i.ok)continue;',
    },
    {
        id: 'P2-hifi-initialize-nonblocking',
        why:
            'App boot (DOMContentLoaded) awaited HiFiClient.initialize(), which awaits a TIDAL OAuth token request with ' +
            'no timeout and no error handling. If auth.tidal.com is blocked/slow the boot sequence rejects/hangs: no ' +
            'router, no player, no search handler. The token is fetched lazily on first use anyway, so warm it up ' +
            'in the background and never let it block or crash startup.',
        find: 'return e.token||e.clientId||e.clientSecret||await t.#S({...e,signal:e.signal||(new AbortController).signal}),pa.#s=t}',
        replace:
            'return e.token||e.clientId||e.clientSecret||t.#S({...e,signal:e.signal||(new AbortController).signal}).catch(__hzErr=>console.warn("[HidzMusify] TIDAL app-token warm-up failed; it will be retried on first request:",__hzErr&&__hzErr.message)),pa.#s=t}',
    },
    {
        id: 'P3a-tidal-token-timeout',
        why: 'TIDAL OAuth token request had no timeout.',
        find: 'body:n,signal:s});if(!r.ok){const e=await r.text().catch(()=>"");throw new Error(`Failed to obtain app token',
        replace:
            'body:n,signal:__hzSig(s,12e3)});if(!r.ok){const e=await r.text().catch(()=>"");throw new Error(`Failed to obtain app token',
    },
    {
        id: 'P3b-tidal-api-timeout',
        why: 'Direct TIDAL API requests (last-resort fallback) had no timeout.',
        find: 's=await fetch(a,{headers:o,signal:i})}catch(n){throw new ua(0',
        replace: 's=await fetch(a,{headers:o,signal:__hzSig(i,15e3)})}catch(n){throw new ua(0',
    },
    {
        id: 'P4-contributors-nonblocking',
        why:
            'The About-page contributor list (api.samidy.com) was awaited inside the DOMContentLoaded boot chain with no ' +
            'timeout: a stalled host froze all later initialisation (settings, player controls, router).',
        find: 'await async function(){try{const e=await fetch("https://api.samidy.com/api/contributors");',
        replace:
            'void async function(){try{const e=await fetch("https://api.samidy.com/api/contributors",{signal:__hzSig(null,8e3)});',
    },

    // ------------------------------------------------------------------ request rotation
    {
        id: 'P5a-fetchWithRetry-deadline',
        why:
            'fetchWithRetry rotates through every instance twice (and again after refreshing the list) with a 9s timeout ' +
            'each: with dead instances a single request could take minutes. Add an overall deadline (default 30s, ' +
            'overridable per call with `deadlineMs`).',
        find: 'async fetchWithRetry(e,t={}){const i=t.type||"api";',
        replace: 'async fetchWithRetry(e,t={}){const __hzDl=Date.now()+(t.deadlineMs||3e4);const i=t.type||"api";',
    },
    {
        id: 'P5b-fetchWithRetry-loop-deadline',
        why: 'Honour the overall deadline inside the instance rotation loop.',
        find: 'for(let o=1;o<=a;o++){const a=i[n%i.length],',
        replace: 'for(let o=1;o<=a;o++){if(Date.now()>__hzDl)break;const a=i[n%i.length],',
    },
    {
        id: 'P5c-fetchWithRetry-refresh-deadline',
        why: 'Do not start the second (refreshed-instances) pass once the deadline has passed.',
        find: 'return await s(await a(!0))',
        replace: 'if(Date.now()>__hzDl)throw new Error("Request timed out: "+e);return await s(await a(!0))',
    },

    // ------------------------------------------------------------------ search
    {
        id: 'P6a-search-failure-marker',
        why:
            'searchTracks/Artists/Albums/Playlists/Videos swallowed every error into an empty result, so a total ' +
            'outage looked like "No tracks found". Mark failed results so search() can tell failure from "no matches".',
        find: 'if("AbortError"===a.name)throw a;return{items:[],limit:0,offset:0,totalNumberOfItems:0}}',
        replace:
            'if("AbortError"===a.name)throw a;return{items:[],limit:0,offset:0,totalNumberOfItems:0,failed:!0,error:a}}',
        count: 5,
    },
    {
        id: 'P6b-search-semantics',
        why:
            "(1) AbortError was swallowed by search()'s catch-all, so an obsolete query kept running and overwrote the " +
            'newest results. (2) A valid "no matches" response was treated as invalid and retried on every instance ' +
            '(minutes of spinner for an empty query); now two instances agreeing on "empty" is accepted. (3) When every ' +
            'provider failed the UI got an empty result instead of an error. (4) Empty results are no longer cached ' +
            'for 30 minutes. (5) Each phase is bounded by a deadline.',
        find: 'async search(e,t={}){const i=await this.cache.get("search_all",e);if(i)return i;try{const i=await this.fetchWithRetry(`/search/?q=${encodeURIComponent(e)}`,{...t,validateResponse:(e)=>{const t=this.findSearchSection(e,"tracks",new Set),i=this.findSearchSection(e,"artists",new Set),a=this.findSearchSection(e,"albums",new Set),s=this.findSearchSection(e,"playlists",new Set),n=this.findSearchSection(e,"videos",new Set);return[t,i,a,s,n].some(e=>Array.isArray(e?.items)&&e.items.length>0)}}),a=await i.json(),',
        replace:
            'async search(e,t={}){const i=await this.cache.get("search_all",e);if(i)return i;let __hzEmpty=0;try{const i=await this.fetchWithRetry("/search/?q="+encodeURIComponent(e),{...t,deadlineMs:15e3,validateResponse:(e)=>{const t=["tracks","artists","albums","playlists","videos"].map(i=>this.findSearchSection(e,i,new Set));return t.some(e=>Array.isArray(e?.items)&&e.items.length>0)?!0:t.some(e=>Array.isArray(e?.items))&&++__hzEmpty>=2}}),a=await i.json(),',
    },
    {
        id: 'P6c-search-cache-and-fallback',
        why: 'Second half of search(): do not cache empty results; propagate AbortError; fail loudly when all providers failed.',
        find: 'return await this.cache.set("search_all",e,p),p}catch(a){const[i,s,n,r,o]=await Promise.all([this.searchTracks(e,t).catch(()=>({items:[]})),this.searchVideos(e,t).catch(()=>({items:[]})),this.searchArtists(e,t).catch(()=>({items:[]})),this.searchAlbums(e,t).catch(()=>({items:[]})),this.searchPlaylists(e,t).catch(()=>({items:[]}))]);return{tracks:i,videos:s,artists:n,albums:r,playlists:o}}}',
        replace:
            'return(h.length||m.length||p.albums.items.length)&&await this.cache.set("search_all",e,p),p}catch(a){if(a&&"AbortError"===a.name)throw a;const __hzO={...t,deadlineMs:15e3},__hzF=e=>{if(e&&"AbortError"===e.name)throw e;return{items:[],failed:!0,error:e}},[i,s,n,r,o]=await Promise.all([this.searchTracks(e,__hzO).catch(__hzF),this.searchVideos(e,__hzO).catch(__hzF),this.searchArtists(e,__hzO).catch(__hzF),this.searchAlbums(e,__hzO).catch(__hzF),this.searchPlaylists(e,__hzO).catch(__hzF)]);if([i,s,n,r,o].every(e=>e&&e.failed))throw new Error(__hzMsg.searchUnavailable);return{tracks:i,videos:s,artists:n,albums:r,playlists:o}}}',
    },
    {
        id: 'P7a-searchpage-watchdog',
        why: 'renderSearchPage: remember the query and add a 40s watchdog so the skeleton loader can never spin forever.',
        find: 'const r=this.searchAbortController.signal;try{const n=this.api.getCurrentProvider(),',
        replace:
            'const r=this.searchAbortController.signal,__hzCtl=this.searchAbortController,__hzQ=e;let __hzTimedOut=!1;const __hzTimer=setTimeout(()=>{__hzTimedOut=!0,__hzCtl.abort()},4e4);try{const n=this.api.getCurrentProvider(),',
    },
    {
        id: 'P7b-searchpage-stale-guard',
        why: 'Never render results of a query that has been superseded by a newer one.',
        find: 'o=await this.api.search(e,{signal:r,provider:n});',
        replace: 'o=await this.api.search(e,{signal:r,provider:n});if(r.aborted&&!__hzTimedOut)return;',
    },
    {
        id: 'P7c-searchpage-artist-enrichment',
        why:
            'renderSearchPage called `this.api.enrichArtistsWithPicture(...)`, but `this.api` is the MusicAPI wrapper which has no ' +
            'such method (it lives on `this.api.tidalAPI`, as upstream ui.js does). Whenever a search returned tracks but no ' +
            'artists the call threw `TypeError: ... is not a function` and the user saw an error instead of their results. ' +
            'Call the right object, and never let picture enrichment (cosmetic) discard valid results. Also adds a second stale-query guard.',
        find: '),d=await this.api.enrichArtistsWithPicture(Array.from(e.values()))}',
        replace:
            ');try{d=await this.api.tidalAPI.enrichArtistsWithPicture(Array.from(e.values()))}catch(__hzE){if(__hzE&&"AbortError"===__hzE.name)throw __hzE;console.warn("[HidzMusify] artist picture enrichment failed:",__hzE),d=Array.from(e.values())}if(r.aborted&&!__hzTimedOut)return}',
    },
    {
        id: 'P7d-searchpage-error-state',
        why:
            'Distinguish an obsolete query (silent) from a watchdog timeout and from a real error, show a clear message ' +
            'with a bounded "Try again" button, and always clear the watchdog timer.',
        find: '}catch(o){if("AbortError"===o.name)return;const e=Xt(`Error during search. ${o.message}`);t.innerHTML=e,i.innerHTML=e,a.innerHTML=e,s.innerHTML=e,n.innerHTML=e}}',
        replace:
            '}catch(o){if("AbortError"===o.name&&!__hzTimedOut)return;if(r.aborted&&!__hzTimedOut)return;console.error("[HidzMusify] search failed:",o);const e=Xt(__hzTimedOut?__hzMsg.searchTimeout:`Error during search. ${__hzReason(o)}`)+`<div style="text-align:center;margin-top:1rem"><button type="button" class="btn-secondary" data-hz-retry-search="${encodeURIComponent(__hzQ)}">${__hzMsg.searchRetry}</button></div>`;t.innerHTML=e,i.innerHTML=e,a.innerHTML=e,s.innerHTML=e,n.innerHTML=e}finally{clearTimeout(__hzTimer)}}',
    },

    // ------------------------------------------------------------------ streaming
    {
        id: 'P8-getTrack-manifest-contract',
        why:
            "getTrack's validateResponse required `manifest|url|streamUrl|OriginalTrackUrl`, but a valid /trackManifests/ " +
            'response carries `data.data.attributes.uri` and none of those keys, so EVERY valid response was rejected ' +
            '(36 requests per click, no audio). Validate what the consumer actually reads, and port the upstream ' +
            'fallback to the legacy `/track/` endpoint for instances without /trackManifests/ support.',
        find: 'const l=await this.fetchWithRetry(`/trackManifests/?${r.toString()}`,{type:"streaming",validateResponse:(e)=>{const t=e=>{if(!e||"object"!=typeof e)return null;for(const i of ["manifest","OriginalTrackUrl","originalTrackUrl","url","streamUrl"]){if(typeof e[i]==="string"&&e[i])return e[i]}for(const i of Object.values(e)){const e=t(i);if(e)return e}return null};return!!t(e)}}),c=await l.json(),d=this.parseTrackLookup(await this.normalizeTrackManifestResponse(c,t));return l instanceof ha||await this.cache.set("track",a,d),d}',
        replace:
            'let l,d,__hzE1;try{l=await this.fetchWithRetry("/trackManifests/?"+r.toString(),{type:"streaming",deadlineMs:2e4,validateResponse:__hzManifestOk}),d=this.parseTrackLookup(await this.normalizeTrackManifestResponse(await l.json(),t))}catch(c){if(c&&"AbortError"===c.name)throw c;__hzE1=c,console.warn("[HidzMusify] /trackManifests failed, trying legacy /track/ endpoint:",c&&c.message);try{l=await this.fetchWithRetry("/track/?"+new URLSearchParams({id:String(e),quality:n}).toString(),{type:"streaming",deadlineMs:2e4,validateResponse:__hzLegacyOk});const m=await l.json();d=this.parseTrackLookup([{id:Number(e),duration:0},m.data||m])}catch(h){if(h&&"AbortError"===h.name)throw h;throw new Error("Could not resolve a stream for this track ("+(__hzE1&&__hzE1.message||"manifest error")+"; legacy: "+(h&&h.message||"error")+")")}}return l instanceof ha||await this.cache.set("track",a,d),d}',
    },
    {
        id: 'P9a-manifest-fetch-timeout',
        why: 'The signed-manifest download had no timeout.',
        find: 'const n=await fetch(s);if(!n.ok)throw new Error(`Failed to fetch signed track manifest: HTTP ${n.status}`)',
        replace:
            'const n=await fetch(s,{signal:__hzSig(null,15e3)});if(!n.ok)throw new Error(`Failed to fetch signed track manifest: HTTP ${n.status}`)',
    },
    {
        id: 'P9b-track-info-deadline',
        why: '/info/ (used to look up the ISRC before streaming) could block playback for the default 30s; bound it to 8s.',
        find: 'const a=await this.fetchWithRetry(`/info/?id=${e}`,{type:"api"})',
        replace: 'const a=await this.fetchWithRetry(`/info/?id=${e}`,{type:"api",deadlineMs:8e3})',
    },

    // ------------------------------------------------------------------ player feedback
    {
        id: 'P10a-player-error-feedback',
        why:
            'playTrackFromQueue swallowed every failure: the UI already showed the new track, but no audio started and ' +
            'no message appeared. Reset the play button and tell the user why (autoplay policy vs. stream failure).',
        find: '}catch(S){if(this.playbackSequence!==n)return;if(S&&("NotAllowedError"===S.name||"AbortError"===S.name))return void(this.autoplayBlocked=!0);if("HI_RES_LOSSLESS"===this.quality&&!this.isFallbackRetry){this.isFallbackRetry=!0;const i=this.quality;this.quality="LOSSLESS",this.isFallbackInProgress=!0;try{return void(await this.playTrackFromQueue(e,t,!0))}catch{}finally{this.quality=i,this.isFallbackRetry=!1,this.isFallbackInProgress=!1}return}}}',
        replace:
            '}catch(S){if(this.playbackSequence!==n)return;if(S&&("NotAllowedError"===S.name||"AbortError"===S.name)){if(this.autoplayBlocked=!0,"NotAllowedError"===S.name){Zl.innerHTML=ye(20),__hzNotify(__hzMsg.playBlocked,"playback")}return}if("HI_RES_LOSSLESS"===this.quality&&!this.isFallbackRetry){this.isFallbackRetry=!0;const i=this.quality;this.quality="LOSSLESS",this.isFallbackInProgress=!0;try{return void(await this.playTrackFromQueue(e,t,!0))}catch{}finally{this.quality=i,this.isFallbackRetry=!1,this.isFallbackInProgress=!1}return}console.error("[HidzMusify] playback failed:",S),Zl.innerHTML=ye(20),__hzNotify(__hzMsg.playFailed+": "+__hzReason(S),"playback",8e3)}}',
    },
    {
        id: 'P10c-safePlay-autoplay-feedback',
        why:
            'safePlay() swallowed the browser autoplay-policy rejection (NotAllowedError) and returned false, so the player returned ' +
            'silently while the UI looked like it was playing. Reset the play button and tell the user to press Play (one attempt, no retry loop).',
        find: 'async safePlay(e=this.activeElement){try{return await e.play(),this.autoplayBlocked=!1,!0}catch(t){if(t&&("NotAllowedError"===t.name||"AbortError"===t.name))return this.autoplayBlocked=!0,!1;throw t}}',
        replace:
            'async safePlay(e=this.activeElement){try{return await e.play(),this.autoplayBlocked=!1,!0}catch(t){if(t&&("NotAllowedError"===t.name||"AbortError"===t.name))return this.autoplayBlocked=!0,"NotAllowedError"===t.name&&(Zl.innerHTML=ye(20),__hzNotify(__hzMsg.playBlocked,"playback")),!1;throw t}}',
    },
    {
        id: 'P10b-audio-element-error-feedback',
        why: 'The <audio> error handler computed a reason string and then discarded it; surface it (deduplicated with P10a).',
        find: '!e.currentTrack||!a||1===a.code||e.isFallbackInProgress}),t.addEventListener("volumechange"',
        replace:
            '!e.currentTrack||!a||1===a.code||e.isFallbackInProgress||__hzNotify(__hzMsg.playFailed+": "+s,"playback",8e3)}),t.addEventListener("volumechange"',
    },
];

// ---------------------------------------------------------------------------------------------------
let applied = 0;
for (const ed of edits) {
    const want = ed.count ?? 1;
    const n = src.split(ed.find).length - 1;
    if (n !== want) {
        console.error(`! ${ed.id}: expected ${want} match(es), found ${n}. Bundle changed? Aborting without writing.`);
        process.exit(1);
    }
    src = src.split(ed.find).join(ed.replace);
    applied++;
    console.log(`+ ${ed.id}${want > 1 ? ` (x${want})` : ''}`);
}

// Syntax gate: the patched bundle must parse as an ES module before it is written anywhere.
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hidz-patch-')), 'check.mjs');
fs.writeFileSync(tmp, src);
const res = (() => {
    try {
        execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
        return null;
    } catch (e) {
        return String(e.stderr || e.message);
    }
})();
if (res) {
    const line = res.split('\n').find((l) => /Error/.test(l)) || 'unknown syntax error';
    console.error(`! patched bundle failed the syntax check: ${line}`);
    process.exit(1);
}

fs.writeFileSync(outFile, src);
console.log(`ok: ${applied} edit(s) applied, syntax check passed -> ${outFile}`);
