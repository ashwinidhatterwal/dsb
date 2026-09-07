(function(){
  'use strict';

  var deferredPrompt = null;
  var banner = null;
  var DISMISS_KEY = 'dsbInstallDismissedUntilV2';
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

  function ensureBanner(mode){
    if (banner || dismissedRecently() || isStandalone) return;
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
      window.setTimeout(function(){ ensureBanner('native'); }, 900);
    }
  });

  window.addEventListener('appinstalled', function(){
    deferredPrompt = null;
    if (banner) banner.classList.remove('show');
    try{ localStorage.removeItem(DISMISS_KEY); }catch(e){}
  });

  // Register immediately instead of waiting for window.load, then wait for readiness.
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').then(function(){
      return navigator.serviceWorker.ready;
    }).catch(function(){});
  }

  // Never leave mobile users with no visible route to installation. Native Chromium
  // prompting is preferred; this is only the fallback when that event has not fired.
  if (!dismissedRecently()){
    if (isSafari){
      window.setTimeout(function(){ ensureBanner('ios'); }, 2200);
    } else if (isAndroid && isChromium){
      window.setTimeout(function(){ ensureBanner(deferredPrompt ? 'native' : 'fallback'); }, 3200);
    }
  }
})();
