/* ─── shared-sidebar.js — Reusable admin sidebar logic ──────────────────── */
function initAdminLayout(activePagePath) {
    updatePhonePrefixHints();
    // Inject Global Confirm Modal if not exists
    if (!document.getElementById('confirm-overlay')) {
        const div = document.createElement('div');
        div.innerHTML = `
        <div class="modal-overlay" id="confirm-overlay" style="z-index: 9999;">
            <div class="modal" style="max-width:400px;">
                <div class="modal-header">
                    <h3 id="confirm-title">Confirm Action</h3>
                    <button class="btn-close" onclick="closeConfirm(false)">✕</button>
                </div>
                <div class="modal-body"><p id="confirm-msg" class="text-secondary"></p></div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeConfirm(false)">Cancel</button>
                    <button class="btn btn-primary" id="confirm-ok-btn">Confirm</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div.firstElementChild);

        // Inject Idle Tracker script globally
        if (!document.getElementById('idle-tracker-script')) {
            const script = document.createElement('script');
            script.id = 'idle-tracker-script';
            script.src = '/js/idle-tracker.js';
            document.body.appendChild(script);
        }
    }

    if (!requireAuth(['admin'])) return;
    const u = getUser();

    // Set user info in sidebar
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = u?.full_name || 'Admin';
    if (avatarEl) avatarEl.textContent = avatarLetter(u?.full_name || 'A');

    // Mark active nav item
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        if (el.getAttribute('href') === activePagePath) el.classList.add('active');
    });

    // Live date
    const dateEl = document.getElementById('live-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Load notification badge
    loadNavNotifications();
    setInterval(loadNavNotifications, 30000);
}

async function loadNavNotifications() {
    try {
        const d = await API.get('/notifications/unread-count');
        const el = document.getElementById('notif-count');
        if (el) el.textContent = d.count;
        // leave badge
        const lb = document.getElementById('leave-badge');
        if (lb) { const s = await API.get('/stats'); lb.textContent = s.pending_leaves; }
    } catch (e) { }
}

function toggleSidebar() { 
    const s = document.getElementById('sidebar');
    if (window.innerWidth <= 1024) {
        s?.classList.toggle('open');
    } else {
        s?.classList.toggle('collapsed');
    }
}
function logout() { localStorage.clear(); window.location.href = '/'; }

async function loadSidebar() {
    const sidebarEl = document.getElementById('sidebar');
    if (!sidebarEl) return;

    // Extract page name from URL (e.g., /admin/calendar.html -> calendar)
    const path = window.location.pathname;
    const page = path.split('/').pop().split('.')[0] || 'dashboard';

    sidebarEl.outerHTML = getSidebarHTML(page);
    initAdminLayout(path);
}

function toggleNotifPanel() { document.getElementById('notif-panel')?.classList.toggle('open'); }
document.addEventListener('click', e => {
    if (!e.target.closest('#notif-btn') && !e.target.closest('#notif-panel')) {
        document.getElementById('notif-panel')?.classList.remove('open');
    }
});

// Standard sidebar HTML — inject into pages
function getSidebarHTML(activePage) {
    return `
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="logo-icon">🎓</div>
      <div class="logo-text">ClickTake <span>Academy</span><br><small style="font-size:0.65rem;color:var(--text-muted);font-weight:400;">Admin Panel</small></div>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-section">
        <div class="sidebar-section-label">Main</div>
        <a href="/admin/dashboard.html" class="nav-item ${activePage === 'dashboard' ? 'active' : ''}"><span class="nav-icon">📊</span><span class="nav-label">Dashboard</span></a>
        <a href="/admin/attendance.html" class="nav-item ${activePage === 'attendance' ? 'active' : ''}"><span class="nav-icon">⏰</span><span class="nav-label">Live Attendance</span></a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">Users</div>
        <a href="/admin/registrations.html" class="nav-item ${activePage === 'registrations' ? 'active' : ''}"><span class="nav-icon">📝</span><span class="nav-label">Registrations</span></a>
        <a href="/admin/teachers.html" class="nav-item ${activePage === 'teachers' ? 'active' : ''}"><span class="nav-icon">👨‍🏫</span><span class="nav-label">Teachers</span></a>
        <a href="/admin/calendar.html" class="nav-item ${activePage === 'calendar' ? 'active' : ''}"><span class="nav-icon">📅</span><span class="nav-label">Calendar</span></a>
        <a href="/admin/students.html" class="nav-item ${activePage === 'students' ? 'active' : ''}"><span class="nav-icon">🎓</span><span class="nav-label">Students</span></a>
        <a href="/admin/workers.html" class="nav-item ${activePage === 'workers' ? 'active' : ''}"><span class="nav-icon">👷</span><span class="nav-label">Workers</span></a>
        <a href="/admin/visitors.html" class="nav-item ${activePage === 'visitors' ? 'active' : ''}"><span class="nav-icon">🚪</span><span class="nav-label">Visitors</span></a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">Finance & HR</div>
        <a href="/admin/salary.html" class="nav-item ${activePage === 'salary' ? 'active' : ''}"><span class="nav-icon">💰</span><span class="nav-label">Salary</span></a>
        <a href="/admin/leave.html" class="nav-item ${activePage === 'leave' ? 'active' : ''}"><span class="nav-icon">📅</span><span class="nav-label">Leave</span><span class="nav-badge" id="leave-badge">0</span></a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">System</div>
        <a href="/admin/settings.html" class="nav-item ${activePage === 'settings' ? 'active' : ''}"><span class="nav-icon">⚙️</span><span class="nav-label">Settings</span></a>
      </div>
    </nav>
    <div class="sidebar-footer">
      <a href="/admin/settings.html#profile" class="user-menu" style="text-decoration:none; color:inherit; display:flex; width:100%;">
        <div class="avatar" id="user-avatar" style="background:var(--color-admin); flex-shrink:0;">A</div>
        <div class="user-info" style="overflow:hidden;"><div class="user-name" id="user-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Admin</div><div class="user-role">Administrator</div></div>
      </a>
    </div>
  </aside>`;
}

function getTopbarHTML(title) {
    return `
  <div class="topbar">
    <div class="topbar-left">
      <button class="btn btn-secondary btn-icon" onclick="toggleSidebar()" title="Toggle sidebar">☰</button>
      <div><div class="page-title">${title}</div><div class="page-breadcrumb" id="live-date"></div></div>
    </div>
    <div class="topbar-right">
      <div style="position:relative">
        <button class="notif-btn" id="notif-btn" onclick="toggleNotifPanel()">🔔<span class="notif-badge" id="notif-count">0</span></button>
        <div class="notif-panel" id="notif-panel">
          <div class="notif-panel-header">
            <span style="font-weight:700;font-size:0.95rem;">Notifications</span>
            <button class="btn btn-sm btn-secondary" onclick="API.post('/notifications/read-all').then(loadNavNotifications)">Mark all read</button>
          </div>
          <div id="notif-list"><div style="padding:var(--space-5);text-align:center;color:var(--text-muted);font-size:0.85rem;">Loading...</div></div>
        </div>
      </div>
      <a href="/admin/settings.html#profile" class="btn btn-secondary btn-icon profile-btn" style="border-radius:50%; background:var(--bg-600); border:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:center; text-decoration:none; position:relative; z-index:10;" title="Personal Profile">👤</a>
      <button class="btn btn-secondary btn-sm" onclick="logout()" style="position:relative; z-index:10;">🚪 Logout</button>
    </div>
  </div>`;
}

function closeConfirm(val) {
    document.getElementById('confirm-overlay')?.classList.remove('open');
    if (window._confirmResolve) window._confirmResolve(val);
}

window.confirmAction = (title, msg) => {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-overlay');
        if (!overlay) return resolve(confirm(msg)); // Fallback if modal fails to inject
        
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-msg').textContent = msg;
        overlay.classList.add('open');
        window._confirmResolve = resolve;
        
        // Set ok btn handler
        const okBtn = document.getElementById('confirm-ok-btn');
        if (okBtn) okBtn.onclick = () => closeConfirm(true);
    });
};

function updatePhonePrefixHints() {
    const prefix = APP_CONFIG?.phone_prefix || '';
    document.querySelectorAll('#phone-prefix-hint').forEach(el => {
        el.textContent = `(${prefix})`;
    });
}
