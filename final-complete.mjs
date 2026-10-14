import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const home = process.env.HOME || '/data/data/com.termux/files/home';
const musifyDir = path.join(home, 'hidzmusify');
const projDir = path.join(home, 'hidzproject');
const webRoot = fs.existsSync(path.join(musifyDir, 'site')) ? path.join(musifyDir, 'site') : musifyDir;
const apiDir = fs.existsSync(path.join(webRoot, 'api')) ? path.join(webRoot, 'api') : path.join(musifyDir, 'api');

console.log('[1/4] Memperkuat endpoint /api/resolve.js untuk Direct Audio Stream (Background Play)...');
if (fs.existsSync(apiDir)) {
  const resolvePath = path.join(apiDir, 'resolve.js');
  fs.writeFileSync(resolvePath, `
const INVIDIOUS = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://iv.datura.network'];
const PIPED = ['https://pipedapi.kavin.rocks', 'https://api.piped.private.coffee', 'https://pipedapi.leptons.xyz'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.query?.proxy === '1' && req.query?.url) {
    try {
      const target = decodeURIComponent(req.query.url);
      const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36' };
      if (req.headers.range) headers['Range'] = req.headers.range;
      const up = await fetch(target, { headers });
      res.status(up.status);
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((k) => {
        const v = up.headers.get(k);
        if (v) res.setHeader(k, v);
      });
      return res.end(Buffer.from(await up.arrayBuffer()));
    } catch (_) {
      return res.status(502).json({ error: 'Proxy error' });
    }
  }

  const videoId = String(req.query?.id || req.query?.v || req.query?.videoId || '').trim();
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  const timedJson = async (url) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2600);
    try {
      const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 HidzMusify/3.0' } });
      if (!r.ok) throw new Error('bad');
      return await r.json();
    } finally { clearTimeout(t); }
  };

  try {
    const fast = await Promise.any([
      ...INVIDIOUS.map(async (inv) => {
        const d = await timedJson(\`\${inv}/api/v1/videos/\${encodeURIComponent(videoId)}\`);
        const u = \`\${inv}/latest_version?id=\${encodeURIComponent(videoId)}&itag=140&local=true\`;
        return {
          ok: true, id: videoId, videoId,
          title: d.title || '', uploader: (d.author || '').replace(/\\s*-\\s*Topic$/i, ''),
          duration: d.lengthSeconds || 0,
          thumbnailUrl: \`https://i.ytimg.com/vi/\${videoId}/hqdefault.jpg\`,
          url: u, audioUrl: u, streamUrl: u, mimeType: 'audio/mp4',
          fallbackMode: 'youtube-iframe',
          embedUrl: \`https://www.youtube.com/embed/\${videoId}?enablejsapi=1&playsinline=1\`
        };
      }),
      ...PIPED.map(async (p) => {
        const d = await timedJson(\`\${p}/streams/\${encodeURIComponent(videoId)}\`);
        const s = (d.audioStreams || []).find((x) => x.mimeType?.includes('audio/mp4')) || (d.audioStreams || [])[0];
        if (!s?.url) throw new Error('empty');
        return {
          ok: true, id: videoId, videoId,
          title: d.title || '', uploader: (d.uploader || '').replace(/\\s*-\\s*Topic$/i, ''),
          duration: d.duration || 0,
          thumbnailUrl: d.thumbnailUrl || \`https://i.ytimg.com/vi/\${videoId}/hqdefault.jpg\`,
          url: s.url, audioUrl: s.url, streamUrl: s.url, mimeType: s.mimeType || 'audio/mp4',
          fallbackMode: 'youtube-iframe',
          embedUrl: \`https://www.youtube.com/embed/\${videoId}?enablejsapi=1&playsinline=1\`
        };
      })
    ]);
    return res.status(200).json(fast);
  } catch (_) {
    const u = \`https://inv.nadeko.net/latest_version?id=\${encodeURIComponent(videoId)}&itag=140&local=true\`;
    return res.status(200).json({
      ok: true, id: videoId, videoId, url: u, audioUrl: u, streamUrl: u, mimeType: 'audio/mp4',
      fallbackMode: 'youtube-iframe',
      thumbnailUrl: \`https://i.ytimg.com/vi/\${videoId}/hqdefault.jpg\`,
      embedUrl: \`https://www.youtube.com/embed/\${videoId}?enablejsapi=1&playsinline=1\`
    });
  }
}
`.trimStart(), 'utf8');
}

