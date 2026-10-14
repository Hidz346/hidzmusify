
/* === HIDZMUSIFY CLEAN PATCH v12 === */
(function(){
  if(window.__HIDZ_V12__)return; window.__HIDZ_V12__=true;

  // 1. Bersihkan tombol melayang lama jika masih ada di cache DOM
  ["hidz-back-v10","hidz-back-v9","hidz-back-v8","hidz-back-v7","hidz-native-back-btn","hidz-back-pill"].forEach(function(id){
    var el=document.getElementById(id); if(el)el.remove();
  });

  // 2. Background Audio Engine (Native HTML5 <audio> Stream + Visibility Lock)
  var userPaused=false, lastTap=0, wantPlay=false, bgAudio=null, lastResolvedTitle="";
  try{
    Object.defineProperty(Document.prototype,"hidden",{get:function(){return false;},configurable:true});
    Object.defineProperty(Document.prototype,"visibilityState",{get:function(){return"visible";},configurable:true});
  }catch(_){}

  var blk={visibilitychange:1,webkitvisibilitychange:1,pagehide:1,freeze:1};
  var dAdd=Document.prototype.addEventListener, wAdd=Window.prototype.addEventListener;
  Document.prototype.addEventListener=function(t,f,o){if(blk[String(t).toLowerCase()])return;return dAdd.call(this,t,f,o);};
  Window.prototype.addEventListener=function(t,f,o){if(blk[String(t).toLowerCase()])return;return wAdd.call(this,t,f,o);};

  wAdd.call(window,"pointerdown",function(e){
    var b=e.target&&e.target.closest?e.target.closest("button,[role=\"button\"]"):null;
    if(b)lastTap=Date.now();
  },true);

  var oPlay=HTMLMediaElement.prototype.play, oPause=HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play=function(){
    wantPlay=true; userPaused=false;
    try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";}catch(_){}
    return oPlay.apply(this,arguments);
  };
  HTMLMediaElement.prototype.pause=function(){
    if((Date.now()-lastTap)>1000&&!userPaused&&wantPlay&&!this.ended&&this.currentTime>0){
      var s=this; setTimeout(function(){if(!userPaused&&wantPlay)try{oPlay.call(s).catch(function(){});}catch(_){}},50);
      return;
    }
    userPaused=true; wantPlay=false;
    return oPause.apply(this,arguments);
  };

  // Sinkronisasi stream <audio> langsung agar tetap bunyi saat keluar dari Chrome / layar terkunci
  var syncNativeBackgroundStream=async function(title,artist){
    var key=(title+"|"+artist).toLowerCase().trim();
    if(!title||key===lastResolvedTitle)return;
    var mainAudio=document.querySelector("audio");
    if(mainAudio&&mainAudio.src&&!mainAudio.paused&&mainAudio.currentTime>0)return;
    lastResolvedTitle=key;
    try{
      var q=encodeURIComponent((title+" "+(artist||"")).replace(/-\s*Topic/i,"").trim());
      var r=await fetch("https://saavn.dev/api/search/songs?query="+q+"&limit=1");
      if(r.ok){
        var j=await r.json();
        var item=j&&j.data&&j.data.results&&j.data.results[0];
        var dl=item&&item.downloadUrl&&item.downloadUrl[item.downloadUrl.length-1];
        if(dl&&dl.url&&mainAudio&&(!mainAudio.src||mainAudio.paused)){
          mainAudio.src=dl.url;
          if(wantPlay&&!userPaused){
            if(window.__hidzYtBridge&&window.__hidzYtBridge.pause)window.__hidzYtBridge.pause();
            oPlay.call(mainAudio).catch(function(){});
          }
        }
      }
    }catch(_){}
  };

  dAdd.call(document,"visibilitychange",function(e){
    e.stopImmediatePropagation();
    if(wantPlay&&!userPaused){
      var a=document.querySelector("audio");
      if(a&&a.src&&a.paused)try{oPlay.call(a).catch(function(){});}catch(_){}
      if(window.__hidzYtBridge&&window.__hidzYtBridge.resume)try{window.__hidzYtBridge.resume();}catch(_){}
    }
  },true);

  // 3. Tombol Kembali INLINE (Tidak melayang/tidak ikut bergeser saat di-scroll & TIDAK muncul di Home)
  var triggerBack=function(){
    var inp=document.querySelector("input[type=\"search\"],input");
    if(inp&&inp.value&&inp.value.trim()){
      inp.focus();
      inp.dispatchEvent(new Event("input",{bubbles:true}));
      inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));
      var form=inp.closest("form");
      if(form)form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
      return;
    }
    var homeTab=Array.from(document.querySelectorAll("button,a,span")).find(function(el){
      return el.textContent&&el.textContent.trim()==="Home";
    });
    if(homeTab){homeTab.click();return;}
    if(window.history.length>1)window.history.back();
  };

  setInterval(function(){
    // Cek apakah sedang di halaman Home (terdapat tab "Hot & New" atau "Recommended Songs")
    var bodyText=document.body?document.body.innerText||"":"";
    var isHomeView=/Hot\s*&\s*New|Recommended Songs/i.test(bodyText);
    var isArtistOrSubPage=/Popular Tracks|undefined%?\s*popularity|Verified Music Channel|Unknown Artist/i.test(bodyText);

    var existingBar=document.getElementById("hidz-inline-back-bar");
    if(isHomeView||!isArtistOrSubPage){
      if(existingBar)existingBar.remove();
    }else if(isArtistOrSubPage&&!existingBar){
      // Cari elemen judul halaman sub-view (misal h1/h2 nama artis atau kontainer utama)
      var targetHeading=Array.from(document.querySelectorAll("h1,h2")).find(function(h){
        return h.offsetParent!==null;
      });
      var container=targetHeading?targetHeading.parentElement:document.querySelector("main");
      if(container){
        var bar=document.createElement("div");
        bar.id="hidz-inline-back-bar";
        bar.style.cssText="width:100%;padding:8px 16px 4px;box-sizing:border-box;display:flex;align-items:center;";
        bar.innerHTML='<button type="button" style="display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 10px;border-radius:8px;background:rgba(255,255,255,0.08);color:#f5f5f7;border:1px solid rgba(255,255,255,0.1);font:500 13px/1 system-ui,-apple-system,sans-serif;cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg><span>Kembali</span></button>';
        bar.firstChild.onclick=function(e){e.preventDefault();e.stopPropagation();triggerBack();};
        container.insertBefore(bar,container.firstChild);
      }
    }

    // Perbaiki teks "Unknown Artist" & "undefined% popularity" & nama artis "- Topic"
    var playerTitle="", playerArtist="";
    var am=document.querySelector("am-lyrics");
    if(am){
      playerTitle=am.getAttribute("song-title")||am.songTitle||"";
      playerArtist=(am.getAttribute("song-artist")||am.songArtist||"").replace(/\s*-\s*Topic$/i,"").trim();
      if(playerTitle)syncNativeBackgroundStream(playerTitle,playerArtist);
    }
    document.querySelectorAll("h1,h2,p,span,div").forEach(function(el){
      if(el.children.length===0&&el.textContent){
        var tx=el.textContent.trim();
        if(/undefined%?\s*popularity/i.test(tx))el.textContent="Artist Profile";
        else if(/^Unknown Artist$/i.test(tx)&&playerArtist)el.textContent=playerArtist;
        else if(/\s-\sTopic$/i.test(tx))el.textContent=tx.replace(/\s*-\s*Topic$/i,"");
      }
    });
  },220);
})();

