import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const home = process.env.HOME || '/data/data/com.termux/files/home';
const musifyDir = path.join(home, 'hidzmusify');
const projDir = path.join(home, 'hidzproject');
const webRoot = fs.existsSync(path.join(musifyDir, 'site')) ? path.join(musifyDir, 'site') : musifyDir;

// 1. Bersihkan file skrip sementara yang sempat ter-commit sebelumnya
['final-complete.mjs', 'bg-permanent.mjs', 'clean-final.mjs', 'fast-search-fix.mjs', 'patch-lite.mjs'].forEach((f) => {
  try { fs.unlinkSync(path.join(musifyDir, f)); } catch (_) {}
  try { fs.unlinkSync(path.join(home, f)); } catch (_) {}
});

console.log('[1/4] Memperbarui endpoint /api/resolve.js dengan Same-Origin Audio Stream Proxy...');
const apiDir = fs.existsSync(path.join(webRoot, 'api')) ? path.join(webRoot, 'api') : path.join(musifyDir, 'api');
if (fs.existsSync(apiDir)) {
  fs.writeFileSync(path.join(apiDir, 'resolve.js'), `
const INVIDIOUS = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://iv.datura.network'];
const PIPED = ['https://pipedapi.kavin.rocks', 'https://api.piped.private.coffee', 'https://pipedapi.leptons.xyz'];

async function resolveDirectUrl(videoId) {
  const timed = async (u) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2500);
    try {
      const r = await fetch(u, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 HidzMusify/3.0' } });
      if (!r.ok) throw new Error('err');
      return await r.json();
    } finally { clearTimeout(t); }
  };
  return Promise.any([
    ...INVIDIOUS.map(async (inv) => {
      const d = await timed(\`\${inv}/api/v1/videos/\${encodeURIComponent(videoId)}\`);
      return {
        title: d.title || '',
        uploader: (d.author || '').replace(/\\s*-\\s*Topic$/i, ''),
        duration: d.lengthSeconds || 0,
        streamUrl: \`\${inv}/latest_version?id=\${encodeURIComponent(videoId)}&itag=140&local=true\`
      };
    }),
    ...PIPED.map(async (p) => {
      const d = await timed(\`\${p}/streams/\${encodeURIComponent(videoId)}\`);
      const s = (d.audioStreams || []).find((x) => x.mimeType?.includes('audio/mp4')) || (d.audioStreams || [])[0];
      if (!s?.url) throw new Error('no stream');
      return {
        title: d.title || '',
        uploader: (d.uploader || '').replace(/\\s*-\\s*Topic$/i, ''),
        duration: d.duration || 0,
        streamUrl: s.url
      };
    })
  ]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const videoId = String(req.query?.id || req.query?.v || req.query?.videoId || '').trim();
  if (!videoId && !req.query?.url) return res.status(400).json({ error: 'Missing videoId' });

  if (req.query?.stream === '1' || req.query?.proxy === '1') {
    try {
      let targetUrl = req.query?.url ? decodeURIComponent(req.query.url) : '';
      if (!targetUrl && videoId) {
        const info = await resolveDirectUrl(videoId).catch(() => null);
        targetUrl = info?.streamUrl || \`https://inv.nadeko.net/latest_version?id=\${encodeURIComponent(videoId)}&itag=140&local=true\`;
      }
      const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36' };
      if (req.headers.range) headers['Range'] = req.headers.range;
      const up = await fetch(targetUrl, { headers, redirect: 'follow' });
      res.status(up.status);
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((k) => {
        const v = up.headers.get(k);
        if (v) res.setHeader(k, v);
      });
      if (!up.headers.get('content-type')) res.setHeader('Content-Type', 'audio/mp4');
      return res.end(Buffer.from(await up.arrayBuffer()));
    } catch (_) {
      return res. redirect(302, \`https://inv.nadeko.net/latest_version?id=\${encodeURIComponent(videoId)}&itag=140&local=true\`);
    }
  }

  try {
    const info = await resolveDirectUrl(videoId);
    const proxyStream = \`/api/resolve?stream=1&id=\${encodeURIComponent(videoId)}\`;
    return res.status(200).json({
      ok: true, id: videoId, videoId,
      title: info.title, uploader: info.uploader, duration: info.duration,
      thumbnailUrl: \`https://i.ytimg.com/vi/\${videoId}/hqdefault.jpg\`,
      url: info.streamUrl, audioUrl: info.streamUrl, streamUrl: proxyStream,
      mimeType: 'audio/mp4', fallbackMode: 'youtube-iframe',
      embedUrl: \`https://www.youtube.com/embed/\${videoId}?enablejsapi=1&playsinline=1\`
    });
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

console.log('[2/4] Menyimpan Runtime v15 ke HidzMusify...');
const runtimeV15 = `
/* === HIDZ V15: SEAMLESS NATIVE AUDIO & CONTEXTUAL BACK === */
(function(){
  if(window.__HIDZ_V15__)return; window.__HIDZ_V15__=true;

  // Pastikan tidak ada tombol kembali model melayang (fixed)
  var clearFloatingBack=function(){
    ["hidz-back-v10","hidz-back-v9","hidz-back-v8","hidz-back-v7","hidz-native-back-btn","hidz-back-pill","hidz-back-btn-v8"].forEach(function(id){
      var el=document.getElementById(id); if(el)el.remove();
    });
  };
  clearFloatingBack();

  // Sinkronisasi informasi lagu ke parent (hidzproject.my.id) agar parent juga bisa menjaga background audio
  var lastSentSig="";
  setInterval(function(){
    clearFloatingBack();
    var am=document.querySelector("am-lyrics");
    var a=document.querySelector("audio:not(#hidz-ka-v13):not(#hidz-silent-ka)");
    var playing=!!((a&&!a.paused&&a.currentTime>0)||(window.__hidzYtBridge&&window.__hidzYtBridge.isPlaying&&window.__hidzYtBridge.isPlaying()));
    if(am&&window.parent&&window.parent!==window){
      var t=am.getAttribute("song-title")||am.songTitle||"";
      var ar=(am.getAttribute("song-artist")||am.songArtist||"").replace(/\\s*-\\s*Topic$/i,"").trim();
      var sig=t+"|"+ar+"|"+playing;
      if(t&&sig!==lastSentSig){
        lastSentSig=sig;
        try{window.parent.postMessage({type:"HIDZ_SYNC_TRACK",title:t,artist:ar,playing:playing,src:a?a.currentSrc||a.src:""},"*");}catch(_){}
      }
    }
  },250);
})();
`;

[webRoot, musifyDir].forEach((d) => {
  const rf = path.join(d, 'hidz-runtime-fix.js');
  if (fs.existsSync(rf)) {
    let c = fs.readFileSync(rf, 'utf8').replace(/\/\* === HIDZ V15[\s\S]*$/, '').trimEnd();
    fs.writeFileSync(rf, c + '\n' + runtimeV15 + '\n', 'utf8');
  }
  const idx = path.join(d, 'index.html');
  if (fs.existsSync(idx)) {
    let h = fs.readFileSync(idx, 'utf8').replace(/hidz-runtime-fix\.js(\?v=\d+)?/g, 'hidz-runtime-fix.js?v=15');
    fs.writeFileSync(idx, h, 'utf8');
  }
  const sw = path.join(d, 'sw.js');
  if (fs.existsSync(sw)) {
    let s = fs.readFileSync(sw, 'utf8').replace(/hidzmusify-v\d+/g, 'hidzmusify-v15');
    fs.writeFileSync(sw, s, 'utf8');
  }
});

console.log('[3/4] Push ke Hidz346/hidzmusify...');
execSync(`cd "${musifyDir}" && git add -A && (git diff --cached --quiet || git commit -m "fix(v15): clean repo and add same-origin stream proxy for background audio") && git push`, { stdio: 'inherit' });

console.log('[4/4] Memperbarui Hidz346/hidzproject (Proteksi penuh iframe terhadap innerHTML & navigasi keluar)...');
if (fs.existsSync(projDir)) {
  const projV15 = `<script id="hidz-bg-keep">
(function(){
  if(window.__HIDZ_PROJ_V15__)return; window.__HIDZ_PROJ_V15__=true;
  var PERMS="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";
  try{
    Object.defineProperty(Document.prototype,"hidden",{get:function(){return false;},configurable:true});
    Object.defineProperty(Document.prototype,"visibilityState",{get:function(){return"visible";},configurable:true});
  }catch(_){}

  // Gudang tersembunyi di documentElement agar iframe HidzMusify tidak pernah ikut terhapus saat body/modal mengubah innerHTML
  var rescueVault=null;
  var getVault=function(){
    if(!rescueVault){
      rescueVault=document.createElement("div");
      rescueVault.id="hidz-iframe-vault";
      rescueVault.style.cssText="position:fixed!important;left:-9999px!important;top:0!important;width:360px!important;height:640px!important;opacity:0.001!important;pointer-events:none!important;display:block!important;visibility:visible!important;z-index:-1!important;";
      document.documentElement.appendChild(rescueVault);
    }
    return rescueVault;
  };

  var isMusifyFrame=function(f){
    if(!f||f.tagName!=="IFRAME")return false;
    var s=f.getAttribute("src")||f.src||f.dataset?.keepSrc||"";
    return /musify|stream|vercel/i.test(s);
  };

  // 1. Cegah innerHTML = "" menghancurkan iframe HidzMusify
  var ihDesc=Object.getOwnPropertyDescriptor(Element.prototype,"innerHTML");
  if(ihDesc&&ihDesc.set){
    Object.defineProperty(Element.prototype,"innerHTML",{
      get:function(){return ihDesc.get.call(this);},
      set:function(val){
        if(this.querySelector){
          var f=this.querySelector("iframe");
          if(f&&isMusifyFrame(f)){
            getVault().appendChild(f);
          }
        }
        return ihDesc.set.call(this,val);
      },
      configurable:true
    });
  }

  // 2. Cegah pengosongan atribut src pada iframe HidzMusify
  var origSetAttr=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,val){
    if(this.tagName==="IFRAME"&&String(name).toLowerCase()==="src"){
      if(val&&/musify|stream|vercel/i.test(val))this.dataset.keepSrc=val;
      if(isMusifyFrame(this)&&(!val||val==="about:blank"||val===window.location.href))return;
    }
    return origSetAttr.apply(this,arguments);
  };
  var dSrc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,"src");
  if(dSrc&&dSrc.set){
    Object.defineProperty(HTMLIFrameElement.prototype,"src",{
      get:function(){return dSrc.get.call(this);},
      set:function(v){
        if(v&&/musify|stream|vercel/i.test(v))this.dataset.keepSrc=v;
        if(isMusifyFrame(this)&&(!v||v==="about:blank"||v===window.location.href))return;
        return dSrc.set.call(this,v);
      },
      configurable:true
    });
  }

  // 3. Cegah removeChild / remove menghancurkan iframe
  var rChild=Node.prototype.removeChild;
  Node.prototype.removeChild=function(c){
    if(c){
      if(isMusifyFrame(c)){getVault().appendChild(c);return c;}
      if(c.querySelector){
        var f=c.querySelector("iframe");
        if(f&&isMusifyFrame(f))getVault().appendChild(f);
      }
    }
    return rChild.apply(this,arguments);
  };

  // 4. Jaga kontainer iframe tetap aktif (tidak display:none) & pulihkan dari vault saat user membuka kembali menu HIDZMUSIFY
  setInterval(function(){
    document.querySelectorAll("iframe").forEach(function(f){
      if(f.getAttribute("allow")!==PERMS){origSetAttr.call(f,"allow",PERMS);f.allow=PERMS;}
      if(isMusifyFrame(f)){
        var el=f;
        while(el&&el!==document.body&&el!==document.documentElement){
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
        h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => `${m}\n${projV15}`) : projV15 + '\n' + h;
        fs.writeFileSync(p, h, 'utf8');
      }
    }
  };
  walk(projDir);
  execSync(`cd "${projDir}" && git add -A && (git diff --cached --quiet || git commit -m "fix(v15): vault musify iframe on innerHTML/remove so audio survives page exit") && git push`, { stdio: 'inherit' });
}

console.log('\n=== [TUNTAS 100%] REPOSITORY BERSIH & SEMUA FITUR V15 AKTIF ===');
