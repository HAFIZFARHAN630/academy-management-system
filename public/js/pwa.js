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
        const isAndroid = /Android/.test(ua);
        const isDesktop = !isIOS && !isAndroid;

        // Trigger the App Selection Modal
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            showAppSelectionModal(settings, isDesktop);
        });

        // Fallback for iOS/Desktop where beforeinstallprompt might not fire or is not supported
        setTimeout(() => {
            if (!sessionStorage.getItem('app-choice-shown') && !document.getElementById('app-selection-modal')) {
                showAppSelectionModal(settings, isDesktop);
            }
        }, 2000);

    } catch (err) {
        console.error('Failed to init PWA', err);
    }
}

function showAppSelectionModal(settings, isDesktop) {
    if (document.getElementById('app-selection-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'app-selection-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(12px);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fadeIn 0.4s ease;
    `;
    
    const desktopOption = isDesktop ? `
        <div class="app-option" id="opt-desktop">
            <div class="app-icon">💻</div>
            <div class="app-info">
                <strong>Desktop Software</strong>
                <span>Full desktop experience with native features.</span>
            </div>
            <button class="app-btn-select">Download</button>
        </div>
    ` : '';

    modal.innerHTML = `
        <style>
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            .app-selection-card {
                background: linear-gradient(145deg, #1e1e3f, #141528);
                padding: 40px;
                border-radius: 28px;
                max-width: 480px;
                width: 100%;
                text-align: center;
                border: 1px solid rgba(108,99,255,0.3);
                box-shadow: 0 40px 100px rgba(0,0,0,0.7);
                animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .app-options-list {
                display: flex;
                flex-direction: column;
                gap: 16px;
                margin: 30px 0;
                text-align: left;
            }
            .app-option {
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 18px;
                padding: 16px;
                display: flex;
                align-items: center;
                gap: 16px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .app-option:hover {
                background: rgba(108,99,255,0.1);
                border-color: rgba(108,99,255,0.4);
                transform: scale(1.02);
            }
            .app-icon {
                font-size: 2rem;
                width: 50px;
                height: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(108,99,255,0.2);
                border-radius: 14px;
            }
            .app-info { flex: 1; }
            .app-info strong { display: block; color: #fff; font-size: 1.05rem; }
            .app-info span { color: rgba(255,255,255,0.5); font-size: 0.85rem; }
            .app-btn-select {
                background: #6C63FF;
                color: #fff;
                border: none;
                padding: 8px 16px;
                border-radius: 10px;
                font-weight: 700;
                font-size: 0.85rem;
            }
            .web-link {
                color: rgba(255,255,255,0.4);
                text-decoration: none;
                font-size: 0.9rem;
                transition: color 0.2s;
            }
            .web-link:hover { color: #fff; }
        </style>
        <div class="app-selection-card">
            <div style="font-size: 3.5rem; margin-bottom: 15px;">🎓</div>
            <h2 style="color: #fff; margin: 0 0 8px 0; font-size: 1.6rem;">Academy Experience</h2>
            <p style="color: rgba(255,255,255,0.5); font-size: 0.95rem;">Choose how you want to use the Academy platform today.</p>
            
            <div class="app-options-list">
                <div class="app-option" id="opt-pwa">
                    <div class="app-icon">📱</div>
                    <div class="app-info">
                        <strong>Install Mobile App</strong>
                        <span>Fast, offline access, and lightweight.</span>
                    </div>
                    <button class="app-btn-select">Install</button>
                </div>
                ${desktopOption}
            </div>

            <a href="#" class="web-link" id="opt-web">Continue with Web Browser</a>
        </div>
    `;
    
    document.body.appendChild(modal);
    sessionStorage.setItem('app-choice-shown', '1');

    document.getElementById('opt-pwa').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                trackInstall();
                modal.remove();
            }
            deferredPrompt = null;
        } else {
            modal.remove();
            showiOSInstallGuide(true);
        }
    });

    if (isDesktop) {
        document.getElementById('opt-desktop').addEventListener('click', () => {
            // Link to the desktop installer (e.g. GitHub Releases)
            window.open('https://github.com/HAFIZFARHAN630/academy-management-system/releases', '_blank');
            modal.remove();
        });
    }

    document.getElementById('opt-web').addEventListener('click', (e) => {
        e.preventDefault();
        modal.remove();
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