;

/* === HIDZMUSIFY CLEAN PATCH v12 === */
(function(){
  if(window.__HIDZ_V12__)return; window.__HIDZ_V12__=true;

  // 1. Bersihkan tombol melayang lama jika masih ada di cache DOM
  ["hidz-back-v10","hidz-back-v9","hidz-back-v8","hidz-back-v7","hidz-native-back-btn","hidz-back-pill"].forEach(function(id){
    var el=document.getElementById(id); if(el)el.remove();
  });

  // 2. Background Audio Engine (Native HTML5 <audio> Stream + Visibility Lock)
  var userPaused=false, lastTap=0, wantPlay=false, bgAudio=null, lastResolvedTitle="";
  try{
    Object.defineProperty(Document.prototype,"hidden",{get:function(){return false;},configurable:true});
    Object.defineProperty(Document.prototype,"visibilityState",{get:function(){return"visible";},configurable:true});
  }catch(_){}

  var blk={visibilitychange:1,webkitvisibilitychange:1,pagehide:1,freeze:1};
  var dAdd=Document.prototype.addEventListener, wAdd=Window.prototype.addEventListener;
  Document.prototype.addEventListener=function(t,f,o){if(blk[String(t).toLowerCase()])return;return dAdd.call(this,t,f,o);};
  Window.prototype.addEventListener=function(t,f,o){if(blk[String(t).toLowerCase()])return;return wAdd.call(this,t,f,o);};

  wAdd.call(window,"pointerdown",function(e){
    var b=e.target&&e.target.closest?e.target.closest("button,[role=\"button\"]"):null;
    if(b)lastTap=Date.now();
  },true);

  var oPlay=HTMLMediaElement.prototype.play, oPause=HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play=function(){
    wantPlay=true; userPaused=false;
    try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";}catch(_){}
    return oPlay.apply(this,arguments);
  };
  HTMLMediaElement.prototype.pause=function(){
    if((Date.now()-lastTap)>1000&&!userPaused&&wantPlay&&!this.ended&&this.currentTime>0){
      var s=this; setTimeout(function(){if(!userPaused&&wantPlay)try{oPlay.call(s).catch(function(){});}catch(_){}},50);
      return;
    }
    userPaused=true; wantPlay=false;
    return oPause.apply(this,arguments);
  };

  // Sinkronisasi stream <audio> langsung agar tetap bunyi saat keluar dari Chrome / layar terkunci
  var syncNativeBackgroundStream=async function(title,artist){
    var key=(title+"|"+artist).toLowerCase().trim();
    if(!title||key===lastResolvedTitle)return;
    var mainAudio=document.querySelector("audio");
    if(mainAudio&&mainAudio.src&&!mainAudio.paused&&mainAudio.currentTime>0)return;
    lastResolvedTitle=key;
    try{
      var q=encodeURIComponent((title+" "+(artist||"")).replace(/-\s*Topic/i,"").trim());
      var r=await fetch("https://saavn.dev/api/search/songs?query="+q+"&limit=1");
      if(r.ok){
        var j=await r.json();
        var item=j&&j.data&&j.data.results&&j.data.results[0];
        var dl=item&&item.downloadUrl&&item.downloadUrl[item.downloadUrl.length-1];
        if(dl&&dl.url&&mainAudio&&(!mainAudio.src||mainAudio.paused)){
          mainAudio.src=dl.url;
          if(wantPlay&&!userPaused){
            if(window.__hidzYtBridge&&window.__hidzYtBridge.pause)window.__hidzYtBridge.pause();
            oPlay.call(mainAudio).catch(function(){});
          }
        }
      }
    }catch(_){}
  };

  dAdd.call(document,"visibilitychange",function(e){
    e.stopImmediatePropagation();
    if(wantPlay&&!userPaused){
      var a=document.querySelector("audio");
      if(a&&a.src&&a.paused)try{oPlay.call(a).catch(function(){});}catch(_){}
      if(window.__hidzYtBridge&&window.__hidzYtBridge.resume)try{window.__hidzYtBridge.resume();}catch(_){}
    }
  },true);

  // 3. Tombol Kembali INLINE (Tidak melayang/tidak ikut bergeser saat di-scroll & TIDAK muncul di Home)
  var triggerBack=function(){
    var inp=document.querySelector("input[type=\"search\"],input");
    if(inp&&inp.value&&inp.value.trim()){
      inp.focus();
      inp.dispatchEvent(new Event("input",{bubbles:true}));
      inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));
      var form=inp.closest("form");
      if(form)form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
      return;
    }
    var homeTab=Array.from(document.querySelectorAll("button,a,span")).find(function(el){
      return el.textContent&&el.textContent.trim()==="Home";
    });
    if(homeTab){homeTab.click();return;}
    if(window.history.length>1)window.history.back();
  };

  setInterval(function(){
    // Cek apakah sedang di halaman Home (terdapat tab "Hot & New" atau "Recommended Songs")
    var bodyText=document.body?document.body.innerText||"":"";
    var isHomeView=/Hot\s*&\s*New|Recommended Songs/i.test(bodyText);
    var isArtistOrSubPage=/Popular Tracks|undefined%?\s*popularity|Verified Music Channel|Unknown Artist/i.test(bodyText);

    var existingBar=document.getElementById("hidz-inline-back-bar");
    if(isHomeView||!isArtistOrSubPage){
      if(existingBar)existingBar.remove();
    }else if(isArtistOrSubPage&&!existingBar){
      // Cari elemen judul halaman sub-view (misal h1/h2 nama artis atau kontainer utama)
      var targetHeading=Array.from(document.querySelectorAll("h1,h2")).find(function(h){
        return h.offsetParent!==null;
      });
      var container=targetHeading?targetHeading.parentElement:document.querySelector("main");
      if(container){
        var bar=document.createElement("div");
        bar.id="hidz-inline-back-bar";
        bar.style.cssText="width:100%;padding:8px 16px 4px;box-sizing:border-box;display:flex;align-items:center;";
        bar.innerHTML='<button type="button" style="display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px 0 10px;border-radius:8px;background:rgba(255,255,255,0.08);color:#f5f5f7;border:1px solid rgba(255,255,255,0.1);font:500 13px/1 system-ui,-apple-system,sans-serif;cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg><span>Kembali</span></button>';
        bar.firstChild.onclick=function(e){e.preventDefault();e.stopPropagation();triggerBack();};
        container.insertBefore(bar,container.firstChild);
      }
    }

    // Perbaiki teks "Unknown Artist" & "undefined% popularity" & nama artis "- Topic"
    var playerTitle="", playerArtist="";
    var am=document.querySelector("am-lyrics");
    if(am){
      playerTitle=am.getAttribute("song-title")||am.songTitle||"";
      playerArtist=(am.getAttribute("song-artist")||am.songArtist||"").replace(/\s*-\s*Topic$/i,"").trim();
      if(playerTitle)syncNativeBackgroundStream(playerTitle,playerArtist);
    }
    document.querySelectorAll("h1,h2,p,span,div").forEach(function(el){
      if(el.children.length===0&&el.textContent){
        var tx=el.textContent.trim();
        if(/undefined%?\s*popularity/i.test(tx))el.textContent="Artist Profile";
        else if(/^Unknown Artist$/i.test(tx)&&playerArtist)el.textContent=playerArtist;
        else if(/\s-\sTopic$/i.test(tx))el.textContent=tx.replace(/\s*-\s*Topic$/i,"");
      }
    });
  },220);
})();

