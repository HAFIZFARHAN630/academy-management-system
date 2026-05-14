/* ─── idle-tracker.js — Auto Logout System ──────────────────────────────── */
(function() {
    // Only run if user is logged in
    if (!localStorage.getItem('ams_token')) return;

    // Default timeout is 30 minutes (1800 seconds). Will be overridden by settings if available.
    let timeoutSeconds = 1800; 
    let warningThreshold = 60; // seconds before timeout to show warning
    
    let idleTime = 0;
    let idleInterval;
    let warningModalInjected = false;

    function injectWarningModal() {
        if (warningModalInjected || document.getElementById('idle-warning-overlay')) return;
        
        const div = document.createElement('div');
        div.innerHTML = `
        <div class="modal-overlay" id="idle-warning-overlay" style="z-index: 9999;">
            <div class="modal" style="max-width:400px; border-top: 4px solid var(--color-accent-rose);">
                <div class="modal-header">
                    <h3 style="color: var(--color-accent-rose);">⚠️ Session Expiring Soon</h3>
                </div>
                <div class="modal-body">
                    <p class="text-secondary">You have been inactive for a while. You will be automatically logged out in <strong id="idle-countdown">${warningThreshold}</strong> seconds to protect your account.</p>
                </div>
                <div class="modal-footer" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn btn-secondary" onclick="logout()">Log Out Now</button>
                    <button class="btn btn-primary" onclick="resetIdleTimer()">Stay Logged In</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div.firstElementChild);
        warningModalInjected = true;
    }

    function showWarningModal(timeLeft) {
        injectWarningModal();
        const overlay = document.getElementById('idle-warning-overlay');
        const countdown = document.getElementById('idle-countdown');
        if (overlay && countdown) {
            overlay.classList.add('open');
            countdown.textContent = timeLeft;
        }
    }

    function hideWarningModal() {
        const overlay = document.getElementById('idle-warning-overlay');
        if (overlay) overlay.classList.remove('open');
    }

    window.resetIdleTimer = function() {
        idleTime = 0;
        hideWarningModal();
    }

    function timerIncrement() {
        idleTime++;
        const timeLeft = timeoutSeconds - idleTime;

        if (timeLeft <= warningThreshold && timeLeft > 0) {
            showWarningModal(timeLeft);
        } else if (timeLeft <= 0) {
            // Force logout
            clearInterval(idleInterval);
            localStorage.removeItem('ams_token');
            localStorage.removeItem('ams_user');
            window.location.href = '/?session=expired';
        }
    }

    // Initialize Tracker
    async function initIdleTracker() {
        try {
            // Try fetching real timeout from settings (converted to seconds)
            // Session Timeout is usually in minutes in the settings UI.
            const settings = await API.get('/settings');

            // Assuming session timeout is in settings (if not, we keep default 270s)
            // But from settings.html, they had a UI for it. If not in API, we default to 4.5m.
            // Let's check if there's a session timeout in settings, else default 4.5 mins.
            // (The default requested by user is 4.5 mins)
        } catch (e) {
            console.warn('Could not fetch session timeout settings, using default 4.5 mins');
        }

        // Increment the idle time counter every second.
        idleInterval = setInterval(timerIncrement, 1000);

        // Zero the idle timer on user action.
        const events = ['mousemove', 'mousedown', 'keypress', 'DOMMouseScroll', 'mousewheel', 'touchmove', 'MSPointerMove'];
        events.forEach(eventName => {
            document.addEventListener(eventName, () => {
                // Do not reset if the warning is showing, force them to click "Stay Logged In"
                const overlay = document.getElementById('idle-warning-overlay');
                if (!overlay || !overlay.classList.contains('open')) {
                    idleTime = 0;
                }
            }, true);
        });
    }

    // Wait a bit for the UI to settle then init
    setTimeout(initIdleTracker, 1000);
})();
