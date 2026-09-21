// utils.js - small helpers shared by the user app, admin and sub-admin panels

export const DEFAULT_BANNER =
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop';

// Players needed per registration for each mode
export const PLAYERS_BY_MODE = { SOLO: 1, DUO: 2, SQUAD: 4, CS: 4 };

/** Escape any user-controlled text before putting it into innerHTML. */
export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** Round to 2 decimals (money). */
export const money = (n) => Math.round(num(n) * 100) / 100;

export const fmtINR = (n) => `₹${num(n).toFixed(2)}`;

/**
 * Reads wallet balances from a user document.
 * Old accounts only have `walletBalance`; treat that as deposit balance.
 */
export function getBalances(userData = {}) {
    return {
        dep: num(userData.depositBalance ?? userData.walletBalance),
        win: num(userData.winningBalance)
    };
}

/** Firestore Timestamp | {seconds} | number | ISO string -> milliseconds (or null) */
export function toMillis(t) {
    if (t === null || t === undefined || t === '') return null;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t === 'object' && typeof t.seconds === 'number') return t.seconds * 1000;
    const n = typeof t === 'number' ? t : new Date(t).getTime();
    return Number.isFinite(n) ? n : null;
}

/** ms -> value for <input type="datetime-local"> */
export function toInputDateTime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function debounce(fn, wait = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

export function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Human friendly message for Firebase auth errors. */
export function authErrorMessage(err) {
    switch (err?.code) {
        case 'auth/invalid-email': return 'Email sahi nahi hai.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential': return 'Email ya password galat hai.';
        case 'auth/email-already-in-use': return 'Ye email pehle se registered hai. Sign In karein.';
        case 'auth/weak-password': return 'Password kam se kam 6 characters ka rakhein.';
        case 'auth/too-many-requests': return 'Bahut zyada attempts. Thodi der baad try karein.';
        case 'auth/popup-closed-by-user': return 'Login popup band ho gaya.';
        case 'auth/network-request-failed': return 'Internet connection check karein.';
        default: return err?.message || 'Kuch galat ho gaya.';
    }
}

let toastTimer;
/**
 * Toast that works on every page. Uses #toast if the page has one (index.html),
 * otherwise creates its own.
 */
export function toast(message, type = 'success') {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.style.cssText =
            'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
            'padding:10px 18px;border-radius:30px;font:700 12px Inter,sans-serif;' +
            'z-index:99999;opacity:0;transition:opacity .25s;max-width:90vw;text-align:center;pointer-events:none;';
        document.body.appendChild(el);
    }

    const isError = type === 'error';
    const icon = isError ? 'fa-circle-exclamation' : 'fa-circle-check';
    el.innerHTML = `<i class="fa-solid ${icon}"></i> ${esc(message)}`;

    const usesClass = el.classList.contains('toast');
    el.style.background = isError ? '#ff3b3b' : (usesClass ? '' : '#00e676');
    el.style.color = isError ? '#fff' : (usesClass ? '' : '#000');

    if (usesClass) el.classList.add('show'); else el.style.opacity = '1';

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        if (usesClass) el.classList.remove('show'); else el.style.opacity = '0';
    }, isError ? 4000 : 2800);
}

export const notifyError = (msg) => toast(msg, 'error');
