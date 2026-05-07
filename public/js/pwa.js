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

        // Always show install modal when not standalone (regardless of beforeinstallprompt)
        if (!isStandalone) {
            if (settings.force_app) {
                // Wait for deferred prompt before showing force modal
                window.addEventListener('beforeinstallprompt', (e) => {
                    e.preventDefault();
                    deferredPrompt = e;
                    showForceAppModal();
                });
                // Also show modal after short delay even if no deferred prompt (iOS etc.)
                setTimeout(() => {
                    if (!document.getElementById('pwa-force-modal')) {
                        showForceAppModal();
                    }
                }, 1500);
            } else if (settings.prompt_install) {
                window.addEventListener('beforeinstallprompt', (e) => {
                    e.preventDefault();
                    deferredPrompt = e;
                    showInstallPopup();
                });
                // For iOS / browsers that don't fire beforeinstallprompt
                setTimeout(() => {
                    if (!document.getElementById('pwa-install-popup')) {
                        showInstallPopup();
                    }
                }, 2000);
            }
        }
    } catch (err) {
        console.error('Failed to init PWA', err);
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
        background: var(--bg-800, #141528);
        color: #fff;
        padding: 18px 24px;
        border-radius: 16px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 16px;
        border: 1px solid rgba(108,99,255,0.4);
        min-width: 300px;
        max-width: 90vw;
        animation: slideUp 0.3s ease;
    `;
    
    popup.innerHTML = `
        <style>
          @keyframes slideUp { from { opacity:0; transform: translateX(-50%) translateY(20px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        </style>
        <div style="font-size:2rem;">📱</div>
        <div style="flex:1;">
            <div style="font-weight:700; margin-bottom:4px;">Install Academy App</div>
            <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">Faster & works offline. Install now or continue in browser.</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; flex-shrink:0;">
            <button id="pwa-install-btn" style="background:#6C63FF;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;white-space:nowrap;">Install App</button>
            <button id="pwa-close-btn" style="background:transparent;color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.15);padding:6px 16px;border-radius:8px;cursor:pointer;font-size:0.8rem;white-space:nowrap;">Not now</button>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
        popup.remove();
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log('Install prompt outcome:', outcome);
            deferredPrompt = null;
        } else {
            alert('To install: tap the browser menu (⋮ or Share button) and select "Add to Home Screen".');
        }
    });
    
    document.getElementById('pwa-close-btn').addEventListener('click', () => {
        popup.remove();
        sessionStorage.setItem('pwa-dismissed', '1');
    });
}

function showForceAppModal() {
    if (document.getElementById('pwa-force-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'pwa-force-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(8px);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
    `;
    
    modal.innerHTML = `
        <div style="background: #141528; padding: 32px; border-radius: 20px; text-align: center; max-width: 400px; width:100%; border: 1px solid rgba(108,99,255,0.3); box-shadow: 0 20px 60px rgba(0,0,0,0.6);">
            <div style="font-size: 3.5rem; margin-bottom: 16px;">📱</div>
            <h3 style="margin:0 0 8px 0; color:#fff; font-size:1.3rem;">Get the App Experience</h3>
            <p style="color: rgba(255,255,255,0.6); margin-bottom: 24px; font-size:0.9rem; line-height:1.5;">Install the Academy app for the best performance, offline access, and instant updates.</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="pwa-force-install-btn" style="background:#6C63FF;color:#fff;border:none;padding:14px;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;">⬇️ Install App</button>
                <button id="pwa-force-cancel-btn" style="background:transparent;color:rgba(255,255,255,0.4);border:none;padding:10px;cursor:pointer;font-size:0.85rem;">Continue in browser</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('pwa-force-install-btn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') modal.remove();
            deferredPrompt = null;
        } else {
            // iOS/Safari fallback
            alert('To install: tap the Share button (📤) then "Add to Home Screen", or use your browser menu (⋮) → "Install App".');
        }
    });
    
    document.getElementById('pwa-force-cancel-btn').addEventListener('click', () => {
        modal.remove();
    });
}

window.addEventListener('load', initPWA);