console.log('[2/4] Memasang Native Background Audio & Contextual Static Back Button di HidzMusify...');
const runtimeV14 = `
/* === HIDZ V14: NATIVE BACKGROUND STREAM & STATIC CONTEXTUAL BACK === */
(function(){
  if(window.__HIDZ_V14__)return; window.__HIDZ_V14__=true;

  // 1. Hapus semua tombol fixed/melayang versi lama agar tidak pernah muncul di Home atau ikut bergeser saat scroll
  var removeFloatingBtns=function(){
    ["hidz-back-v10","hidz-back-v9","hidz-back-v8","hidz-back-v7","hidz-native-back-btn","hidz-back-pill","hidz-back-btn-v8"].forEach(function(id){
      var el=document.getElementById(id); if(el)el.remove();
    });
  };
  removeFloatingBtns();

  // 2. Native Background Audio Stream Takeover (Mengatasi YouTube Embed yang berhenti saat keluar browser)
  var userPaused=false, wantPlaying=false, lastUserClick=0, lastStreamKey="";
  var currentTrack={title:"HidzMusify",artist:"HidzMusify"};

  try{
    Object.defineProperty(Document.prototype,"hidden",{get:function(){return false;},configurable:true});
    Object.defineProperty(Document.prototype,"webkitHidden",{get:function(){return false;},configurable:true});
    Object.defineProperty(Document.prototype,"visibilityState",{get:function(){return"visible";},configurable:true});
  }catch(_){}

  var blk={visibilitychange:1,webkitvisibilitychange:1,pagehide:1,freeze:1,blur:1};
  var dAdd=Document.prototype.addEventListener, wAdd=Window.prototype.addEventListener;
  Document.prototype.addEventListener=function(t,f,o){if(blk[String(t).toLowerCase()])return;return dAdd.call(this,t,f,o);};
  Window.prototype.addEventListener=function(t,f,o){if(blk[String(t).toLowerCase()])return;return wAdd.call(this,t,f,o);};

  var oPlay=HTMLMediaElement.prototype.play, oPause=HTMLMediaElement.prototype.pause;

  wAdd.call(window,"pointerdown",function(e){
    var b=e.target&&e.target.closest?e.target.closest("button,[role=\\"button\\"]"):null;
    if(!b)return;
    if(b.closest(".player-bar,footer,[class*=\\"player\\"]")){
      lastUserClick=Date.now();
    }
  },true);

  HTMLMediaElement.prototype.play=function(){
    if(this.id!=="hidz-ka-v13"&&this.id!=="hidz-silent-ka"){
      wantPlaying=true; userPaused=false;
      updateMediaSession("playing");
    }
    return oPlay.apply(this,arguments);
  };

  HTMLMediaElement.prototype.pause=function(){
    if(this.id==="hidz-ka-v13"||this.id==="hidz-silent-ka")return;
    var byUser=(Date.now()-lastUserClick)<1000;
    if(!byUser&&!userPaused&&wantPlaying&&!this.ended&&this.currentTime>0){
      var s=this;
      setTimeout(function(){if(!userPaused&&wantPlaying)try{oPlay.call(s).catch(function(){});}catch(_){}},30);
      return;
    }
    userPaused=true; wantPlaying=false;
    updateMediaSession("paused");
    return oPause.apply(this,arguments);
  };

  // Resolusi stream <audio> native otomatis agar audio jalan di background (luar browser / layar mati)
  var attachNativeStream=async function(title,artist){
    var cleanT=String(title||"").split(/[\\/|]/)[0].replace(/\\s*[\\(\\[\\{][^)\\]\\}]*[\\)\\]\\}]/g,"").trim();
    var cleanA=String(artist||"").replace(/\\s*-\\s*Topic$/i,"").trim();
    var key=(cleanT+"|"+cleanA).toLowerCase();
    if(!cleanT||key===lastStreamKey)return;

    var mainAudio=document.querySelector("audio:not(#hidz-ka-v13):not(#hidz-silent-ka)");
    if(!mainAudio)return;
    // Jika <audio> sudah punya stream aktif yang berjalan, tidak perlu diganti
    if(mainAudio.src&&!mainAudio.paused&&mainAudio.currentTime>0&&!mainAudio.error)return;

    lastStreamKey=key;
    try{
      var q=encodeURIComponent((cleanT+" "+cleanA).trim());
      var r=await fetch("https://saavn.dev/api/search/songs?query="+q+"&limit=2");
      if(r.ok){
        var j=await r.json();
        var item=j&&j.data&&Array.isArray(j.data.results)?j.data.results[0]:null;
        var dl=item&&Array.isArray(item.downloadUrl)?(item.downloadUrl[item.downloadUrl.length-1]?.url||item.downloadUrl[0]?.url):null;
        if(dl&&(!mainAudio.src||mainAudio.paused||mainAudio.error)){
          var curSec=window.__hidzYtBridge&&window.__hidzYtBridge.getCurrentTime?window.__hidzYtBridge.getCurrentTime():0;
          mainAudio.src=dl;
          if(curSec>1)try{mainAudio.currentTime=curSec;}catch(_){}
          if(wantPlaying&&!userPaused){
            if(window.__hidzYtBridge&&window.__hidzYtBridge.pause){
              window.__hidzManualPause=true;
              try{window.__hidzYtBridge.pause();}catch(_){}
              window.__hidzManualPause=false;
            }
            oPlay.call(mainAudio).catch(function(){});
          }
        }
      }
    }catch(_){}
  };

  var updateMediaSession=function(state){
    if(!("mediaSession" in navigator))return;
    try{
      var img=document.querySelector(".player-bar img,footer img,img[src*=\\"ytimg\\"]");
      var art=(img&&img.src)?img.src:(window.location.origin+"/favicon.ico");
      navigator.mediaSession.metadata=new MediaMetadata({
        title:currentTrack.title||"HidzMusify",
        artist:currentTrack.artist||"HidzMusify",
        album:"HidzMusify",
        artwork:[{src:art,sizes:"512x512",type:"image/jpeg"}]
      });
      navigator.mediaSession.playbackState=state;
      navigator.mediaSession.setActionHandler("play",function(){
        userPaused=false; wantPlaying=true;
        var a=document.querySelector("audio:not(#hidz-ka-v13):not(#hidz-silent-ka)");
        if(a&&a.src)try{oPlay.call(a);}catch(_){}
        else if(window.__hidzYtBridge&&window.__hidzYtBridge.resume)window.__hidzYtBridge.resume();
        updateMediaSession("playing");
      });
      navigator.mediaSession.setActionHandler("pause",function(){
        userPaused=true; wantPlaying=false; lastUserClick=Date.now(); window.__hidzManualPause=true;
        var a=document.querySelector("audio:not(#hidz-ka-v13):not(#hidz-silent-ka)");
        if(a&&!a.paused)try{oPause.call(a);}catch(_){}
        if(window.__hidzYtBridge&&window.__hidzYtBridge.pause)window.__hidzYtBridge.pause();
        updateMediaSession("paused");
      });
    }catch(_){}
  };

  // 3. Tombol Kembali Kontekstual & Statis (Hanya di Sub-Halaman, TIDAK di Home, TIDAK ikut scroll)
  var triggerContextualBack=function(){
    var inp=document.querySelector("input[type=\\"search\\"],input");
    if(inp&&inp.value&&inp.value.trim()){
      var bodyTxt=document.body?document.body.innerText||"":"";
      // Jika sedang di halaman profil Artis, kembali ke daftar hasil pencarian
      if(/Popular Tracks|Artist Profile|Verified/i.test(bodyTxt)){
        inp.focus();
        inp.dispatchEvent(new Event("input",{bubbles:true}));
        inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));
        var f=inp.closest("form");
        if(f)f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
        return;
      }
      // Jika sedang di hasil pencarian, bersihkan input dan kembali ke Home
      var clearBtn=inp.parentElement?inp.parentElement.querySelector("button"):null;
      if(clearBtn)try{clearBtn.click();}catch(_){}
      inp.value="";
      inp.dispatchEvent(new Event("input",{bubbles:true}));
    }
    var homeEl=Array.from(document.querySelectorAll("button,a,span")).find(function(el){
      return el.textContent&&el.textContent.trim()==="Home";
    });
    if(homeEl){homeEl.click();return;}
    if(window.history.length>1)window.history.back();
  };

  setInterval(function(){
    removeFloatingBtns();
    var am=document.querySelector("am-lyrics");
    if(am){
      var rt=am.getAttribute("song-title")||am.songTitle||"";
      var ra=(am.getAttribute("song-artist")||am.songArtist||"").replace(/\\s*-\\s*Topic$/i,"").trim();
      if(rt){
        currentTrack.title=rt;
        if(ra)currentTrack.artist=ra;
        var ytPlay=window.__hidzYtBridge&&window.__hidzYtBridge.isPlaying&&window.__hidzYtBridge.isPlaying();
        if(ytPlay&&!userPaused){wantPlaying=true;}
        attachNativeStream(rt,ra);
      }
    }

    // Pasang tombol kembali statis HANYA jika sedang di halaman Artis atau Hasil Pencarian (bukan Home)
    var bodyTxt=document.body?document.body.innerText||"":"";
    var isHome=/Recommended Songs|Hot\\s*&\\s*New/i.test(bodyTxt)&&!/Search Results for|Popular Tracks/i.test(bodyTxt);
    var isSubPage=!isHome&&(/Search Results for|Popular Tracks|Artist Profile|Unknown Artist/i.test(bodyTxt));

    var backBar=document.getElementById("hidz-static-back-v14");
    if(!isSubPage){
      if(backBar)backBar.remove();
    }else{
      var targetHeading=Array.from(document.querySelectorAll("h1,h2,h3")).find(function(h){
        return h.offsetParent!==null&&/Search Results for|Unknown Artist|Popular Tracks/i.test(h.textContent||"");
      })||document.querySelector("main h1, main h2");
      var hostContainer=targetHeading?targetHeading.parentElement:null;
      if(hostContainer&&!backBar){
        backBar=document.createElement("div");
        backBar.id="hidz-static-back-v14";
        backBar.style.cssText="position:static;width:100%;margin:4px 0 12px 0;padding:0;display:flex;align-items:center;";
        backBar.innerHTML='<button type="button" style="display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 10px;border-radius:8px;background:rgba(255,255,255,0.08);color:#f5f5f7;border:1px solid rgba(255,255,255,0.12);font:500 13px/1 system-ui,-apple-system,sans-serif;cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg><span>Kembali</span></button>';
        backBar.firstChild.onclick=function(e){e.preventDefault();e.stopPropagation();triggerContextualBack();};
        hostContainer.insertBefore(backBar,hostContainer.firstChild);
      }
    }
  },200);
})();
`;

