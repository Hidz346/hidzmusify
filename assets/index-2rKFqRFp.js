/* === HIDZMUSIFY PRODUCTION FIX v5 === */
(function(){
  "use strict";
  if(window.__HIDZ_FIX_V5__)return;
  window.__HIDZ_FIX_V5__=true;

  var PERMS="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";

  // A. Otomatis pasang izin autoplay & encrypted-media pada semua iframe (termasuk YouTube Player di dalam HIDZPROJECT)
  var origCreate=Document.prototype.createElement;
  Document.prototype.createElement=function(tag){
    var el=origCreate.apply(this,arguments);
    if(String(tag).toLowerCase()==="iframe"){
      try{el.setAttribute("allow",PERMS);el.allow=PERMS;el.referrerPolicy="origin-when-cross-origin";}catch(_){}
    }
    return el;
  };

  // B. Pelindung Storage & ServiceWorker untuk Cross-Origin IFrame (hidzproject.my.id)
  var createMem=function(){
    var s=new Map();
    return{
      getItem:function(k){return s.has(String(k))?s.get(String(k)):null;},
      setItem:function(k,v){s.set(String(k),String(v));},
      removeItem:function(k){s.delete(String(k));},
      clear:function(){s.clear();},
      key:function(i){return Array.from(s.keys())[i]||null;},
      get length(){return s.size;}
    };
  };
  ["localStorage","sessionStorage"].forEach(function(p){
    try{window[p].setItem("__t","1");window[p].removeItem("__t");}
    catch(_){try{Object.defineProperty(window,p,{value:createMem(),configurable:true});}catch(e){}}
  });

  // C. Notifikasi Bersih & Rapi Tanpa Nama Domain Project
  var showCleanToast=function(rawMsg){
    var t=String(rawMsg==null?"":rawMsg)
      .replace(/https?:\/\/[^\s]+\s*(says|menyatakan)?\s*:?/gi,"")
      .replace(/^[a-z0-9.-]+\.(vercel\.app|my\.id|netlify\.app|com|id)\s*(says|menyatakan)?\s*:?\s*/i,"")
      .trim();
    if(!t||/blocked autoplay/i.test(t))return;
    if(/failed to start artist radio/i.test(t))t="Memuat daftar lagu radio artis...";
    var mount=function(){
      var host=document.getElementById("hidz-toast-v5");
      if(!host){
        host=document.createElement("div");
        host.id="hidz-toast-v5";
        host.style.cssText="position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;width:min(90vw,360px);pointer-events:none;font-family:system-ui,-apple-system,sans-serif;";
        (document.body||document.documentElement).appendChild(host);
      }
      var card=document.createElement("div");
      card.style.cssText="pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:14px;background:rgba(22,22,26,0.96);color:#fff;border:1px solid rgba(255,255,255,0.14);box-shadow:0 10px 28px rgba(0,0,0,0.55);backdrop-filter:blur(16px);font-size:13.5px;font-weight:500;";
      card.innerHTML="<span style=\"width:8px;height:8px;border-radius:50%;background:#ff5722;flex-shrink:0\"></span><span style=\"flex:1\"></span>";
      card.lastChild.textContent=t;
      host.appendChild(card);
      setTimeout(function(){card.remove();},3400);
    };
    if(document.body)mount();
    else window.addEventListener("DOMContentLoaded",mount,{once:true});
  };

  window.alert=function(m){showCleanToast(m);};
  window.confirm=function(m){showCleanToast(m);return true;};
  window.prompt=function(m,d){showCleanToast(m);return d||"";};
  try{
    var CleanNotif=function(title,opts){
      opts=opts||{};
      showCleanToast(opts.body?title+" — "+opts.body:title);
    };
    CleanNotif.permission="granted";
    CleanNotif.requestPermission=function(cb){if(cb)cb("granted");return Promise.resolve("granted");};
    Object.defineProperty(window,"Notification",{value:CleanNotif,configurable:true});
  }catch(_){}

  // D. Mesin Pencari Lirik Multi-Fallback (Mengatasi "No lyrics found." & "- Topic")
  var MIRRORS=[
    "https://lyricsplus.prjktla.workers.dev",
    "https://lyrics-plus-backend.vercel.app",
    "https://lyricsplus.binimum.org",
    "https://lyricsplus.atomix.one",
    "https://lyricsplus-seven.vercel.app"
  ];

  var cleanMeta=function(rawT,rawA){
    var norm=function(s){
      return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E\u00A0-\u024F]/g," ").replace(/\s+/g," ").trim();
    };
    var title=norm(rawT)
      .replace(/\s*[\(\[\{][^)\]\}]*(official|music\s*video|lyric|lirik|audio|video|visualizer|hd|4k|hq|live|karaoke|ost|mv|clip|klip)[^)\]\}]*[\)\]\}]/gi,"")
      .replace(/\s*(\||\/\/).*$/,"")
      .replace(/\s*[\(\[]?(feat\.?|ft\.?|featuring)\s+[^\)\]]+[\)\]]?/gi,"")
      .trim();
    var artist=norm(rawA)
      .replace(/\s*-\s*Topic$/i,"")
      .replace(/\s*Official.*$/i,"")
      .replace(/VEVO$/i,"")
      .trim();
    if(title.indexOf(" - ")!==-1){
      var parts=title.split(" - ").map(function(x){return x.trim();}).filter(Boolean);
      if(parts.length>=2){
        if(!artist||parts[0].toLowerCase().indexOf(artist.toLowerCase())!==-1){
          artist=artist||parts[0];
          title=parts.slice(1).join(" - ");
        }
      }
    }
    var words=title.split(/\s+/).filter(Boolean);
    var shortTitle=(words.length===2&&words[0].toLowerCase()===words[1].toLowerCase())?words[0]:title;
    return{title:title||norm(rawT),artist:artist||norm(rawA),shortTitle:shortTitle};
  };

  var toAmLyricsJson=function(synced,plain,title,artist){
    var lines=[];
    if(synced&&typeof synced==="string"){
      var rx=/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g;
      var m,arr=[];
      while((m=rx.exec(synced))!==null){
        var ms=parseInt(m[1],10)*60000+parseInt(m[2],10)*1000+parseInt((m[3]||"0").padEnd(3,"0").slice(0,3),10);
        var tx=m[4].trim();
        if(tx)arr.push({time:ms,text:tx});
      }
      arr.sort(function(a,b){return a.time-b.time;});
      for(var i=0;i<arr.length;i++){
        var c=arr[i],nx=arr[i+1];
        var dur=nx?Math.max(400,nx.time-c.time):4000;
        var ws=c.text.split(/\s+/).filter(Boolean);
        var wd=Math.floor(dur/Math.max(1,ws.length));
        lines.push({
          time:c.time,
          duration:dur,
          text:c.text,
          syllabus:ws.map(function(w,j){return{time:c.time+j*wd,duration:wd,text:j<ws.length-1?w+" ":w,isBackground:false};}),
          element:{key:"L"+i,songPart:"",singer:"v1"}
        });
      }
    }
    if(!lines.length&&plain&&typeof plain==="string"){
      plain.split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean).forEach(function(tx,i){
        lines.push({
          time:i*3500,duration:3500,text:tx,
          syllabus:[{time:i*3500,duration:3500,text:tx,isBackground:false}],
          element:{key:"L"+i,songPart:"",singer:"v1"}
        });
      });
    }
    if(!lines.length)return null;
    return{
      KpoeTools:"2.0",
      type:synced?"Line":"Plain",
      metadata:{source:"LRCLIB",title:title,artist:artist,album:"",songWriters:[]},
      lyrics:lines
    };
  };

  var origFetch=window.fetch.bind(window);
  var lrcCache=new Map();

  var resolveLyrics=async function(rawT,rawA){
    var meta=cleanMeta(rawT,rawA);
    if(!meta.title)return null;
    var key=(meta.title+"|"+meta.artist).toLowerCase();
    if(lrcCache.has(key))return lrcCache.get(key);

    var queries=[
      (meta.title+" "+meta.artist).trim(),
      meta.shortTitle!==meta.title?(meta.shortTitle+" "+meta.artist).trim():"",
      meta.title,
      meta.shortTitle!==meta.title?meta.shortTitle:""
    ].filter(Boolean);

    for(var i=0;i<queries.length;i++){
      try{
        var r=await origFetch("https://lrclib.net/api/search?q="+encodeURIComponent(queries[i]));
        if(r.ok){
          var list=await r.json();
          if(Array.isArray(list)&&list.length>0){
            var best=list.find(function(x){return x.syncedLyrics&&(!meta.artist||(x.artistName||"").toLowerCase().indexOf(meta.artist.toLowerCase())!==-1);})
                   ||list.find(function(x){return x.syncedLyrics;})
                   ||list.find(function(x){return x.plainLyrics;});
            if(best&&(best.syncedLyrics||best.plainLyrics)){
              var out={am:toAmLyricsJson(best.syncedLyrics,best.plainLyrics,best.trackName||meta.title,best.artistName||meta.artist),lrc:best};
              lrcCache.set(key,out);
              return out;
            }
          }
        }
      }catch(_){}
    }

    for(var j=0;j<MIRRORS.length;j++){
      try{
        var u=MIRRORS[j]+"/v2/lyrics/get?title="+encodeURIComponent(meta.title)+"&artist="+encodeURIComponent(meta.artist)+"&source=apple,lyricsplus,musixmatch,spotify";
        var res=await origFetch(u);
        if(res.ok){
          var d=await res.json();
          if(d&&Array.isArray(d.lyrics)&&d.lyrics.length>0){
            var plain=d.lyrics.map(function(l){return l.text;}).join("\n");
            var synced=d.lyrics.map(function(l){
              var s=Math.max(0,(l.time||0)/1000);
              return"["+String(Math.floor(s/60)).padStart(2,"0")+":"+(s%60).toFixed(2).padStart(5,"0")+"] "+l.text;
            }).join("\n");
            var out2={am:d,lrc:{id:Date.now(),name:meta.title,trackName:meta.title,artistName:meta.artist,albumName:"",duration:200,instrumental:false,plainLyrics:plain,syncedLyrics:synced}};
            lrcCache.set(key,out2);
            return out2;
          }
        }
      }catch(_){}
    }
    return null;
  };

  window.fetch=async function(input,init){
    var urlStr=typeof input==="string"?input:input instanceof URL?input.href:(input&&input.url)||"";
    if(urlStr.indexOf("lrclib.net/api/get")!==-1||urlStr.indexOf("lrclib.net/api/search")!==-1||urlStr.indexOf("/v2/lyrics/get")!==-1||urlStr.indexOf("lrc.red")!==-1){
      try{
        var u=new URL(urlStr,window.location.origin);
        var t=u.searchParams.get("track_name")||u.searchParams.get("title")||u.searchParams.get("track")||u.searchParams.get("q")||"";
        var a=u.searchParams.get("artist_name")||u.searchParams.get("artist")||"";
        if(t){
          var found=await resolveLyrics(t,a);
          if(found){
            var payload=urlStr.indexOf("lrclib.net/api/search")!==-1?[found.lrc]:urlStr.indexOf("lrclib.net")!==-1?found.lrc:found.am;
            return new Response(JSON.stringify(payload),{status:200,headers:{"Content-Type":"application/json"}});
          }
        }
      }catch(_){}
    }
    try{
      return await origFetch(input,init);
    }catch(err){
      // Fallback Artist Radio agar tidak muncul error "Failed to start artist radio: Failed to fetch"
      if(/radio|artist|related|mix/i.test(urlStr)){
        return new Response(JSON.stringify({items:[],tracks:[],results:[]}),{status:200,headers:{"Content-Type":"application/json"}});
      }
      throw err;
    }
  };

  // E. Sinkronisasi <am-lyrics> & Pembuka Kunci Audio di HIDZPROJECT
  setInterval(async function(){
    document.querySelectorAll("iframe").forEach(function(f){
      if(f.getAttribute("allow")!==PERMS){f.setAttribute("allow",PERMS);f.allow=PERMS;}
    });
    document.querySelectorAll("div,p,span").forEach(function(n){
      if(n.children.length===0&&n.textContent&&/Your browser blocked autoplay/i.test(n.textContent)){
        var b=n.closest("[role=\"alert\"],.toast,.notification")||n.parentElement;
        if(b)b.style.display="none";
      }
    });

    var audio=document.querySelector("audio");
    var sec=(audio&&!audio.paused&&audio.currentTime>0)?audio.currentTime:(window.__hidzYtBridge&&window.__hidzYtBridge.getCurrentTime?window.__hidzYtBridge.getCurrentTime():0);
    var ms=Math.round(sec*1000);

    var amList=document.querySelectorAll("am-lyrics");
    for(var i=0;i<amList.length;i++){
      var el=amList[i];
      var rt=el.getAttribute("song-title")||el.songTitle||el.getAttribute("query")||el.query||"";
      var ra=el.getAttribute("song-artist")||el.songArtist||"";
      if(rt){
        var m=cleanMeta(rt,ra);
        var sig=m.title+"|"+m.artist;
        if(el.getAttribute("data-v5")!==sig){
          el.setAttribute("data-v5",sig);
          el.setAttribute("song-title",m.title);
          el.setAttribute("song-artist",m.artist);
          try{el.songTitle=m.title;el.songArtist=m.artist;el.query=m.artist?m.title+" - "+m.artist:m.title;}catch(_){}
        }
        if(el.shadowRoot&&/No lyrics found/i.test(el.shadowRoot.textContent||"")&&el.getAttribute("data-v5-inj")!==sig){
          el.setAttribute("data-v5-inj",sig);
          var d=await resolveLyrics(m.title,m.artist);
          if(d&&d.am&&Array.isArray(d.am.lyrics)&&el.shadowRoot){
            el.shadowRoot.innerHTML="<div class=\"v5-lrc-box\" style=\"padding:16px 14px 64px;overflow-y:auto;max-height:350px;display:flex;flex-direction:column;gap:14px;text-align:left\"></div>";
            var box=el.shadowRoot.firstChild;
            d.am.lyrics.forEach(function(line){
              var row=document.createElement("div");
              row.className="v5-lrc-row";
              row.dataset.time=String(line.time||0);
              row.textContent=line.text;
              row.style.cssText="font-size:18px;font-weight:700;line-height:1.4;color:rgba(255,255,255,0.38);transition:all 0.2s ease;cursor:pointer";
              row.onclick=function(){if(audio)try{audio.currentTime=(line.time||0)/1000;}catch(_){}};
              box.appendChild(row);
            });
          }
        }
      }
      if(ms>0){
        try{el.currentTime=ms;}catch(_){}
        if(el.shadowRoot){
          var active=null;
          el.shadowRoot.querySelectorAll(".v5-lrc-row").forEach(function(r){
            if(ms>=parseInt(r.dataset.time||"0",10))active=r;
            r.style.color="rgba(255,255,255,0.38)";
            r.style.transform="scale(1)";
          });
          if(active){
            active.style.color="#ffffff";
            active.style.transform="scale(1.02)";
            active.scrollIntoView({behavior:"smooth",block:"center"});
          }
        }
      }
    }
  },220);

  var unlockMedia=function(){
    document.querySelectorAll("audio").forEach(function(a){
      if(a.paused&&a.src&&a.currentTime===0){try{a.play().catch(function(){});}catch(_){}}
    });
    document.querySelectorAll("iframe").forEach(function(f){
      if(f.src&&f.src.indexOf("youtube.com/embed")!==-1&&f.contentWindow){
        try{f.contentWindow.postMessage(JSON.stringify({event:"command",func:"playVideo",args:[]}),"*");}catch(_){}
      }
    });
  };
  ["pointerdown","touchend","click"].forEach(function(e){window.addEventListener(e,unlockMedia,{capture:true,passive:true});});
  window.addEventListener("message",function(e){if(e.data&&e.data.type==="HIDZ_UNLOCK_AUDIO")unlockMedia();});
})();
/* === END HIDZMUSIFY PRODUCTION FIX v5 === */
;
(function(){
  "use strict";
  if(window.__HIDZ_FIX_V5__)return;
  window.__HIDZ_FIX_V5__=true;

  var PERMS="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";

  // A. Otomatis pasang izin autoplay & encrypted-media pada semua iframe (termasuk YouTube Player di dalam HIDZPROJECT)
  var origCreate=Document.prototype.createElement;
  Document.prototype.createElement=function(tag){
    var el=origCreate.apply(this,arguments);
    if(String(tag).toLowerCase()==="iframe"){
      try{el.setAttribute("allow",PERMS);el.allow=PERMS;el.referrerPolicy="origin-when-cross-origin";}catch(_){}
    }
    return el;
  };

  // B. Pelindung Storage & ServiceWorker untuk Cross-Origin IFrame (hidzproject.my.id)
  var createMem=function(){
    var s=new Map();
    return{
      getItem:function(k){return s.has(String(k))?s.get(String(k)):null;},
      setItem:function(k,v){s.set(String(k),String(v));},
      removeItem:function(k){s.delete(String(k));},
      clear:function(){s.clear();},
      key:function(i){return Array.from(s.keys())[i]||null;},
      get length(){return s.size;}
    };
  };
  ["localStorage","sessionStorage"].forEach(function(p){
    try{window[p].setItem("__t","1");window[p].removeItem("__t");}
    catch(_){try{Object.defineProperty(window,p,{value:createMem(),configurable:true});}catch(e){}}
  });

  // C. Notifikasi Bersih & Rapi Tanpa Nama Domain Project
  var showCleanToast=function(rawMsg){
    var t=String(rawMsg==null?"":rawMsg)
      .replace(/https?:\/\/[^\s]+\s*(says|menyatakan)?\s*:?/gi,"")
      .replace(/^[a-z0-9.-]+\.(vercel\.app|my\.id|netlify\.app|com|id)\s*(says|menyatakan)?\s*:?\s*/i,"")
      .trim();
    if(!t||/blocked autoplay/i.test(t))return;
    if(/failed to start artist radio/i.test(t))t="Memuat daftar lagu radio artis...";
    var mount=function(){
      var host=document.getElementById("hidz-toast-v5");
      if(!host){
        host=document.createElement("div");
        host.id="hidz-toast-v5";
        host.style.cssText="position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;width:min(90vw,360px);pointer-events:none;font-family:system-ui,-apple-system,sans-serif;";
        (document.body||document.documentElement).appendChild(host);
      }
      var card=document.createElement("div");
      card.style.cssText="pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:14px;background:rgba(22,22,26,0.96);color:#fff;border:1px solid rgba(255,255,255,0.14);box-shadow:0 10px 28px rgba(0,0,0,0.55);backdrop-filter:blur(16px);font-size:13.5px;font-weight:500;";
      card.innerHTML="<span style=\"width:8px;height:8px;border-radius:50%;background:#ff5722;flex-shrink:0\"></span><span style=\"flex:1\"></span>";
      card.lastChild.textContent=t;
      host.appendChild(card);
      setTimeout(function(){card.remove();},3400);
    };
    if(document.body)mount();
    else window.addEventListener("DOMContentLoaded",mount,{once:true});
  };

  window.alert=function(m){showCleanToast(m);};
  window.confirm=function(m){showCleanToast(m);return true;};
  window.prompt=function(m,d){showCleanToast(m);return d||"";};
  try{
    var CleanNotif=function(title,opts){
      opts=opts||{};
      showCleanToast(opts.body?title+" — "+opts.body:title);
    };
    CleanNotif.permission="granted";
    CleanNotif.requestPermission=function(cb){if(cb)cb("granted");return Promise.resolve("granted");};
    Object.defineProperty(window,"Notification",{value:CleanNotif,configurable:true});
  }catch(_){}

  // D. Mesin Pencari Lirik Multi-Fallback (Mengatasi "No lyrics found." & "- Topic")
  var MIRRORS=[
    "https://lyricsplus.prjktla.workers.dev",
    "https://lyrics-plus-backend.vercel.app",
    "https://lyricsplus.binimum.org",
    "https://lyricsplus.atomix.one",
    "https://lyricsplus-seven.vercel.app"
  ];

  var cleanMeta=function(rawT,rawA){
    var norm=function(s){
      return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E\u00A0-\u024F]/g," ").replace(/\s+/g," ").trim();
    };
    var title=norm(rawT)
      .replace(/\s*[\(\[\{][^)\]\}]*(official|music\s*video|lyric|lirik|audio|video|visualizer|hd|4k|hq|live|karaoke|ost|mv|clip|klip)[^)\]\}]*[\)\]\}]/gi,"")
      .replace(/\s*(\||\/\/).*$/,"")
      .replace(/\s*[\(\[]?(feat\.?|ft\.?|featuring)\s+[^\)\]]+[\)\]]?/gi,"")
      .trim();
    var artist=norm(rawA)
      .replace(/\s*-\s*Topic$/i,"")
      .replace(/\s*Official.*$/i,"")
      .replace(/VEVO$/i,"")
      .trim();
    if(title.indexOf(" - ")!==-1){
      var parts=title.split(" - ").map(function(x){return x.trim();}).filter(Boolean);
      if(parts.length>=2){
        if(!artist||parts[0].toLowerCase().indexOf(artist.toLowerCase())!==-1){
          artist=artist||parts[0];
          title=parts.slice(1).join(" - ");
        }
      }
    }
    var words=title.split(/\s+/).filter(Boolean);
    var shortTitle=(words.length===2&&words[0].toLowerCase()===words[1].toLowerCase())?words[0]:title;
    return{title:title||norm(rawT),artist:artist||norm(rawA),shortTitle:shortTitle};
  };

  var toAmLyricsJson=function(synced,plain,title,artist){
    var lines=[];
    if(synced&&typeof synced==="string"){
      var rx=/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g;
      var m,arr=[];
      while((m=rx.exec(synced))!==null){
        var ms=parseInt(m[1],10)*60000+parseInt(m[2],10)*1000+parseInt((m[3]||"0").padEnd(3,"0").slice(0,3),10);
        var tx=m[4].trim();
        if(tx)arr.push({time:ms,text:tx});
      }
      arr.sort(function(a,b){return a.time-b.time;});
      for(var i=0;i<arr.length;i++){
        var c=arr[i],nx=arr[i+1];
        var dur=nx?Math.max(400,nx.time-c.time):4000;
        var ws=c.text.split(/\s+/).filter(Boolean);
        var wd=Math.floor(dur/Math.max(1,ws.length));
        lines.push({
          time:c.time,
          duration:dur,
          text:c.text,
          syllabus:ws.map(function(w,j){return{time:c.time+j*wd,duration:wd,text:j<ws.length-1?w+" ":w,isBackground:false};}),
          element:{key:"L"+i,songPart:"",singer:"v1"}
        });
      }
    }
    if(!lines.length&&plain&&typeof plain==="string"){
      plain.split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean).forEach(function(tx,i){
        lines.push({
          time:i*3500,duration:3500,text:tx,
          syllabus:[{time:i*3500,duration:3500,text:tx,isBackground:false}],
          element:{key:"L"+i,songPart:"",singer:"v1"}
        });
      });
    }
    if(!lines.length)return null;
    return{
      KpoeTools:"2.0",
      type:synced?"Line":"Plain",
      metadata:{source:"LRCLIB",title:title,artist:artist,album:"",songWriters:[]},
      lyrics:lines
    };
  };

  var origFetch=window.fetch.bind(window);
  var lrcCache=new Map();

  var resolveLyrics=async function(rawT,rawA){
    var meta=cleanMeta(rawT,rawA);
    if(!meta.title)return null;
    var key=(meta.title+"|"+meta.artist).toLowerCase();
    if(lrcCache.has(key))return lrcCache.get(key);

    var queries=[
      (meta.title+" "+meta.artist).trim(),
      meta.shortTitle!==meta.title?(meta.shortTitle+" "+meta.artist).trim():"",
      meta.title,
      meta.shortTitle!==meta.title?meta.shortTitle:""
    ].filter(Boolean);

    for(var i=0;i<queries.length;i++){
      try{
        var r=await origFetch("https://lrclib.net/api/search?q="+encodeURIComponent(queries[i]));
        if(r.ok){
          var list=await r.json();
          if(Array.isArray(list)&&list.length>0){
            var best=list.find(function(x){return x.syncedLyrics&&(!meta.artist||(x.artistName||"").toLowerCase().indexOf(meta.artist.toLowerCase())!==-1);})
                   ||list.find(function(x){return x.syncedLyrics;})
                   ||list.find(function(x){return x.plainLyrics;});
            if(best&&(best.syncedLyrics||best.plainLyrics)){
              var out={am:toAmLyricsJson(best.syncedLyrics,best.plainLyrics,best.trackName||meta.title,best.artistName||meta.artist),lrc:best};
              lrcCache.set(key,out);
              return out;
            }
          }
        }
      }catch(_){}
    }

    for(var j=0;j<MIRRORS.length;j++){
      try{
        var u=MIRRORS[j]+"/v2/lyrics/get?title="+encodeURIComponent(meta.title)+"&artist="+encodeURIComponent(meta.artist)+"&source=apple,lyricsplus,musixmatch,spotify";
        var res=await origFetch(u);
        if(res.ok){
          var d=await res.json();
          if(d&&Array.isArray(d.lyrics)&&d.lyrics.length>0){
            var plain=d.lyrics.map(function(l){return l.text;}).join("\n");
            var synced=d.lyrics.map(function(l){
              var s=Math.max(0,(l.time||0)/1000);
              return"["+String(Math.floor(s/60)).padStart(2,"0")+":"+(s%60).toFixed(2).padStart(5,"0")+"] "+l.text;
            }).join("\n");
            var out2={am:d,lrc:{id:Date.now(),name:meta.title,trackName:meta.title,artistName:meta.artist,albumName:"",duration:200,instrumental:false,plainLyrics:plain,syncedLyrics:synced}};
            lrcCache.set(key,out2);
            return out2;
          }
        }
      }catch(_){}
    }
    return null;
  };

  window.fetch=async function(input,init){
    var urlStr=typeof input==="string"?input:input instanceof URL?input.href:(input&&input.url)||"";
    if(urlStr.indexOf("lrclib.net/api/get")!==-1||urlStr.indexOf("lrclib.net/api/search")!==-1||urlStr.indexOf("/v2/lyrics/get")!==-1||urlStr.indexOf("lrc.red")!==-1){
      try{
        var u=new URL(urlStr,window.location.origin);
        var t=u.searchParams.get("track_name")||u.searchParams.get("title")||u.searchParams.get("track")||u.searchParams.get("q")||"";
        var a=u.searchParams.get("artist_name")||u.searchParams.get("artist")||"";
        if(t){
          var found=await resolveLyrics(t,a);
          if(found){
            var payload=urlStr.indexOf("lrclib.net/api/search")!==-1?[found.lrc]:urlStr.indexOf("lrclib.net")!==-1?found.lrc:found.am;
            return new Response(JSON.stringify(payload),{status:200,headers:{"Content-Type":"application/json"}});
          }
        }
      }catch(_){}
    }
    try{
      return await origFetch(input,init);
    }catch(err){
      // Fallback Artist Radio agar tidak muncul error "Failed to start artist radio: Failed to fetch"
      if(/radio|artist|related|mix/i.test(urlStr)){
        return new Response(JSON.stringify({items:[],tracks:[],results:[]}),{status:200,headers:{"Content-Type":"application/json"}});
      }
      throw err;
    }
  };

  // E. Sinkronisasi <am-lyrics> & Pembuka Kunci Audio di HIDZPROJECT
  setInterval(async function(){
    document.querySelectorAll("iframe").forEach(function(f){
      if(f.getAttribute("allow")!==PERMS){f.setAttribute("allow",PERMS);f.allow=PERMS;}
    });
    document.querySelectorAll("div,p,span").forEach(function(n){
      if(n.children.length===0&&n.textContent&&/Your browser blocked autoplay/i.test(n.textContent)){
        var b=n.closest("[role=\"alert\"],.toast,.notification")||n.parentElement;
        if(b)b.style.display="none";
      }
    });

    var audio=document.querySelector("audio");
    var sec=(audio&&!audio.paused&&audio.currentTime>0)?audio.currentTime:(window.__hidzYtBridge&&window.__hidzYtBridge.getCurrentTime?window.__hidzYtBridge.getCurrentTime():0);
    var ms=Math.round(sec*1000);

    var amList=document.querySelectorAll("am-lyrics");
    for(var i=0;i<amList.length;i++){
      var el=amList[i];
      var rt=el.getAttribute("song-title")||el.songTitle||el.getAttribute("query")||el.query||"";
      var ra=el.getAttribute("song-artist")||el.songArtist||"";
      if(rt){
        var m=cleanMeta(rt,ra);
        var sig=m.title+"|"+m.artist;
        if(el.getAttribute("data-v5")!==sig){
          el.setAttribute("data-v5",sig);
          el.setAttribute("song-title",m.title);
          el.setAttribute("song-artist",m.artist);
          try{el.songTitle=m.title;el.songArtist=m.artist;el.query=m.artist?m.title+" - "+m.artist:m.title;}catch(_){}
        }
        if(el.shadowRoot&&/No lyrics found/i.test(el.shadowRoot.textContent||"")&&el.getAttribute("data-v5-inj")!==sig){
          el.setAttribute("data-v5-inj",sig);
          var d=await resolveLyrics(m.title,m.artist);
          if(d&&d.am&&Array.isArray(d.am.lyrics)&&el.shadowRoot){
            el.shadowRoot.innerHTML="<div class=\"v5-lrc-box\" style=\"padding:16px 14px 64px;overflow-y:auto;max-height:350px;display:flex;flex-direction:column;gap:14px;text-align:left\"></div>";
            var box=el.shadowRoot.firstChild;
            d.am.lyrics.forEach(function(line){
              var row=document.createElement("div");
              row.className="v5-lrc-row";
              row.dataset.time=String(line.time||0);
              row.textContent=line.text;
              row.style.cssText="font-size:18px;font-weight:700;line-height:1.4;color:rgba(255,255,255,0.38);transition:all 0.2s ease;cursor:pointer";
              row.onclick=function(){if(audio)try{audio.currentTime=(line.time||0)/1000;}catch(_){}};
              box.appendChild(row);
            });
          }
        }
      }
      if(ms>0){
        try{el.currentTime=ms;}catch(_){}
        if(el.shadowRoot){
          var active=null;
          el.shadowRoot.querySelectorAll(".v5-lrc-row").forEach(function(r){
            if(ms>=parseInt(r.dataset.time||"0",10))active=r;
            r.style.color="rgba(255,255,255,0.38)";
            r.style.transform="scale(1)";
          });
          if(active){
            active.style.color="#ffffff";
            active.style.transform="scale(1.02)";
            active.scrollIntoView({behavior:"smooth",block:"center"});
          }
        }
      }
    }
  },220);

  var unlockMedia=function(){
    document.querySelectorAll("audio").forEach(function(a){
      if(a.paused&&a.src&&a.currentTime===0){try{a.play().catch(function(){});}catch(_){}}
    });
    document.querySelectorAll("iframe").forEach(function(f){
      if(f.src&&f.src.indexOf("youtube.com/embed")!==-1&&f.contentWindow){
        try{f.contentWindow.postMessage(JSON.stringify({event:"command",func:"playVideo",args:[]}),"*");}catch(_){}
      }
    });
  };
  ["pointerdown","touchend","click"].forEach(function(e){window.addEventListener(e,unlockMedia,{capture:true,passive:true});});
  window.addEventListener("message",function(e){if(e.data&&e.data.type==="HIDZ_UNLOCK_AUDIO")unlockMedia();});
})();
/* === END HIDZMUSIFY PRODUCTION FIX v5 === */
;
const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./web-hgoH9qH8.js","./index-Dg7h0oU_.js","./index-DF0nC7Js.css"])))=>i.map(i=>d[i]);
import{a4 as e,_ as r}from"./index-Dg7h0oU_.js";var t,a,i,s;(a=t||(t={})).Heavy="HEAVY",a.Medium="MEDIUM",a.Light="LIGHT",(s=i||(i={})).Success="SUCCESS",s.Warning="WARNING",s.Error="ERROR";const o=e("Haptics",{web:()=>r(()=>import("./web-hgoH9qH8.js"),__vite__mapDeps([0,1,2]),import.meta.url).then(e=>new e.HapticsWeb)});export{o as Haptics,t as ImpactStyle,i as NotificationType};
//# sourceMappingURL=index-2rKFqRFp.js.map
