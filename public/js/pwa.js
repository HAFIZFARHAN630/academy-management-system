let deferredPrompt;

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

        // Force App Logic
        if (settings.force_app && !isStandalone) {
            showForceAppModal();
        }

        // Install Prompt Logic
        if (settings.prompt_install) {
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                if (!isStandalone && !document.getElementById('pwa-force-modal')) {
                    showInstallPopup();
                }
            });
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
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-800);
        color: #fff;
        padding: 15px 20px;
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 15px;
        border: 1px solid var(--color-primary);
    `;
    
    popup.innerHTML = `
        <div>
            <h4 style="margin:0 0 5px 0">Install Academy App</h4>
            <p style="margin:0; font-size: 0.9rem; color: var(--text-secondary)">For a faster, better experience.</p>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="pwa-install-btn" class="btn btn-primary btn-sm">Install</button>
            <button id="pwa-close-btn" class="btn btn-secondary btn-sm">✕</button>
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
        }
    });
    
    document.getElementById('pwa-close-btn').addEventListener('click', () => {
        popup.remove();
    });
}

function showForceAppModal() {
    if (document.getElementById('pwa-force-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'pwa-force-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8);
        backdrop-filter: blur(5px);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    modal.innerHTML = `
        <div style="background: var(--bg-800); padding: 30px; border-radius: var(--radius-xl); text-align: center; max-width: 400px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 3rem; margin-bottom: 15px;">📱</div>
            <h3 style="margin-bottom: 10px">App Available</h3>
            <p style="color: var(--text-secondary); margin-bottom: 20px">Please use our mobile/desktop app for the best experience and performance.</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="pwa-force-install-btn" class="btn btn-primary">Install / Open App</button>
                <button id="pwa-force-cancel-btn" class="btn btn-secondary" style="background: transparent; border: none; color: var(--text-muted)">Continue in browser (Not Recommended)</button>
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
            alert('App is already installed or install is not supported on this browser. Try opening it from your home screen or app launcher.');
        }
    });
    
    document.getElementById('pwa-force-cancel-btn').addEventListener('click', () => {
        modal.remove();
    });
}

window.addEventListener('load', initPWA);