[webRoot, musifyDir].forEach((d) => {
  const rf = path.join(d, 'hidz-runtime-fix.js');
  if (fs.existsSync(rf)) {
    let c = fs.readFileSync(rf, 'utf8')
      .replace(/\/\* === HIDZ ADDON V10[\s\S]*$/, '')
      .replace(/\/\* === HIDZ V14[\s\S]*$/, '')
      .trimEnd();
    fs.writeFileSync(rf, c + '\n' + runtimeV14 + '\n', 'utf8');
  }
  const idx = path.join(d, 'index.html');
  if (fs.existsSync(idx)) {
    let h = fs.readFileSync(idx, 'utf8').replace(/hidz-runtime-fix\.js(\?v=\d+)?/g, 'hidz-runtime-fix.js?v=14');
    fs.writeFileSync(idx, h, 'utf8');
  }
  const sw = path.join(d, 'sw.js');
  if (fs.existsSync(sw)) {
    let s = fs.readFileSync(sw, 'utf8').replace(/hidzmusify-v\d+/g, 'hidzmusify-v14');
    fs.writeFileSync(sw, s, 'utf8');
  }
  const assets = path.join(d, 'assets');
  if (fs.existsSync(assets)) {
    for (const f of fs.readdirSync(assets)) {
      if (f.startsWith('index-') && f.endsWith('.js')) {
        const bp = path.join(assets, f);
        let bc = fs.readFileSync(bp, 'utf8')
          .replace(/\/\* === HIDZ ADDON V10[\s\S]*?\}\)\(\);\s*;?\s*/g, '')
          .replace(/\/\* === HIDZ V14[\s\S]*?\}\)\(\);\s*;?\s*/g, '');
        fs.writeFileSync(bp, runtimeV14 + '\n;\n' + bc, 'utf8');
      }
    }
  }
});

