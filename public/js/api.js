/* ─── api.js — Fetch wrapper with JWT auth ──────────────────────────────── */
const API_BASE = 'https://academy-management-system-40i1.onrender.com/api';
let APP_CONFIG = { currency: 'PKR', phone_prefix: '+92', timezone: 'Asia/Karachi' };

function getToken() { return localStorage.getItem('ams_token'); }
function getUser() { return JSON.parse(localStorage.getItem('ams_user') || 'null'); }

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401 && !path.includes('/auth/login')) {
        localStorage.removeItem('ams_token');
        localStorage.removeItem('ams_user');
        window.location.href = '/login.html?session=expired';
        return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

const API = {
    get: (path) => apiFetch(path),
    post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (path, body) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (path) => apiFetch(path, { method: 'DELETE' }),
};

async function uploadToCloudinary(file) {
    if (!file) return null;
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const res = await fetch(`${API_BASE}/users/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
}

// ─── Toast System ────────────────────────────────────────────────────────────
function toast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    container.appendChild(t);
    setTimeout(() => { t.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => t.remove(), 300); }, duration);
}

// ─── Format Helpers ───────────────────────────────────────────────────────────
function formatTime(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: APP_CONFIG.timezone || 'Asia/Karachi'
    });
}
function formatDate(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleDateString([], { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        timeZone: APP_CONFIG.timezone || 'Asia/Karachi'
    });
}
function formatDuration(seconds) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function timeAgo(unix) {
    if (!unix) return '—';
    const diff = Math.floor(Date.now() / 1000) - unix;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return formatDate(unix);
}
function avatarLetter(name) {
    return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function attendanceStatus(record) {
    if (!record || record.status === 'not_punched') return { label: 'Absent', cls: 'badge-red', dot: 'red' };
    if (record.punch_in && !record.punch_out) return { label: 'In', cls: 'badge-green', dot: 'green' };
    if (record.status === 'late') return { label: 'Late', cls: 'badge-amber', dot: 'amber' };
    return { label: 'Present', cls: 'badge-green', dot: 'green' };
}
function formatCurrency(amount) {
    return `${APP_CONFIG.currency} ${parseFloat(amount || 0).toLocaleString()}`;
}

// ─── Role Guard ───────────────────────────────────────────────────────────────
function requireAuth(allowedRoles) {
    const token = getToken();
    const user = getUser();
    if (!token || !user) { window.location.href = '/login.html'; return false; }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        window.location.href = `/${user.role}/dashboard.html`;
        return false;
    }
    return true;
}
// ─── Branding System ─────────────────────────────────────────────────────────
async function applyBranding() {
    try {
        const settings = await API.get('/settings');
        if (settings.currency) APP_CONFIG.currency = settings.currency;
        if (settings.phone_prefix) APP_CONFIG.phone_prefix = settings.phone_prefix;
        if (settings.timezone) APP_CONFIG.timezone = settings.timezone;

        const branding = await API.get('/settings/branding');
        if (branding.name) {
            document.title = `${branding.name} — Management System`;
            const logoText = document.querySelector('.nav-logo-text');
            if (logoText) {
                logoText.innerHTML = `${branding.name} <small>${branding.tagline || 'Management System'}</small>`;
            }
        }
        if (branding.colors) {
            const style = document.createElement('style');
            style.id = 'branding-style';
            style.innerHTML = `
                :root {
                    --color-primary: ${branding.colors.primary} !important;
                    --color-primary-light: ${branding.colors.primary}CC !important;
                    --color-secondary: ${branding.colors.secondary} !important;
                    --color-accent-teal: ${branding.colors.accent} !important;
                }
            `;
            document.head.appendChild(style);
        }
    } catch (e) { console.warn('Branding/Settings failed to load:', e.message); }
}

document.addEventListener('DOMContentLoaded', applyBranding);
