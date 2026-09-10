(function(){
  'use strict';

  var deferredPrompt = null;
  var banner = null;
  var DISMISS_KEY = 'dsbInstallDismissedUntilV2';
  var SESSION_KEY = 'dsbInstallShownThisSession';
  var bannerTimer = null;
  function shownThisSession(){
    try{ return sessionStorage.getItem(SESSION_KEY) === '1'; }catch(e){ return false; }
  }
  function scheduleBanner(){
    if (bannerTimer !== null || banner || dismissedRecently() || shownThisSession() || isStandalone) return;
    bannerTimer = setTimeout(function(){
      bannerTimer = null;
      if (document.hidden || document.querySelector('.overlay.open,.search-overlay.open')){ scheduleBanner(); return; }
      ensureBanner(deferredPrompt ? 'native' : isSafari ? 'ios' : 'fallback');
    }, 8000);
  }
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;

  var ua = navigator.userAgent || '';
  var isiOS = /iphone|ipad|ipod/i.test(ua);
  var isAndroid = /android/i.test(ua);
  var isSafari = isiOS && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  var isChromium = /chrome|chromium|crios|edg/i.test(ua) && !/opr\//i.test(ua);

  function dismissedRecently(){
    try{
      var until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return Date.now() < until;
    }catch(e){ return false; }
  }

  function dismiss(){
    if (banner) banner.classList.remove('show');
    try{ localStorage.setItem(DISMISS_KEY, String(Date.now() + 7*24*60*60*1000)); }catch(e){}
  }

  function fallbackInstructions(){
    if (isiOS){
      alert('On iPhone/iPad: open this site in Safari, tap the Share button, then choose “Add to Home Screen”.');
      return;
    }
    if (isAndroid){
      alert('Open your browser menu (⋮) and choose “Install app” or “Add to Home screen”. If the option is not visible yet, refresh this page once and try again.');
      return;
    }
    alert('Open your browser menu and choose “Install app” if that option is available.');
  }

  function ensureInstallStyles(){
    if (document.getElementById('dsb-install-styles')) return;
    var style = document.createElement('style');
    style.id = 'dsb-install-styles';
    style.textContent = '.install-banner{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));z-index:1200;width:min(560px,calc(100% - 24px));display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border:1px solid rgba(255,255,255,.32);border-radius:18px;background:rgba(32,27,61,.94);color:#fff6e9;box-shadow:0 18px 45px rgba(32,27,61,.28);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);transform:translate(-50%,calc(100% + 36px));opacity:0;visibility:hidden;pointer-events:none;transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .25s ease;box-sizing:border-box}.install-banner.show{transform:translate(-50%,0);opacity:1;visibility:visible;pointer-events:auto}.install-banner-mark{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border-radius:13px;overflow:hidden}.install-banner-mark img{width:100%;height:100%;display:block;object-fit:cover}.install-banner-copy{min-width:0;flex:1;display:flex;flex-direction:column;line-height:1.15}.install-banner-copy strong{font-family:inherit;font-size:15px}.install-banner-copy span{margin-top:3px;color:rgba(255,246,233,.76);font-size:12.5px}.install-banner-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}.install-btn{border:0;border-radius:12px;padding:9px 13px;background:#fff6e9;color:#201b3d;font:700 13px/1 inherit;cursor:pointer}.install-dismiss{width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:rgba(255,255,255,.8);font-size:24px;line-height:1;cursor:pointer}@media(max-width:520px){.install-banner{gap:9px;padding:10px}.install-banner-mark{width:38px;height:38px;flex-basis:38px}.install-banner-copy strong{font-size:13px}.install-banner-copy span{font-size:11px}.install-btn{padding:9px 10px}}@media(max-width:390px){.install-banner{width:calc(100% - 16px);bottom:max(10px,env(safe-area-inset-bottom));gap:7px}.install-banner-copy strong{font-size:12.5px}.install-banner-copy span{display:none}.install-btn{padding:8px 9px}.install-dismiss{width:30px;height:30px}}';
    document.head.appendChild(style);
  }

  function ensureBanner(mode){
    if (banner || dismissedRecently() || shownThisSession() || isStandalone || document.querySelector('.overlay.open,.search-overlay.open')) return;
    ensureInstallStyles();
    var nativeReady = mode === 'native' && !!deferredPrompt;
    var manualIOS = mode === 'ios';
    banner = document.createElement('aside');
    banner.className = 'install-banner';
    banner.setAttribute('role','dialog');
    banner.setAttribute('aria-label','Install Suhag Bhandar');
    banner.innerHTML = '<div class="install-banner-mark" aria-hidden="true"><img src="icon-192.png" alt=""></div>'+ 
      '<div class="install-banner-copy"><strong>Add Suhag Bhandar to Home Screen</strong><span>'+ 
      (nativeReady ? 'Install the shop for quicker access.' : manualIOS ? 'Keep the shop one tap away on your iPhone or iPad.' : 'Keep the shop one tap away on your phone.')+
      '</span></div>'+ 
      '<div class="install-banner-actions">'+
      '<button type="button" class="install-btn" data-install>'+(nativeReady ? 'Install' : 'Add')+'</button>'+ 
      '<button type="button" class="install-dismiss" data-dismiss aria-label="Dismiss install suggestion">×</button></div>';
    document.body.appendChild(banner);
    try{ sessionStorage.setItem(SESSION_KEY, '1'); }catch(e){}
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ banner.classList.add('show'); }); });

    banner.querySelector('[data-dismiss]').addEventListener('click', dismiss);
    banner.querySelector('[data-install]').addEventListener('click', async function(){
      if (deferredPrompt){
        var promptEvent = deferredPrompt;
        deferredPrompt = null;
        try{
          await promptEvent.prompt();
          await promptEvent.userChoice;
        }catch(e){}
        banner.classList.remove('show');
        return;
      }
      fallbackInstructions();
    });
  }

  // Capture the browser-native Chromium install event whenever it becomes available.
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    if (banner){
      var btn = banner.querySelector('[data-install]');
      if (btn) btn.textContent = 'Install';
    } else {
      scheduleBanner();
    }
  });

  window.addEventListener('appinstalled', function(){
    deferredPrompt = null;
    isStandalone = true;
    clearTimeout(bannerTimer);
    if (banner) banner.classList.remove('show');
    try{ sessionStorage.setItem(SESSION_KEY, '1'); }catch(e){}
  });

  // Register immediately instead of waiting for window.load, then wait for readiness.
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').then(function(){
      return navigator.serviceWorker.ready;
    }).catch(function(){});
  }

  // Offer the slim dismissible prompt on the first visit, once per tab session.
  if (isSafari || (isAndroid && isChromium)) scheduleBanner();
})();