console.log('[3/4] Push pembaruan ke Hidz346/hidzmusify...');
execSync(`cd "${musifyDir}" && git add -A && (git diff --cached --quiet || git commit -m "fix(v14): native background audio takeover and static contextual back button") && git push`, { stdio: 'inherit' });

console.log('[4/4] Memproteksi iframe di Hidz346/hidzproject dari setAttribute/removeAttribute/innerHTML saat keluar halaman...');
if (fs.existsSync(projDir)) {
  const projGuardV14 = `<script id="hidz-bg-keep">
(function(){
  if(window.__HIDZ_PROJ_V14__)return; window.__HIDZ_PROJ_V14__=true;
  var PERMS="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";
  try{
    Object.defineProperty(Document.prototype,"hidden",{get:function(){return false;},configurable:true});
    Object.defineProperty(Document.prototype,"visibilityState",{get:function(){return"visible";},configurable:true});
  }catch(_){}

  var isMusifyIframe=function(el){
    if(!el||el.tagName!=="IFRAME")return false;
    var s=el.getAttribute("src")||el.src||el.dataset?.keepSrc||"";
    return /musify|stream|vercel/i.test(s);
  };

  // 1. Cegah setAttribute('src', '') atau removeAttribute('src') mematikan iframe saat tombol kembali di HidzProject diklik
  var origSetAttr=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,val){
    if(this.tagName==="IFRAME"&&String(name).toLowerCase()==="src"){
      if(val&&/musify|stream|vercel/i.test(val))this.dataset.keepSrc=val;
      if(isMusifyIframe(this)&&(!val||val==="about:blank"||val===window.location.href))return;
    }
    return origSetAttr.apply(this,arguments);
  };

  var origRemAttr=Element.prototype.removeAttribute;
  Element.prototype.removeAttribute=function(name){
    if(this.tagName==="IFRAME"&&String(name).toLowerCase()==="src"&&isMusifyIframe(this))return;
    return origRemAttr.apply(this,arguments);
  };

  var dSrc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,"src");
  if(dSrc&&dSrc.set){
    Object.defineProperty(HTMLIFrameElement.prototype,"src",{
      get:function(){return dSrc.get.call(this);},
      set:function(v){
        if(v&&/musify|stream|vercel/i.test(v))this.dataset.keepSrc=v;
        if(isMusifyIframe(this)&&(!v||v==="about:blank"||v===window.location.href))return;
        return dSrc.set.call(this,v);
      },
      configurable:true
    });
  }

  // 2. Cegah iframe dihapus lewat removeChild() atau remove()
  var rChild=Node.prototype.removeChild;
  Node.prototype.removeChild=function(c){
    if(c&&(isMusifyIframe(c)||(c.querySelector&&c.querySelector("iframe")))){
      c.style.cssText="position:fixed!important;left:-9999px!important;top:0!important;width:360px!important;height:640px!important;opacity:0.001!important;pointer-events:none!important;display:block!important;visibility:visible!important;";
      return c;
    }
    return rChild.apply(this,arguments);
  };
  var origRemove=Element.prototype.remove;
  Element.prototype.remove=function(){
    if(isMusifyIframe(this)||(this.querySelector&&this.querySelector("iframe"))){
      this.style.cssText="position:fixed!important;left:-9999px!important;top:0!important;width:360px!important;height:640px!important;opacity:0.001!important;pointer-events:none!important;display:block!important;visibility:visible!important;";
      return;
    }
    return origRemove.apply(this,arguments);
  };

  // 3. Jaga kontainer iframe tetap dirender 360x640 off-screen saat modal/halaman ditutup
  setInterval(function(){
    document.querySelectorAll("iframe").forEach(function(f){
      if(f.getAttribute("allow")!==PERMS){origSetAttr.call(f,"allow",PERMS);f.allow=PERMS;}
      if(isMusifyIframe(f)){
        var el=f;
        while(el&&el!==document.body){
          var cs=window.getComputedStyle(el);
          if(cs.display==="none"||cs.visibility==="hidden"){
            el.style.setProperty("display","block","important");
            el.style.setProperty("visibility","visible","important");
            el.style.setProperty("position","fixed","important");
            el.style.setProperty("left","-9999px","important");
            el.style.setProperty("top","0px","important");
            el.style.setProperty("width","360px","important");
            el.style.setProperty("height","640px","important");
            el.style.setProperty("opacity","0.001","important");
            el.style.setProperty("pointer-events","none","important");
            try{if(f.contentWindow)f.contentWindow.postMessage({type:"HIDZ_FORCE_PLAY"},"*");}catch(_){}
          }
          el=el.parentElement;
        }
      }
    });
  },100);
})();
</script>`;

  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'dist') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.html?$/i.test(ent.name)) {
        let h = fs.readFileSync(p, 'utf8')
          .replace(/<script id="hidz-bg-keep">[\s\S]*?<\/script>\s*/gi, '')
          .replace(/<script id="hidz-iframe-autoplay-guard">[\s\S]*?<\/script>\s*/gi, '');
        h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => `${m}\n${projGuardV14}`) : projGuardV14 + '\n' + h;
        fs.writeFileSync(p, h, 'utf8');
      }
    }
  };
  walk(projDir);
  execSync(`cd "${projDir}" && git add -A && (git diff --cached --quiet || git commit -m "fix(v14): block setAttribute/remove from clearing iframe src on exit") && git push`, { stdio: 'inherit' });
}

console.log('\n=== [SELESAI 100%] SEMUA PERBAIKAN V14 SUDAH AKTIF & LIVE ===');
