
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
    var b=e.target&&e.target.closest?e.target.closest("button,[role=\"button\"]"):null;
    if(!b)return;
    if(b.closest(".player-bar,footer,[class*=\"player\"]")){
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
    var cleanT=String(title||"").split(/[\/|]/)[0].replace(/\s*[\(\[\{][^)\]\}]*[\)\]\}]/g,"").trim();
    var cleanA=String(artist||"").replace(/\s*-\s*Topic$/i,"").trim();
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
      var img=document.querySelector(".player-bar img,footer img,img[src*=\"ytimg\"]");
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
    var inp=document.querySelector("input[type=\"search\"],input");
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
      var ra=(am.getAttribute("song-artist")||am.songArtist||"").replace(/\s*-\s*Topic$/i,"").trim();
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
    var isHome=/Recommended Songs|Hot\s*&\s*New/i.test(bodyTxt)&&!/Search Results for|Popular Tracks/i.test(bodyTxt);
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

;

/* === HIDZ V13: UNSTOPPABLE BACKGROUND PLAYBACK === */
(function(){
  if(window.__HIDZ_V13__)return; window.__HIDZ_V13__=true;
  window.__hidzManualPause=false;
  var activePlay=false, lastPauseTap=0, keepAudio=null, audioCtx=null;

  // 1. Kunci Visibility & Fokus Halaman
  try{
    Object.defineProperty(Document.prototype,"hidden",{get:function(){return false;},configurable:true});
    Object.defineProperty(Document.prototype,"webkitHidden",{get:function(){return false;},configurable:true});
    Object.defineProperty(Document.prototype,"visibilityState",{get:function(){return"visible";},configurable:true});
    Object.defineProperty(Document.prototype,"hasFocus",{value:function(){return true;},configurable:true});
  }catch(_){}

  var blk={visibilitychange:1,webkitvisibilitychange:1,pagehide:1,freeze:1,blur:1};
  var dAdd=Document.prototype.addEventListener, wAdd=Window.prototype.addEventListener;
  Document.prototype.addEventListener=function(t,f,o){if(blk[String(t).toLowerCase()])return;return dAdd.call(this,t,f,o);};
  Window.prototype.addEventListener=function(t,f,o){if(blk[String(t).toLowerCase()])return;return wAdd.call(this,t,f,o);};

  // Deteksi apakah user benar-benar menekan tombol Pause di player
  wAdd.call(window,"pointerdown",function(e){
    var b=e.target&&e.target.closest?e.target.closest("button,[role=\"button\"]"):null;
    if(!b)return;
    var inPlayer=b.closest(".player-bar,footer,[class*=\"player\"]");
    if(inPlayer){
      lastPauseTap=Date.now();
      window.__hidzManualPause=true;
      setTimeout(function(){if(activePlay)window.__hidzManualPause=false;},1200);
    }
  },true);

  var startKeepAlive=function(){
    try{
      var AC=window.AudioContext||window.webkitAudioContext;
      if(AC&&!audioCtx){
        audioCtx=new AC();
        var osc=audioCtx.createOscillator(),g=audioCtx.createGain();
        g.gain.value=0.0001;osc.connect(g);g.connect(audioCtx.destination);osc.start(0);
      }
      if(audioCtx&&audioCtx.state==="suspended")audioCtx.resume().catch(function(){});
    }catch(_){}
    try{
      if(!keepAudio&&document.body){
        var sr=8000,buf=new ArrayBuffer(44+sr),v=new DataView(buf);
        var w=function(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
        w(0,"RIFF");v.setUint32(4,36+sr,true);w(8,"WAVEfmt ");v.setUint32(16,16,true);
        v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr,true);
        v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,"data");v.setUint32(40,sr,true);
        for(var i=0;i<sr;i++)v.setUint8(44+i,128+(i%2));
        var b=new Uint8Array(buf),s="";for(var j=0;j<b.length;j++)s+=String.fromCharCode(b[j]);
        keepAudio=document.createElement("audio");keepAudio.id="hidz-ka-v13";
        keepAudio.src="data:audio/wav;base64,"+btoa(s);keepAudio.loop=true;keepAudio.volume=0.01;
        keepAudio.setAttribute("playsinline","true");keepAudio.style.display="none";
        document.body.appendChild(keepAudio);
      }
      if(keepAudio&&keepAudio.paused&&activePlay)oPlay.call(keepAudio).catch(function(){});
    }catch(_){}
  };

  var oPlay=HTMLMediaElement.prototype.play, oPause=HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play=function(){
    if(this.id!=="hidz-ka-v13"){activePlay=true;window.__hidzManualPause=false;startKeepAlive();}
    return oPlay.apply(this,arguments);
  };
  HTMLMediaElement.prototype.pause=function(){
    if(this.id==="hidz-ka-v13"&&activePlay)return;
    var byUser=(Date.now()-lastPauseTap)<1200;
    if(!byUser&&activePlay&&!this.ended&&this.currentTime>0){
      var self=this;
      setTimeout(function(){if(activePlay)try{oPlay.call(self).catch(function(){});}catch(_){}},30);
      return;
    }
    activePlay=false;
    if(keepAudio&&!keepAudio.paused)try{oPause.call(keepAudio);}catch(_){}
    return oPause.apply(this,arguments);
  };

  // Paksa resume jika YouTube IFrame atau <audio> mencoba berhenti saat keluar halaman
  var forceKeepPlaying=function(){
    if(!activePlay||window.__hidzManualPause)return;
    startKeepAlive();
    document.querySelectorAll("audio:not(#hidz-ka-v13)").forEach(function(a){
      if(a.src&&a.paused&&!a.ended)try{oPlay.call(a).catch(function(){});}catch(_){}
    });
    if(window.__hidzYtBridge&&window.__hidzYtBridge.resume)try{window.__hidzYtBridge.resume();}catch(_){}
    document.querySelectorAll("iframe").forEach(function(f){
      if(f.src&&f.src.indexOf("youtube.com/embed")!==-1&&f.contentWindow){
        try{f.contentWindow.postMessage(JSON.stringify({event:"command",func:"playVideo",args:[]}),"*");}catch(_){}
      }
    });
  };

  setInterval(function(){
    var ytPlaying=window.__hidzYtBridge&&window.__hidzYtBridge.isPlaying&&window.__hidzYtBridge.isPlaying();
    var a=document.querySelector("audio:not(#hidz-ka-v13)");
    if((a&&!a.paused&&a.currentTime>0)||ytPlaying){
      if(!window.__hidzManualPause){activePlay=true;startKeepAlive();}
    }else if(activePlay&&!window.__hidzManualPause){
      forceKeepPlaying();
    }
  },180);

  dAdd.call(document,"visibilitychange",function(e){e.stopImmediatePropagation();forceKeepPlaying();setTimeout(forceKeepPlaying,100);setTimeout(forceKeepPlaying,400);},true);
  wAdd.call(window,"pagehide",forceKeepPlaying,true);
  wAdd.call(window,"blur",forceKeepPlaying,true);
  wAdd.call(window,"message",function(e){if(e.data&&e.data.type==="HIDZ_FORCE_PLAY"){window.__hidzManualPause=false;activePlay=true;forceKeepPlaying();}},false);
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
const t=128,e="\n  attribute vec2 a_position;\n  attribute vec2 a_texCoord;\n  varying vec2 v_texCoord;\n  void main() {\n    gl_Position = vec4(a_position, 0.0, 1.0);\n    v_texCoord = a_texCoord;\n  }\n";class r{canvas;gl;halfFloatExt=null;halfFloatLinearExt=null;blurProgram;blendProgram;tintProgram;warpProgram;outputProgram;positionBuffer;texCoordBuffer;sourceTexture;blurFBO1;blurFBO2;currentAlbumFBO;nextAlbumFBO;warpFBO;animationId=null;lastFrameTime=0;accumulatedTime=0;isPlaying=!1;isTransitioning=!1;transitionStartTime=0;_transitionDuration;_warpIntensity;_blurPasses;_animationSpeed;_targetAnimationSpeed;_saturation;_tintColor;_tintIntensity;_dithering;_scale;hasImage=!1;attribs;uniforms;constructor(r,i={}){this.canvas=r;const n=r.getContext("webgl",{preserveDrawingBuffer:!0});if(!n)throw new Error("WebGL not supported");this.gl=n,this.halfFloatExt=n.getExtension("OES_texture_half_float"),this.halfFloatLinearExt=n.getExtension("OES_texture_half_float_linear"),this._warpIntensity=i.warpIntensity??1,this._blurPasses=i.blurPasses??8,this._animationSpeed=i.animationSpeed??1,this._targetAnimationSpeed=this._animationSpeed,this._transitionDuration=i.transitionDuration??1e3,this._saturation=i.saturation??1.5,this._tintColor=i.tintColor??[.157,.157,.235],this._tintIntensity=i.tintIntensity??.15,this._dithering=i.dithering??.008,this._scale=i.scale??1,this.blurProgram=this.createProgram(e,"\n  precision highp float;\n  uniform sampler2D u_texture;\n  uniform vec2 u_resolution;\n  uniform float u_offset;\n  varying vec2 v_texCoord;\n\n  void main() {\n    highp vec2 texelSize = 1.0 / u_resolution;\n    highp vec4 color = vec4(0.0);\n\n    color += texture2D(u_texture, v_texCoord + vec2(-u_offset, -u_offset) * texelSize);\n    color += texture2D(u_texture, v_texCoord + vec2(u_offset, -u_offset) * texelSize);\n    color += texture2D(u_texture, v_texCoord + vec2(-u_offset, u_offset) * texelSize);\n    color += texture2D(u_texture, v_texCoord + vec2(u_offset, u_offset) * texelSize);\n\n    gl_FragColor = color * 0.25;\n  }\n"),this.blendProgram=this.createProgram(e,"\n  precision highp float;\n  uniform sampler2D u_texture1;\n  uniform sampler2D u_texture2;\n  uniform float u_blend;\n  varying vec2 v_texCoord;\n\n  void main() {\n    vec4 color1 = texture2D(u_texture1, v_texCoord);\n    vec4 color2 = texture2D(u_texture2, v_texCoord);\n    gl_FragColor = mix(color1, color2, u_blend);\n  }\n"),this.tintProgram=this.createProgram(e,"\n  precision highp float;\n  uniform sampler2D u_texture;\n  uniform vec3 u_tintColor;\n  uniform float u_tintIntensity;\n  varying vec2 v_texCoord;\n\n  void main() {\n    vec4 color = texture2D(u_texture, v_texCoord);\n    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));\n\n    // darkMask: 1.0 for black, 0.0 for luma >= 0.5\n    float darkMask = 1.0 - smoothstep(0.0, 0.5, luma);\n\n    // Blend dark areas toward tint color\n    color.rgb = mix(color.rgb, u_tintColor, darkMask * u_tintIntensity);\n\n    gl_FragColor = color;\n  }\n"),this.warpProgram=this.createProgram(e,"\n  precision highp float;\n  uniform sampler2D u_texture;\n  uniform float u_time;\n  uniform float u_intensity;\n  varying vec2 v_texCoord;\n\n  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }\n  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }\n  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }\n\n  float snoise(vec2 v) {\n    const vec4 C = vec4(0.211324865405187, 0.366025403784439,\n                        -0.577350269189626, 0.024390243902439);\n    vec2 i  = floor(v + dot(v, C.yy));\n    vec2 x0 = v - i + dot(i, C.xx);\n    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);\n    vec4 x12 = x0.xyxy + C.xxzz;\n    x12.xy -= i1;\n    i = mod289(i);\n    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));\n    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);\n    m = m*m; m = m*m;\n    vec3 x = 2.0 * fract(p * C.www) - 1.0;\n    vec3 h = abs(x) - 0.5;\n    vec3 ox = floor(x + 0.5);\n    vec3 a0 = x - ox;\n    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);\n    vec3 g;\n    g.x = a0.x * x0.x + h.x * x0.y;\n    g.yz = a0.yz * x12.xz + h.yz * x12.yw;\n    return 130.0 * dot(m, g);\n  }\n\n  void main() {\n    vec2 uv = v_texCoord;\n    float t = u_time * 0.05;\n\n    vec2 center = uv - 0.5;\n    float centerWeight = 1.0 - smoothstep(0.0, 0.7, length(center));\n\n    // Large-scale movement (slow, big blobs)\n    float n1 = snoise(uv * 0.35 + vec2(t, t * 0.7));\n    float n2 = snoise(uv * 0.35 + vec2(-t * 0.8, t * 0.5) + vec2(50.0, 50.0));\n\n    // Medium-scale detail (adds organic movement)\n    float n3 = snoise(uv * 0.9 + vec2(t * 1.2, -t) + vec2(100.0, 0.0));\n    float n4 = snoise(uv * 0.9 + vec2(-t, t * 1.1) + vec2(0.0, 100.0));\n\n    // Combine two octaves\n    vec2 warp = vec2(\n      n1 * 0.65 + n3 * 0.35,\n      n2 * 0.65 + n4 * 0.35\n    ) * centerWeight;\n\n    vec2 warpedUV = uv + warp * u_intensity;\n    warpedUV = clamp(warpedUV, 0.0, 1.0);\n\n    gl_FragColor = texture2D(u_texture, warpedUV);\n  }\n"),this.outputProgram=this.createProgram(e,"\n  precision highp float;\n  uniform sampler2D u_texture;\n  uniform float u_saturation;\n  uniform float u_dithering;\n  uniform float u_time;\n  uniform float u_scale;\n  uniform vec2 u_resolution;\n  varying vec2 v_texCoord;\n\n  highp float hash(highp vec3 p) {\n    p = fract(p * 0.1031);\n    p += dot(p, p.zyx + 31.32);\n    return fract((p.x + p.y) * p.z);\n  }\n\n  void main() {\n    vec2 uv = (v_texCoord - 0.5) / u_scale + 0.5;\n    uv = clamp(uv, 0.0, 1.0);\n\n    vec4 color = texture2D(u_texture, uv);\n\n    vec2 center = v_texCoord - 0.5;\n    float vignette = 1.0 - dot(center, center) * 0.3;\n    color.rgb *= vignette;\n\n    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));\n    color.rgb = mix(vec3(gray), color.rgb, u_saturation);\n\n    highp vec2 pixelPos = floor(v_texCoord * u_resolution);\n    highp float noise = hash(vec3(pixelPos, floor(u_time * 60.0)));\n    color.rgb += (noise - 0.5) * u_dithering;\n\n    gl_FragColor = color;\n  }\n"),this.attribs={position:n.getAttribLocation(this.blurProgram,"a_position"),texCoord:n.getAttribLocation(this.blurProgram,"a_texCoord")},this.uniforms={blur:{resolution:n.getUniformLocation(this.blurProgram,"u_resolution"),texture:n.getUniformLocation(this.blurProgram,"u_texture"),offset:n.getUniformLocation(this.blurProgram,"u_offset")},blend:{texture1:n.getUniformLocation(this.blendProgram,"u_texture1"),texture2:n.getUniformLocation(this.blendProgram,"u_texture2"),blend:n.getUniformLocation(this.blendProgram,"u_blend")},warp:{texture:n.getUniformLocation(this.warpProgram,"u_texture"),time:n.getUniformLocation(this.warpProgram,"u_time"),intensity:n.getUniformLocation(this.warpProgram,"u_intensity")},tint:{texture:n.getUniformLocation(this.tintProgram,"u_texture"),tintColor:n.getUniformLocation(this.tintProgram,"u_tintColor"),tintIntensity:n.getUniformLocation(this.tintProgram,"u_tintIntensity")},output:{texture:n.getUniformLocation(this.outputProgram,"u_texture"),saturation:n.getUniformLocation(this.outputProgram,"u_saturation"),dithering:n.getUniformLocation(this.outputProgram,"u_dithering"),time:n.getUniformLocation(this.outputProgram,"u_time"),scale:n.getUniformLocation(this.outputProgram,"u_scale"),resolution:n.getUniformLocation(this.outputProgram,"u_resolution")}},this.positionBuffer=this.createBuffer(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1])),this.texCoordBuffer=this.createBuffer(new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1])),this.sourceTexture=this.createTexture(),this.blurFBO1=this.createFramebuffer(t,t,!0),this.blurFBO2=this.createFramebuffer(t,t,!0),this.currentAlbumFBO=this.createFramebuffer(t,t,!0),this.nextAlbumFBO=this.createFramebuffer(t,t,!0),this.warpFBO=this.createFramebuffer(1,1,!0),this.resize()}get warpIntensity(){return this._warpIntensity}set warpIntensity(t){this._warpIntensity=Math.max(0,Math.min(1,t))}get blurPasses(){return this._blurPasses}set blurPasses(t){const e=Math.max(1,Math.min(40,Math.floor(t)));e!==this._blurPasses&&(this._blurPasses=e,this.hasImage&&this.reblurCurrentImage())}get animationSpeed(){return this._targetAnimationSpeed}set animationSpeed(t){this._targetAnimationSpeed=Math.max(.1,Math.min(5,t))}get transitionDuration(){return this._transitionDuration}set transitionDuration(t){this._transitionDuration=Math.max(0,Math.min(5e3,t))}get saturation(){return this._saturation}set saturation(t){this._saturation=Math.max(0,Math.min(3,t))}get tintColor(){return this._tintColor}set tintColor(t){const e=t.map(t=>Math.max(0,Math.min(1,t)));e.some((t,e)=>t!==this._tintColor[e])&&(this._tintColor=e,this.hasImage&&this.reblurCurrentImage())}get tintIntensity(){return this._tintIntensity}set tintIntensity(t){const e=Math.max(0,Math.min(1,t));e!==this._tintIntensity&&(this._tintIntensity=e,this.hasImage&&this.reblurCurrentImage())}get dithering(){return this._dithering}set dithering(t){this._dithering=Math.max(0,Math.min(.1,t))}get scale(){return this._scale}set scale(t){this._scale=Math.max(.01,Math.min(4,t))}setOptions(t){void 0!==t.warpIntensity&&(this.warpIntensity=t.warpIntensity),void 0!==t.blurPasses&&(this.blurPasses=t.blurPasses),void 0!==t.animationSpeed&&(this.animationSpeed=t.animationSpeed),void 0!==t.transitionDuration&&(this.transitionDuration=t.transitionDuration),void 0!==t.saturation&&(this.saturation=t.saturation),void 0!==t.tintColor&&(this.tintColor=t.tintColor),void 0!==t.tintIntensity&&(this.tintIntensity=t.tintIntensity),void 0!==t.dithering&&(this.dithering=t.dithering),void 0!==t.scale&&(this.scale=t.scale)}getOptions(){return{warpIntensity:this._warpIntensity,blurPasses:this._blurPasses,animationSpeed:this._targetAnimationSpeed,transitionDuration:this._transitionDuration,saturation:this._saturation,tintColor:this._tintColor,tintIntensity:this._tintIntensity,dithering:this._dithering,scale:this._scale}}loadImage(t){return new Promise((e,r)=>{const i=new Image;i.crossOrigin="anonymous",i.onload=()=>{this.gl.bindTexture(this.gl.TEXTURE_2D,this.sourceTexture),this.gl.texImage2D(this.gl.TEXTURE_2D,0,this.gl.RGBA,this.gl.RGBA,this.gl.UNSIGNED_BYTE,i),this.processNewImage(),e()},i.onerror=()=>r(new Error(`Failed to load image: ${t}`)),i.src=t})}loadImageElement(t){this.gl.bindTexture(this.gl.TEXTURE_2D,this.sourceTexture),this.gl.texImage2D(this.gl.TEXTURE_2D,0,this.gl.RGBA,this.gl.RGBA,this.gl.UNSIGNED_BYTE,t),this.processNewImage()}loadImageData(t,e,r){this.gl.bindTexture(this.gl.TEXTURE_2D,this.sourceTexture),this.gl.texImage2D(this.gl.TEXTURE_2D,0,this.gl.RGBA,e,r,0,this.gl.RGBA,this.gl.UNSIGNED_BYTE,t instanceof Uint8ClampedArray?new Uint8Array(t.buffer):t),this.processNewImage()}loadFromImageData(t){this.loadImageData(t.data,t.width,t.height)}async loadBlob(t){const e=await createImageBitmap(t);this.loadImageElement(e),e.close()}loadBase64(t){const e=t.startsWith("data:")?t:`data:image/png;base64,${t}`;return this.loadImage(e)}async loadArrayBuffer(t,e="image/png"){const r=new Blob([t],{type:e});return this.loadBlob(r)}loadGradient(t,e=135){const r=512,i=document.createElement("canvas");i.width=r,i.height=r;const n=i.getContext("2d");if(!n)return;const o=e*Math.PI/180,a=256-Math.cos(o)*r,s=256-Math.sin(o)*r,u=256+Math.cos(o)*r,h=256+Math.sin(o)*r,m=n.createLinearGradient(a,s,u,h);t.forEach((e,r)=>{m.addColorStop(r/(t.length-1),e)}),n.fillStyle=m,n.fillRect(0,0,r,r),this.loadImageElement(i)}processNewImage(){[this.currentAlbumFBO,this.nextAlbumFBO]=[this.nextAlbumFBO,this.currentAlbumFBO],this.blurSourceInto(this.nextAlbumFBO),this.hasImage=!0,this.isTransitioning=!0,this.transitionStartTime=performance.now()}reblurCurrentImage(){this.blurSourceInto(this.nextAlbumFBO)}blurSourceInto(e){const r=this.gl;r.useProgram(this.tintProgram),this.setupAttributes(),r.bindFramebuffer(r.FRAMEBUFFER,this.blurFBO1.framebuffer),r.viewport(0,0,t,t),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,this.sourceTexture),r.uniform1i(this.uniforms.tint.texture,0),r.uniform3fv(this.uniforms.tint.tintColor,this._tintColor),r.uniform1f(this.uniforms.tint.tintIntensity,this._tintIntensity),r.drawArrays(r.TRIANGLES,0,6),r.useProgram(this.blurProgram),this.setupAttributes(),r.uniform2f(this.uniforms.blur.resolution,t,t),r.uniform1i(this.uniforms.blur.texture,0);let i=this.blurFBO1,n=this.blurFBO2;for(let o=0;o<this._blurPasses;o++)r.bindFramebuffer(r.FRAMEBUFFER,n.framebuffer),r.viewport(0,0,t,t),r.bindTexture(r.TEXTURE_2D,i.texture),r.uniform1f(this.uniforms.blur.offset,o+.5),r.drawArrays(r.TRIANGLES,0,6),[i,n]=[n,i];r.bindFramebuffer(r.FRAMEBUFFER,e.framebuffer),r.viewport(0,0,t,t),r.bindTexture(r.TEXTURE_2D,i.texture),r.uniform1f(this.uniforms.blur.offset,0),r.drawArrays(r.TRIANGLES,0,6)}resize(){const t=this.canvas.width,e=this.canvas.height;this.warpFBO&&this.deleteFramebuffer(this.warpFBO),this.warpFBO=this.createFramebuffer(t,e,!0)}start(){this.isPlaying||(this.isPlaying=!0,this.lastFrameTime=performance.now(),requestAnimationFrame(this.renderLoop))}stop(){this.isPlaying=!1,null!==this.animationId&&(cancelAnimationFrame(this.animationId),this.animationId=null)}renderFrame(t){const e=performance.now();if(void 0!==t)this.render(t,e);else{const t=(e-this.lastFrameTime)/1e3;this.lastFrameTime=e,this._animationSpeed+=.05*(this._targetAnimationSpeed-this._animationSpeed),this.accumulatedTime+=t*this._animationSpeed,this.render(this.accumulatedTime,e)}}dispose(){this.stop();const t=this.gl;t.deleteProgram(this.blurProgram),t.deleteProgram(this.blendProgram),t.deleteProgram(this.tintProgram),t.deleteProgram(this.warpProgram),t.deleteProgram(this.outputProgram),t.deleteBuffer(this.positionBuffer),t.deleteBuffer(this.texCoordBuffer),t.deleteTexture(this.sourceTexture),this.deleteFramebuffer(this.blurFBO1),this.deleteFramebuffer(this.blurFBO2),this.deleteFramebuffer(this.currentAlbumFBO),this.deleteFramebuffer(this.nextAlbumFBO),this.deleteFramebuffer(this.warpFBO)}renderLoop=t=>{if(!this.isPlaying)return;const e=(t-this.lastFrameTime)/1e3;this.lastFrameTime=t,this._animationSpeed+=.05*(this._targetAnimationSpeed-this._animationSpeed),this.accumulatedTime+=e*this._animationSpeed,this.render(this.accumulatedTime,t),this.animationId=requestAnimationFrame(this.renderLoop)};render(e,r=performance.now()){const i=this.gl,n=this.canvas.width,o=this.canvas.height;let a,s=1;if(this.isTransitioning){const t=r-this.transitionStartTime;s=Math.min(1,t/this._transitionDuration),s>=1&&(this.isTransitioning=!1)}this.isTransitioning&&s<1?(i.useProgram(this.blendProgram),this.setupAttributes(),i.bindFramebuffer(i.FRAMEBUFFER,this.blurFBO1.framebuffer),i.viewport(0,0,t,t),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,this.currentAlbumFBO.texture),i.uniform1i(this.uniforms.blend.texture1,0),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,this.nextAlbumFBO.texture),i.uniform1i(this.uniforms.blend.texture2,1),i.uniform1f(this.uniforms.blend.blend,s),i.drawArrays(i.TRIANGLES,0,6),a=this.blurFBO1.texture,i.useProgram(this.warpProgram),this.setupAttributes(),i.bindFramebuffer(i.FRAMEBUFFER,this.warpFBO.framebuffer),i.viewport(0,0,n,o),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,a),i.uniform1i(this.uniforms.warp.texture,0),i.uniform1f(this.uniforms.warp.time,e),i.uniform1f(this.uniforms.warp.intensity,this._warpIntensity),i.drawArrays(i.TRIANGLES,0,6),i.useProgram(this.outputProgram),this.setupAttributes(),i.bindFramebuffer(i.FRAMEBUFFER,null),i.viewport(0,0,n,o),i.bindTexture(i.TEXTURE_2D,this.warpFBO.texture),i.uniform1i(this.uniforms.output.texture,0),i.uniform1f(this.uniforms.output.saturation,this._saturation),i.uniform1f(this.uniforms.output.dithering,this._dithering),i.uniform1f(this.uniforms.output.time,e),i.uniform1f(this.uniforms.output.scale,this._scale),i.uniform2f(this.uniforms.output.resolution,n,o),i.drawArrays(i.TRIANGLES,0,6)):(i.useProgram(this.warpProgram),this.setupAttributes(),i.bindFramebuffer(i.FRAMEBUFFER,this.warpFBO.framebuffer),i.viewport(0,0,n,o),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,this.nextAlbumFBO.texture),i.uniform1i(this.uniforms.warp.texture,0),i.uniform1f(this.uniforms.warp.time,e),i.uniform1f(this.uniforms.warp.intensity,this._warpIntensity),i.drawArrays(i.TRIANGLES,0,6),i.useProgram(this.outputProgram),this.setupAttributes(),i.bindFramebuffer(i.FRAMEBUFFER,null),i.viewport(0,0,n,o),i.bindTexture(i.TEXTURE_2D,this.warpFBO.texture),i.uniform1i(this.uniforms.output.texture,0),i.uniform1f(this.uniforms.output.saturation,this._saturation),i.uniform1f(this.uniforms.output.dithering,this._dithering),i.uniform1f(this.uniforms.output.time,e),i.uniform1f(this.uniforms.output.scale,this._scale),i.uniform2f(this.uniforms.output.resolution,n,o),i.drawArrays(i.TRIANGLES,0,6))}setupAttributes(){const t=this.gl;t.bindBuffer(t.ARRAY_BUFFER,this.positionBuffer),t.enableVertexAttribArray(this.attribs.position),t.vertexAttribPointer(this.attribs.position,2,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,this.texCoordBuffer),t.enableVertexAttribArray(this.attribs.texCoord),t.vertexAttribPointer(this.attribs.texCoord,2,t.FLOAT,!1,0,0)}createShader(t,e){const r=this.gl,i=r.createShader(t);if(!i)throw new Error("Failed to create shader");if(r.shaderSource(i,e),r.compileShader(i),!r.getShaderParameter(i,r.COMPILE_STATUS)){const t=r.getShaderInfoLog(i);throw r.deleteShader(i),new Error(`Shader compile error: ${t}`)}return i}createProgram(t,e){const r=this.gl,i=this.createShader(r.VERTEX_SHADER,t),n=this.createShader(r.FRAGMENT_SHADER,e),o=r.createProgram();if(!o)throw new Error("Failed to create program");if(r.attachShader(o,i),r.attachShader(o,n),r.linkProgram(o),!r.getProgramParameter(o,r.LINK_STATUS)){const t=r.getProgramInfoLog(o);throw r.deleteProgram(o),new Error(`Program link error: ${t}`)}return r.deleteShader(i),r.deleteShader(n),o}createBuffer(t){const e=this.gl,r=e.createBuffer();if(!r)throw new Error("Failed to create buffer");return e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,t,e.STATIC_DRAW),r}createTexture(){const t=this.gl,e=t.createTexture();if(!e)throw new Error("Failed to create texture");return t.bindTexture(t.TEXTURE_2D,e),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),e}createFramebuffer(t,e,r=!1){const i=this.gl,n=this.createTexture(),o=r&&this.halfFloatExt&&this.halfFloatLinearExt?this.halfFloatExt.HALF_FLOAT_OES:i.UNSIGNED_BYTE;i.texImage2D(i.TEXTURE_2D,0,i.RGBA,t,e,0,i.RGBA,o,null);const a=i.createFramebuffer();if(!a)throw new Error("Failed to create framebuffer");return i.bindFramebuffer(i.FRAMEBUFFER,a),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,n,0),{framebuffer:a,texture:n}}deleteFramebuffer(t){this.gl.deleteFramebuffer(t.framebuffer),this.gl.deleteTexture(t.texture)}}export{r as Kawarp,r as default};
//# sourceMappingURL=index-BV04Qk1Z.js.map