;
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
"stream"in Blob.prototype||Object.defineProperty(Blob.prototype,"stream",{value(){return new Response(this).body}}),"setBigUint64"in DataView.prototype||Object.defineProperty(DataView.prototype,"setBigUint64",{value(t,e,n){const i=Number(0xffffffffn&e),o=Number(e>>32n);this.setUint32(t+(n?0:4),i,n),this.setUint32(t+(n?4:0),o,n)}});var t=t=>new DataView(new ArrayBuffer(t)),e=t=>new Uint8Array(t.buffer||t),n=t=>(new TextEncoder).encode(String(t)),i=t=>Math.min(4294967295,Number(t)),o=t=>Math.min(65535,Number(t));function r(t,i,o){void 0===i||i instanceof Date||(i=new Date(i));const r=void 0!==t;if(o||(o=r?436:509),t instanceof File)return{isFile:r,t:i||new Date(t.lastModified),bytes:t.stream(),mode:o};if(t instanceof Response)return{isFile:r,t:i||new Date(t.headers.get("Last-Modified")||Date.now()),bytes:t.body,mode:o};if(void 0===i)i=new Date;else if(isNaN(i))throw new Error("Invalid modification date.");if(!r)return{isFile:r,t:i,mode:o};if("string"==typeof t)return{isFile:r,t:i,bytes:n(t),mode:o};if(t instanceof Blob)return{isFile:r,t:i,bytes:t.stream(),mode:o};if(t instanceof Uint8Array||t instanceof ReadableStream)return{isFile:r,t:i,bytes:t,mode:o};if(t instanceof ArrayBuffer||ArrayBuffer.isView(t))return{isFile:r,t:i,bytes:e(t),mode:o};if(Symbol.asyncIterator in t)return{isFile:r,t:i,bytes:s(t[Symbol.asyncIterator]()),mode:o};throw new TypeError("Unsupported input format.")}function s(t,e=t){return new ReadableStream({async pull(e){let n=0;for(;e.desiredSize>n;){const i=await t.next();if(!i.value){e.close();break}{const t=f(i.value);e.enqueue(t),n+=t.byteLength}}},cancel(t){e.throw?.(t)}})}function f(t){return"string"==typeof t?n(t):t instanceof Uint8Array?t:e(t)}function a(t,i,o){let[r,s]=(f=i)?f instanceof Uint8Array?[f,1]:ArrayBuffer.isView(f)||f instanceof ArrayBuffer?[e(f),1]:[n(f),0]:[void 0,0];var f;if(t instanceof File)return{i:l(r||n(t.name)),o:BigInt(t.size),u:s};if(t instanceof Response){const e=t.headers.get("content-disposition"),i=e&&e.match(/;\s*filename\*?\s*=\s*(?:UTF-\d+''|)["']?([^;"'\r\n]*)["']?(?:;|$)/i),f=i&&i[1]||t.url&&new URL(t.url).pathname.split("/").findLast(Boolean),a=f&&decodeURIComponent(f),u=o||+t.headers.get("content-length");return{i:l(r||n(a)),o:BigInt(u),u:s}}return r=l(r,void 0!==t||void 0!==o),"string"==typeof t?{i:r,o:BigInt(n(t).length),u:s}:t instanceof Blob?{i:r,o:BigInt(t.size),u:s}:t instanceof ArrayBuffer||ArrayBuffer.isView(t)?{i:r,o:BigInt(t.byteLength),u:s}:{i:r,o:u(t,o),u:s}}function u(t,e){return e>-1?BigInt(e):t?void 0:0n}function l(t,e=1){if(!t||t.every(t=>47===t))throw new Error("The file must have a name.");if(e)for(;47===t[t.length-1];)t=t.subarray(0,-1);else 47!==t[t.length-1]&&(t=new Uint8Array([...t,47]));return t}var c=new Uint32Array(256);for(let A=0;A<256;++A){let t=A;for(let e=0;e<8;++e)t=t>>>1^(1&t&&3988292384);c[A]=t}function d(t,e=0){e=~e;for(var n=0,i=t.length;n<i;n++)e=e>>>8^c[255&e^t[n]];return~e>>>0}function g(t,e,n=0){const i=t.getSeconds()>>1|t.getMinutes()<<5|t.getHours()<<11,o=t.getDate()|t.getMonth()+1<<5|t.getFullYear()-1980<<9;e.setUint16(n,i,1),e.setUint16(n+2,o,1)}function y({i:t,u:e},n){return 8*(!e||(n??function(t){try{U.decode(t)}catch{return 0}return 1}(t)))}var U=new TextDecoder("utf8",{fatal:1});function h(n,i=0){const o=t(30);return o.setUint32(0,1347093252),o.setUint32(4,754976768|i),g(n.t,o,10),o.setUint16(26,n.i.length,1),e(o)}async function*m(t){let{bytes:e}=t;if("then"in e&&(e=await e),e instanceof Uint8Array)yield e,t.l=d(e,0),t.o=BigInt(e.length);else{t.o=0n;const n=e.getReader();for(;;){const{value:e,done:i}=await n.read();if(i)break;t.l=d(e,t.l),t.o+=BigInt(e.length),yield e}}}function p(n,o){const r=t(16+(o?8:0));return r.setUint32(0,1347094280),r.setUint32(4,n.isFile?n.l:0,1),o?(r.setBigUint64(8,n.o,1),r.setBigUint64(16,n.o,1)):(r.setUint32(8,i(n.o),1),r.setUint32(12,i(n.o),1)),e(r)}function w(n,o,r=0,s=0){const f=t(46);return f.setUint32(0,1347092738),f.setUint32(4,755182848),f.setUint16(8,2048|r),g(n.t,f,12),f.setUint32(16,n.isFile?n.l:0,1),f.setUint32(20,i(n.o),1),f.setUint32(24,i(n.o),1),f.setUint16(28,n.i.length,1),f.setUint16(30,s,1),f.setUint16(40,n.mode|(n.isFile?32768:16384),1),f.setUint32(42,i(o),1),e(f)}function B(n,i,o){const r=t(o);return r.setUint16(0,1,1),r.setUint16(2,o-4,1),16&o&&(r.setBigUint64(4,n.o,1),r.setBigUint64(12,n.o,1)),r.setBigUint64(o-8,i,1),e(r)}function b(t){return t instanceof File||t instanceof Response?[[t],[t]]:[[t.input,t.name,t.size],[t.input,t.lastModified,t.mode]]}var v=t=>function(t){let e=BigInt(22),n=0n,i=0;for(const o of t){if(!o.i)throw new Error("Every file must have a non-empty name.");if(void 0===o.o)throw new Error(`Missing size for file "${(new TextDecoder).decode(o.i)}".`);const t=o.o>=0xffffffffn,r=n>=0xffffffffn;n+=BigInt(46+o.i.length+(t&&8))+o.o,e+=BigInt(o.i.length+46+(12*r|28*t)),i||(i=t)}return(i||n>=0xffffffffn)&&(e+=BigInt(76)),e+n}(function*(t){for(const e of t)yield a(...b(e)[0])}(t));function I(t,e={}){const n={"Content-Type":"application/zip","Content-Disposition":"attachment"};return("bigint"==typeof e.length||Number.isInteger(e.length))&&e.length>0&&(n["Content-Length"]=String(e.length)),e.metadata&&(n["Content-Length"]=String(v(e.metadata))),new Response(F(t,e),{headers:n})}function F(n,f={}){const u=function(t){const e=t[Symbol.iterator in t?Symbol.iterator:Symbol.asyncIterator]();return{async next(){const t=await e.next();if(t.done)return t;const[n,i]=b(t.value);return{done:0,value:Object.assign(r(...i),a(...n))}},throw:e.throw?.bind(e),[Symbol.asyncIterator](){return this}}}(n);return s(async function*(n,r){const s=[];let f=0n,a=0n,u=0;for await(const t of n){const e=y(t,r.buffersAreUTF8);yield h(t,e),yield new Uint8Array(t.i),t.isFile&&(yield*m(t));const n=t.o>=0xffffffffn,i=12*(f>=0xffffffffn)|28*n;yield p(t,n),s.push(w(t,f,e,i)),s.push(t.i),i&&s.push(B(t,f,i)),n&&(f+=8n),a++,f+=BigInt(46+t.i.length)+t.o,u||(u=n)}let l=0n;for(const t of s)yield t,l+=BigInt(t.length);if(u||f>=0xffffffffn){const n=t(76);n.setUint32(0,1347094022),n.setBigUint64(4,BigInt(44),1),n.setUint32(12,755182848),n.setBigUint64(24,a,1),n.setBigUint64(32,a,1),n.setBigUint64(40,l,1),n.setBigUint64(48,f,1),n.setUint32(56,1347094023),n.setBigUint64(64,f+l,1),n.setUint32(72,1,1),yield e(n)}const c=t(22);c.setUint32(0,1347093766),c.setUint16(8,o(a),1),c.setUint16(10,o(a),1),c.setUint32(12,i(l),1),c.setUint32(16,i(f),1),yield e(c)}(u,f),u)}export{I as downloadZip,F as makeZip,v as predictLength};
//# sourceMappingURL=index-DxZIrCZZ.js.map
