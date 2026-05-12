let deferredPrompt;
let pwaReady = false;

async function initPWA() {
    try {
        const response = await fetch('/api/settings/pwa');
        const settings = await response.json();
        
        if (!settings.enabled) return;

        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('PWA SW registered'))
                .catch(err => console.log('PWA SW error', err));
        }

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

        if (isStandalone) {
            console.log('App is running in standalone mode');
            return;
        }

        // Detect Platform
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            if (settings.force_app) {
                showForceAppModal();
            } else if (settings.prompt_install) {
                if (!sessionStorage.getItem('pwa-dismissed')) {
                    showInstallPopup();
                }
            }
        });

        // iOS / Safari Fallback
        if (isIOS && isSafari && !sessionStorage.getItem('pwa-dismissed')) {
            setTimeout(() => {
                if (settings.force_app) {
                    showiOSInstallGuide(true);
                } else if (settings.prompt_install) {
                    showiOSInstallGuide(false);
                }
            }, 3000);
        }
    } catch (err) {
        console.error('Failed to init PWA', err);
    }
}

async function trackInstall() {
    try {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        const isAndroid = /Android/.test(ua);
        
        await fetch('/api/analytics/pwa-install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_type: isAndroid || isIOS ? 'mobile' : 'desktop',
                os: isAndroid ? 'android' : (isIOS ? 'ios' : 'other'),
                browser: /Chrome/.test(ua) ? 'chrome' : (/Safari/.test(ua) ? 'safari' : 'other')
            })
        });
    } catch (err) {
        console.error('Tracking failed', err);
    }
}

function showInstallPopup() {
    if (document.getElementById('pwa-install-popup')) return;
    
    const popup = document.createElement('div');
    popup.id = 'pwa-install-popup';
    popup.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #1e1e3f 0%, #141528 100%);
        color: #fff;
        padding: 20px;
        border-radius: 20px;
        box-shadow: 0 15px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.3);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 18px;
        min-width: 340px;
        max-width: 90vw;
        animation: pwaSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    popup.innerHTML = `
        <style>
          @keyframes pwaSlideUp { from { opacity:0; transform: translateX(-50%) translateY(30px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
          .pwa-btn { border:none; padding:10px 20px; border-radius:12px; font-weight:700; cursor:pointer; transition:all 0.2s; font-size:0.9rem; }
          .pwa-btn-primary { background: linear-gradient(90deg, #6C63FF, #8E85FF); color:#fff; box-shadow: 0 4px 15px rgba(108,99,255,0.4); }
          .pwa-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(108,99,255,0.6); }
          .pwa-btn-secondary { background: rgba(255,255,255,0.05); color:rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.1); }
          .pwa-btn-secondary:hover { background: rgba(255,255,255,0.1); }
        </style>
        <div style="background: rgba(108,99,255,0.2); width:56px; height:56px; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">
            🎓
        </div>
        <div style="flex:1;">
            <div style="font-weight:700; font-size:1.1rem; margin-bottom:2px;">Academy App</div>
            <div style="font-size: 0.85rem; color: rgba(255,255,255,0.5); line-height:1.4;">Install for a faster experience & offline access.</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; flex-shrink:0;">
            <button id="pwa-install-btn" class="pwa-btn pwa-btn-primary">Install</button>
            <button id="pwa-close-btn" class="pwa-btn pwa-btn-secondary">Later</button>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                trackInstall();
                popup.remove();
            }
            deferredPrompt = null;
        }
    });
    
    document.getElementById('pwa-close-btn').addEventListener('click', () => {
        popup.remove();
        sessionStorage.setItem('pwa-dismissed', '1');
    });
}

function showiOSInstallGuide(force = false) {
    if (document.getElementById('pwa-ios-guide')) return;
    
    const modal = document.createElement('div');
    modal.id = 'pwa-ios-guide';
    modal.style.cssText = `
        position: fixed;
        bottom: 0; left: 0; right: 0;
        background: linear-gradient(to top, #141528, #1e1e3f);
        padding: 30px 20px 40px;
        border-radius: 30px 30px 0 0;
        box-shadow: 0 -10px 50px rgba(0,0,0,0.5);
        z-index: 10002;
        color: #fff;
        text-align: center;
        animation: pwaSlideInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    modal.innerHTML = `
        <style>
            @keyframes pwaSlideInUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            .ios-icon { width: 32px; height: 32px; vertical-align: middle; margin: 0 4px; }
        </style>
        <div style="width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin: 0 auto 20px;"></div>
        <div style="font-size: 3rem; margin-bottom: 15px;">📲</div>
        <h3 style="margin-bottom: 10px; font-size: 1.4rem;">Install on iPhone</h3>
        <p style="color: rgba(255,255,255,0.6); font-size: 1rem; line-height: 1.6; max-width: 300px; margin: 0 auto 25px;">
            To install the Academy app, tap the <strong>Share</strong> button <img src="/icons/ios-share.png" class="ios-icon" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgM1YxNU0xMiAzTDkgNk0xMiAzTDE1IDZNNSAxMkg3VjE5SDE3VjEySDE5VjIxSDVWMTJaIiBzdHJva2U9IiM2QzYzRkYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+'"> then <strong>Add to Home Screen</strong>.
        </p>
        <button id="pwa-ios-close" style="background: rgba(108,99,255,0.15); color: #6C63FF; border: 1px solid rgba(108,99,255,0.3); padding: 12px 40px; border-radius: 12px; font-weight: 700; cursor: pointer;">Got it</button>
    `;
    
    document.body.appendChild(modal);
    document.getElementById('pwa-ios-close').addEventListener('click', () => {
        modal.remove();
        if (!force) sessionStorage.setItem('pwa-dismissed', '1');
    });
}

function showForceAppModal() {
    if (document.getElementById('pwa-force-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'pwa-force-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.9);
        backdrop-filter: blur(10px);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;
    
    modal.innerHTML = `
        <div style="background: #141528; padding: 40px; border-radius: 24px; text-align: center; max-width: 440px; width:100%; border: 1px solid rgba(108,99,255,0.2); box-shadow: 0 30px 80px rgba(0,0,0,0.8);">
            <div style="font-size: 4rem; margin-bottom: 20px;">🎓</div>
            <h2 style="margin:0 0 12px 0; color:#fff; font-size:1.8rem;">Upgrade Your Experience</h2>
            <p style="color: rgba(255,255,255,0.5); margin-bottom: 32px; font-size:1rem; line-height:1.6;">Install the official Academy App for the best performance, instant notifications, and offline access.</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="pwa-force-install-btn" style="background: linear-gradient(90deg, #6C63FF, #8E85FF); color:#fff; border:none; padding:16px; border-radius:14px; font-weight:700; font-size:1.1rem; cursor:pointer; box-shadow: 0 10px 25px rgba(108,99,255,0.3);">⬇️ Install Academy App</button>
                <button id="pwa-force-cancel-btn" style="background:transparent; color:rgba(255,255,255,0.3); border:none; padding:12px; cursor:pointer; font-size:0.9rem;">Continue in browser</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('pwa-force-install-btn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                trackInstall();
                modal.remove();
            }
            deferredPrompt = null;
        } else {
            showiOSInstallGuide(true);
        }
    });
    
    document.getElementById('pwa-force-cancel-btn').addEventListener('click', () => {
        modal.remove();
    });
}

window.addEventListener('load', initPWA);
window.addEventListener('appinstalled', (evt) => {
    console.log('Academy app was installed');
    trackInstall();
});
