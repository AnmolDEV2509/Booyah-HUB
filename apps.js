// apps.js - Booyah HUB player app (loaded by index.html)
import { db, storage, auth, googleProvider } from "./firebase-config.js";
import {
    collection, doc, onSnapshot, getDoc, getDocs, setDoc, runTransaction,
    query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import {
    signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    esc, num, money, fmtINR, getBalances, toMillis, isValidEmail, authErrorMessage,
    toast, notifyError, DEFAULT_BANNER, PLAYERS_BY_MODE
} from "./utils.js";

/* ==========================================================================
   STATE
   ========================================================================== */
let currentUser = null;
let profile = { name: '', mobileNumber: '', photoURL: '' };
let photoBust = '';                       // cache-buster, only changes when photo is re-uploaded
let wallet = { dep: 0, win: 0, total: 0 };

let tournamentsData = [];
let joinedMatchIds = new Set();
let currentModeFilter = 'ALL';
let currentStatusFilter = 'ALL';
let searchText = '';
let activePage = 'Home';
let notifEnabled = true;

let currentMatchToJoin = null;
let selectedMatchMode = 'SOLO';
let selectedResultFile = null;
let selectedResultMatchId = null;
let pendingDepositAmount = 0;

let isJoining = false;
let isSubmittingResult = false;
let isSubmittingDeposit = false;
let isSubmittingWithdraw = false;

let unsubWallet = null;
let unsubRegistrations = null;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const $ = (id) => document.getElementById(id);

/* ==========================================================================
   SMALL HELPERS
   ========================================================================== */
window.showToast = (msg) => toast(msg);

function playersFor(mode) {
    return PLAYERS_BY_MODE[(mode || 'SOLO').toUpperCase()] || 1;
}

function statusOf(t) {
    return (t.status || 'UPCOMING').toUpperCase();
}

window.copyToClipboard = async (text, label) => {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        toast(`${label} Copied!`);
    } catch {
        notifyError('Copy nahi ho paya. Manually copy karein.');
    }
};

window.toggleNotif = () => {
    notifEnabled = !notifEnabled;
    const btn = $('notifToggle');
    if (btn) btn.style.color = notifEnabled ? 'var(--accent-orange)' : 'var(--text-muted)';
    toast(notifEnabled ? 'Notifications Enabled' : 'Notifications Muted');
};

window.closeModal = (modalId) => {
    $(modalId)?.classList.remove('active');
    if (modalId === 'resultModal') {
        selectedResultFile = null;
        const input = $('ssFile');
        if (input) input.value = '';
    }
};

/* ==========================================================================
   USER DOCUMENT + WALLET
   ========================================================================== */
async function ensureUserDoc(user) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const fallbackName = user.displayName || 'Gamer User';

    if (!snap.exists()) {
        await setDoc(userRef, {
            name: fallbackName,
            email: user.email || '',
            mobileNumber: '',
            photoURL: '',
            depositBalance: 0,
            winningBalance: 0,
            createdAt: serverTimestamp()
        });
        profile = { name: fallbackName, mobileNumber: '', photoURL: '' };
        return;
    }

    const data = snap.data();
    const updates = {};
    // Migrate old accounts that only had `walletBalance`
    if (data.depositBalance === undefined) updates.depositBalance = num(data.walletBalance);
    if (data.winningBalance === undefined) updates.winningBalance = 0;
    if (!data.name) updates.name = fallbackName;
    if (data.mobileNumber === undefined) updates.mobileNumber = '';
    if (data.photoURL === undefined) updates.photoURL = '';
    if (!data.email && user.email) updates.email = user.email;
    if (Object.keys(updates).length) await setDoc(userRef, updates, { merge: true });

    profile = {
        name: updates.name || data.name || fallbackName,
        mobileNumber: data.mobileNumber || '',
        photoURL: data.photoURL || ''
    };
}

function updateWalletUI() {
    const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    set('depositVal', fmtINR(wallet.dep));
    set('winningVal', fmtINR(wallet.win));
    set('totalVal', fmtINR(wallet.total));
    set('headerWalletDisplay', fmtINR(wallet.total));
}

function setWallet(dep, win) {
    wallet = { dep: num(dep), win: num(win), total: num(dep) + num(win) };
    updateWalletUI();
}

function listenWallet(uid) {
    unsubWallet?.();
    unsubWallet = onSnapshot(doc(db, 'users', uid), (snap) => {
        const b = getBalances(snap.exists() ? snap.data() : {});
        setWallet(b.dep, b.win);
    }, (err) => console.error('Wallet listener error:', err));
}

function listenRegistrations(uid) {
    unsubRegistrations?.();
    unsubRegistrations = onSnapshot(
        query(collection(db, 'registrations'), where('userId', '==', uid)),
        (snap) => {
            joinedMatchIds = new Set(snap.docs.map(d => d.data().tournamentId));
            window.renderTournaments();
        },
        (err) => console.error('Registrations listener error:', err)
    );
}

/* ==========================================================================
   AUTH
   ========================================================================== */
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    unsubWallet?.(); unsubWallet = null;
    unsubRegistrations?.(); unsubRegistrations = null;

    if (user) {
        try { await ensureUserDoc(user); }
        catch (err) { console.error('ensureUserDoc failed:', err); }
        listenWallet(user.uid);
        listenRegistrations(user.uid);
    } else {
        profile = { name: '', mobileNumber: '', photoURL: '' };
        joinedMatchIds = new Set();
        setWallet(0, 0);
    }
    window.renderCurrentPage();
});

window.handleGoogleLogin = async () => {
    try {
        await signInWithPopup(auth, googleProvider);
        toast('Logged in with Google!');
    } catch (err) {
        notifyError(authErrorMessage(err));
    }
};

function readAuthForm() {
    const email = ($('authEmail')?.value || '').trim();
    const pass = $('authPassword')?.value || '';
    if (!isValidEmail(email)) { notifyError('Sahi email enter karein.'); return null; }
    if (!pass) { notifyError('Password enter karein.'); return null; }
    return { email, pass };
}

window.handleEmailLogin = async () => {
    const form = readAuthForm();
    if (!form) return;
    try {
        await signInWithEmailAndPassword(auth, form.email, form.pass);
        toast('Login Successful!');
    } catch (err) {
        notifyError(authErrorMessage(err));
    }
};

window.handleEmailSignup = async () => {
    const form = readAuthForm();
    if (!form) return;
    try {
        await createUserWithEmailAndPassword(auth, form.email, form.pass);
        toast('Account Created!');
    } catch (err) {
        notifyError(authErrorMessage(err));
    }
};

window.handleLogout = async () => {
    await signOut(auth);
    toast('Logged Out');
    window.navigate('Home', document.querySelector('.nav-btn'));
};

/* ==========================================================================
   NAVIGATION + PAGES
   ========================================================================== */
window.navigate = (page, element) => {
    if (element) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        element.classList.add('active');
    }
    activePage = page;
    window.renderCurrentPage();
};

function chip(kind, value, label) {
    const active = (kind === 'mode' ? currentModeFilter : currentStatusFilter) === value ? 'active' : '';
    const fn = kind === 'mode' ? 'setModeFilter' : 'setStatusFilter';
    return `<div class="chip ${active} ${kind}-chip" onclick="window.${fn}('${value}', this)">${label}</div>`;
}

window.renderCurrentPage = () => {
    const content = $('content');
    if (!content) return;

    if (activePage === 'Home') {
        content.innerHTML = `
            <div class="search-box">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="searchInput" placeholder="Search tournaments..." value="${esc(searchText)}" oninput="window.onSearchInput(this.value)">
            </div>
            <div class="filter-chips">
                ${chip('mode', 'ALL', 'All Modes')}
                ${chip('mode', 'SOLO', 'Solo')}
                ${chip('mode', 'DUO', 'Duo')}
                ${chip('mode', 'SQUAD', 'Squad')}
                ${chip('mode', 'CS', 'Clash Squad')}
            </div>
            <div class="filter-chips status-chips">
                ${chip('status', 'ALL', 'All Matches')}
                ${chip('status', 'JOINED', '⚔️ Joined Matches')}
                ${chip('status', 'UPCOMING', 'Upcoming')}
                ${chip('status', 'LIVE', 'Live')}
                ${chip('status', 'COMPLETED', 'Completed')}
            </div>
            <div class="section-title"><i class="fa-solid fa-fire"></i> Available Arena Matches</div>
            <div id="tourneys"></div>
        `;
        window.renderTournaments();

    } else if (activePage === 'Leaderboard') {
        renderLeaderboard(content);

    } else if (activePage === 'Wallet') {
        content.innerHTML = `
            <div class="section-title"><i class="fa-solid fa-wallet"></i> My Wallet</div>
            <div class="card" style="text-align:center; padding:25px 20px;">
                <span style="color:var(--text-muted); font-size:11px; text-transform:uppercase;">Total Available Balance</span>
                <h1 id="totalVal" style="font-size:36px; margin:8px 0;">${fmtINR(wallet.total)}</h1>
                <div class="wallet-stats-grid">
                    <div class="wallet-stat-card">
                        <span>Deposit Cash</span>
                        <h3 id="depositVal">${fmtINR(wallet.dep)}</h3>
                    </div>
                    <div class="wallet-stat-card">
                        <span>Winnings</span>
                        <h3 id="winningVal" style="color:var(--green-glow);">${fmtINR(wallet.win)}</h3>
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button class="btn-primary" onclick="window.openDepositModal()">Deposit</button>
                    <button class="btn-secondary" onclick="window.openWithdrawModal()">Withdraw</button>
                </div>
                <p style="font-size:10px; color:var(--text-muted); margin-top:12px;">Withdrawal sirf Winnings balance se hota hai.</p>
            </div>
        `;

    } else if (activePage === 'Profile') {
        if (!currentUser) renderAuthScreen(content);
        else renderProfile(content);
    }
    updateWalletUI();
};

function renderAuthScreen(container) {
    container.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-lock"></i> User Authentication</div>
        <div class="card" style="padding:20px;">
            <div class="form-group">
                <label>Email Address</label>
                <input type="email" id="authEmail" placeholder="Enter your email" autocomplete="email">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="authPassword" placeholder="••••••••" autocomplete="current-password">
            </div>
            <button class="btn-primary" onclick="window.handleEmailLogin()">Sign In</button>
            <button class="btn-secondary" style="width:100%; margin-top:8px;" onclick="window.handleEmailSignup()">Create Account</button>
            <div style="text-align:center; font-size:11px; color:var(--text-muted); margin:10px 0;">OR</div>
            <button class="btn-primary btn-google" onclick="window.handleGoogleLogin()">
                <i class="fa-brands fa-google" style="color:#4285F4;"></i> Sign In with Google
            </button>
        </div>
    `;
}

function renderProfile(container) {
    const name = esc(profile.name || currentUser.displayName || 'Gamer User');
    const mobile = esc(profile.mobileNumber || '');
    const photo = profile.photoURL ? esc(profile.photoURL + photoBust) : '';

    container.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-user"></i> My Profile</div>
        <div class="card profile-edit-card">
            <div class="profile-avatar-wrap" id="profileAvatarWrap">
                ${photo
                    ? `<img id="profilePhotoPreview" class="profile-avatar" src="${photo}" alt="Profile Photo">`
                    : `<div class="profile-avatar" style="display:flex;align-items:center;justify-content:center;">
                           <i class="fa-solid fa-user" style="font-size:42px;color:var(--accent-orange);"></i>
                       </div>`}
            </div>

            <label class="profile-file-label" for="profilePhotoInput">
                <i class="fa-solid fa-camera"></i> Choose Profile Photo
            </label>
            <input type="file" id="profilePhotoInput" accept="image/png,image/jpeg,image/webp"
                   style="display:none" onchange="window.previewProfilePhoto(this)">
            <div style="font-size:10px;color:var(--text-muted);text-align:center;margin:-2px 0 12px;">
                JPG, PNG or WEBP • Max 5MB
            </div>

            <div class="form-group">
                <label>Name</label>
                <input type="text" id="profileNameInput" value="${name}" maxlength="40" placeholder="Enter your name">
            </div>
            <div class="form-group">
                <label>Mobile Number</label>
                <input type="tel" id="profileMobileInput" value="${mobile}" maxlength="14" placeholder="10-digit mobile number">
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" value="${esc(currentUser.email || '')}" readonly>
            </div>

            <button id="saveProfileBtn" class="btn-primary" onclick="window.saveUserProfile()">Save Profile</button>
            <button class="btn-primary btn-logout" onclick="window.handleLogout()">Logout Account</button>
        </div>
    `;
}

/* ==========================================================================
   PROFILE
   ========================================================================== */
window.previewProfilePhoto = (input) => {
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        notifyError('Please select an image file.');
        input.value = '';
        return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        notifyError('Profile photo 5MB ya usse chhoti honi chahiye.');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        let img = $('profilePhotoPreview');
        if (!img) {
            const wrap = $('profileAvatarWrap');
            if (!wrap) return;
            wrap.innerHTML = `<img id="profilePhotoPreview" class="profile-avatar" alt="Profile Photo">`;
            img = $('profilePhotoPreview');
        }
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

window.saveUserProfile = async () => {
    if (!currentUser) return;

    const name = ($('profileNameInput')?.value || '').trim();
    const mobileNumber = ($('profileMobileInput')?.value || '').trim();
    const file = $('profilePhotoInput')?.files?.[0];
    const saveBtn = $('saveProfileBtn');

    if (!name) return notifyError('Apna naam enter karein.');
    if (mobileNumber && !/^(?:\+91[\s-]?)?[6-9]\d{9}$/.test(mobileNumber)) {
        return notifyError('Valid 10-digit Indian mobile number enter karein.');
    }

    try {
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        let photoURL = profile.photoURL || '';
        if (file) {
            if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
            if (file.size > MAX_UPLOAD_BYTES) throw new Error('Profile photo 5MB ya usse chhoti honi chahiye.');

            if (saveBtn) saveBtn.textContent = 'Uploading Photo...';
            const photoRef = ref(storage, `profilePhotos/${currentUser.uid}/profile`);
            await uploadBytes(photoRef, file, { contentType: file.type, cacheControl: 'public,max-age=3600' });
            photoURL = await getDownloadURL(photoRef);
            photoBust = `&v=${Date.now()}`;
        }

        await setDoc(doc(db, 'users', currentUser.uid), {
            name, mobileNumber, photoURL,
            email: currentUser.email || '',
            updatedAt: serverTimestamp()
        }, { merge: true });

        profile = { name, mobileNumber, photoURL };
        toast('Profile Updated!');
        window.renderCurrentPage();
    } catch (err) {
        console.error('Profile save error:', err);
        notifyError('Profile update failed: ' + err.message);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Profile'; }
    }
};

/* ==========================================================================
   LIVE DATA: ANNOUNCEMENTS + TOURNAMENTS (subscribed once)
   ========================================================================== */
function listenToAnnouncements() {
    onSnapshot(collection(db, 'announcements'), (snapshot) => {
        const ticker = $('tickerContent');
        if (!ticker) return;

        const messages = snapshot.docs.map(d => d.data().text).filter(Boolean);
        if (messages.length) {
            ticker.innerHTML = messages.map(m => `🔥 ${esc(m)}`)
                .join(' &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ');
        } else {
            ticker.textContent = '🔥 Booyah HUB me aapka swagat hai! Matches join karein aur prizes jeetein!';
        }
    }, (err) => console.error('Announcements error:', err));
}

function listenToTournaments() {
    onSnapshot(collection(db, 'tournaments'), (snapshot) => {
        tournamentsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        window.renderTournaments();
    }, (err) => {
        console.error('Tournaments error:', err);
        const list = $('tourneys');
        if (list) list.innerHTML = `<div class="card" style="text-align:center;padding:20px;color:var(--text-muted);">Matches load nahi ho paye. Internet check karein.</div>`;
    });
}

/* ==========================================================================
   TOURNAMENT LIST
   ========================================================================== */
window.setModeFilter = (mode, el) => {
    document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
    el?.classList.add('active');
    currentModeFilter = mode;
    window.renderTournaments();
};

window.setStatusFilter = (status, el) => {
    document.querySelectorAll('.status-chip').forEach(c => c.classList.remove('active'));
    el?.classList.add('active');
    currentStatusFilter = status;
    window.renderTournaments();
};

let searchTimer;
window.onSearchInput = (value) => {
    searchText = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => window.renderTournaments(), 200);
};

const STATUS_RANK = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };

function sortTournaments(a, b) {
    const ra = STATUS_RANK[statusOf(a)] ?? 1;
    const rb = STATUS_RANK[statusOf(b)] ?? 1;
    if (ra !== rb) return ra - rb;
    const ta = toMillis(a.startTime) ?? 0;
    const tb = toMillis(b.startTime) ?? 0;
    return statusOf(a) === 'COMPLETED' ? tb - ta : ta - tb;
}

function buildRoomBox(t) {
    return `
        <div class="room-box" data-action="noop">
            <div class="room-row">
                <span>Room ID: <strong style="color:var(--green-glow);">${esc(t.roomId)}</strong></span>
                <button class="copy-btn" data-action="copy" data-label="Room ID" data-value="${esc(t.roomId)}"><i class="fa-regular fa-copy"></i> Copy</button>
            </div>
            <div class="room-row">
                <span>Password: <strong style="color:var(--green-glow);">${esc(t.roomPass || 'N/A')}</strong></span>
                <button class="copy-btn" data-action="copy" data-label="Password" data-value="${esc(t.roomPass || '')}"><i class="fa-regular fa-copy"></i> Copy</button>
            </div>
        </div>`;
}

function buildActionButton(t, isJoined, status, joined, total) {
    if (isJoined) {
        if (status === 'LIVE' || status === 'COMPLETED') {
            return `<button class="btn-primary btn-success" data-action="result" data-id="${esc(t.id)}"><i class="fa-solid fa-trophy"></i> Upload Result / Screenshot</button>`;
        }
        return `<button class="btn-primary" style="background:#222;border:1px solid var(--green-glow);color:var(--green-glow);" disabled><i class="fa-solid fa-circle-check"></i> Registered</button>`;
    }
    if (status === 'COMPLETED') return `<button class="btn-primary" disabled style="opacity:.5">Match Finished</button>`;
    if (status === 'LIVE') return `<button class="btn-primary" disabled style="opacity:.5">Match Live - Registration Closed</button>`;
    if (joined >= total) return `<button class="btn-primary" disabled style="opacity:.5">Match Full</button>`;
    return `<button class="btn-primary" data-action="join" data-id="${esc(t.id)}">Join Match</button>`;
}

window.renderTournaments = () => {
    const list = $('tourneys');
    if (!list) return;

    const q = searchText.toLowerCase().trim();
    const filtered = tournamentsData.filter(t => {
        const isJoined = joinedMatchIds.has(t.id);
        const modeOk = currentModeFilter === 'ALL' || (t.mode || '').toUpperCase() === currentModeFilter;
        let statusOk = true;
        if (currentStatusFilter === 'JOINED') statusOk = isJoined;
        else if (currentStatusFilter !== 'ALL') statusOk = statusOf(t) === currentStatusFilter;
        const searchOk = !q || (t.name || '').toLowerCase().includes(q);
        return modeOk && statusOk && searchOk;
    }).sort(sortTournaments);

    if (!filtered.length) {
        list.innerHTML = `<div class="card" style="text-align:center;padding:20px;color:var(--text-muted);">No matches found.</div>`;
        return;
    }

    list.innerHTML = filtered.map(t => {
        const total = num(t.totalSlots, 48) || 48;
        const joined = num(t.joinedSlots);
        const percent = Math.min(100, Math.round((joined / total) * 100));
        const status = statusOf(t);
        const isJoined = joinedMatchIds.has(t.id);
        const isAlmostFull = (total - joined <= 5) && joined < total;
        const badgeClass = status === 'LIVE' ? 'badge-live' : status === 'COMPLETED' ? 'badge-completed' : 'badge-upcoming';
        const start = toMillis(t.startTime);
        const showRoom = isJoined && t.roomId;

        return `
            <div class="card" data-action="details" data-id="${esc(t.id)}" style="cursor:pointer;">
                <img src="${esc(t.banner || DEFAULT_BANNER)}" class="card-banner" alt="Match Banner" loading="lazy">
                <div class="card-body">
                    <div class="card-header">
                        <div class="card-title">${esc(t.name)}</div>
                        <span class="badge-status ${badgeClass}">${esc(status)}</span>
                    </div>

                    <div class="countdown-hud" ${start ? `data-start="${start}"` : ''}>
                        <i class="fa-solid fa-stopwatch"></i>
                        <div class="time-box"><span class="time-num">00</span><span class="time-label">HRS</span></div>
                        <span class="time-sep">:</span>
                        <div class="time-box"><span class="time-num">00</span><span class="time-label">MIN</span></div>
                        <span class="time-sep">:</span>
                        <div class="time-box"><span class="time-num">00</span><span class="time-label">SEC</span></div>
                    </div>

                    <div class="card-details">
                        <div class="detail-item"><span>Prize</span><strong>₹${esc(num(t.prize))}</strong></div>
                        <div class="detail-item"><span>Entry</span><strong>₹${esc(num(t.entry))}</strong></div>
                        <div class="detail-item"><span>Mode</span><strong>${esc(t.mode)}</strong></div>
                    </div>

                    ${showRoom ? buildRoomBox(t) : ''}

                    <div class="slot-tracker">
                        <div class="slot-info">
                            <span>Slots Filled ${isAlmostFull ? '<span class="badge-almost-full">🔥 ALMOST FULL!</span>' : ''}</span>
                            <span>${joined}/${total}</span>
                        </div>
                        <div class="progress-bg">
                            <div class="progress-fill ${percent > 75 ? 'hot' : ''}" style="width:${percent}%;"></div>
                        </div>
                    </div>

                    ${buildActionButton(t, isJoined, status, joined, total)}
                </div>
            </div>`;
    }).join('');

    tickCountdowns();
};

// One shared timer for every countdown on screen (no per-card intervals to leak)
function tickCountdowns() {
    const now = Date.now();
    document.querySelectorAll('.countdown-hud[data-start]').forEach(hud => {
        const diff = Math.max(0, Number(hud.dataset.start) - now);
        const parts = [
            Math.floor(diff / 3600000),
            Math.floor((diff % 3600000) / 60000),
            Math.floor((diff % 60000) / 1000)
        ];
        hud.querySelectorAll('.time-num').forEach((el, i) => {
            el.textContent = String(parts[i]).padStart(2, '0');
        });
    });
}
setInterval(tickCountdowns, 1000);

/* ==========================================================================
   CLICK DELEGATION (replaces inline onclick with interpolated strings)
   ========================================================================== */
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id, value, label } = el.dataset;

    switch (action) {
        case 'details': window.openDetailsModal(id); break;
        case 'join': window.openModal(id); break;
        case 'result': window.openResultModal(id); break;
        case 'copy': window.copyToClipboard(value, label); break;
        default: break; // 'noop'
    }
});

/* ==========================================================================
   DETAILS + JOIN MODALS
   ========================================================================== */
window.openDetailsModal = (matchId) => {
    const t = tournamentsData.find(x => x.id === matchId);
    if (!t) return;

    $('detTitle').textContent = t.name || 'Match Details';
    $('detBanner').src = t.banner || DEFAULT_BANNER;
    $('detPrize').textContent = `₹${num(t.prize)}`;
    $('detEntry').textContent = `₹${num(t.entry)}`;
    $('detMode').textContent = `${t.mode || 'SOLO'} | ${(t.map || 'Bermuda').toUpperCase()}`;

    const total = num(t.totalSlots, 48) || 48;
    const joined = num(t.joinedSlots);
    $('detSlotText').textContent = `${joined}/${total} Seats Filled`;

    $('seatsGrid').innerHTML = Array.from({ length: total }, (_, i) =>
        `<div class="seat-dot ${i + 1 <= joined ? 'filled' : ''}">${i + 1}</div>`
    ).join('');

    const prize = num(t.prize);
    $('payout1').textContent = `₹${Math.round(prize * 0.5)}`;
    $('payout2').textContent = `₹${Math.round(prize * 0.25)}`;
    $('payoutKill').textContent = `₹${num(t.perKill, 10)} / Kill`;

    const btn = $('detJoinBtn');
    const status = statusOf(t);
    const isJoined = joinedMatchIds.has(t.id);
    if (isJoined) { btn.textContent = 'Already Registered'; btn.disabled = true; }
    else if (status !== 'UPCOMING') { btn.textContent = 'Registration Closed'; btn.disabled = true; }
    else if (joined >= total) { btn.textContent = 'Match Full'; btn.disabled = true; }
    else { btn.textContent = 'Register Now'; btn.disabled = false; }

    btn.onclick = () => {
        window.closeModal('detailsModal');
        window.openModal(t.id);
    };

    $('detailsModal').classList.add('active');
};

window.openModal = (matchId) => {
    if (!currentUser) {
        notifyError('Tournament join karne ke liye pehle login karein!');
        activePage = 'Profile';
        document.querySelectorAll('.nav-btn').forEach((b, i) => b.classList.toggle('active', i === 3));
        window.renderCurrentPage();
        return;
    }

    const t = tournamentsData.find(x => x.id === matchId);
    if (!t) return notifyError('Match nahi mila.');

    currentMatchToJoin = matchId;
    selectedMatchMode = (t.mode || 'SOLO').toUpperCase();

    $('modalMatchTitle').textContent = t.name || 'Match Registration';
    $('modalMatchMode').textContent = `MODE: ${selectedMatchMode} • ENTRY ₹${num(t.entry)}`;

    const count = playersFor(selectedMatchMode);
    $('dynamicFormContainer').innerHTML = Array.from({ length: count }, (_, k) => {
        const i = k + 1;
        return `
            <div class="player-form-block">
                <h4>Player ${i} Details</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>In-Game Name (IGN)</label>
                        <input type="text" id="p_ign_${i}" maxlength="30" placeholder="e.g. OP_Gamer${i}">
                    </div>
                    <div class="form-group">
                        <label>Game UID</label>
                        <input type="text" inputmode="numeric" id="p_uid_${i}" maxlength="15" placeholder="e.g. 1029384${i}">
                    </div>
                </div>
            </div>`;
    }).join('');

    $('joinModal').classList.add('active');
};

window.confirmJoin = async () => {
    if (isJoining) return;
    if (!currentUser) return notifyError('Pehle login karein!');

    const matchId = currentMatchToJoin;
    const preview = tournamentsData.find(t => t.id === matchId);
    if (!preview) return notifyError('Match nahi mila.');

    // Friendly early check (the real check happens inside the transaction)
    if (wallet.total < num(preview.entry)) {
        window.closeModal('joinModal');
        notifyError('Wallet me sufficient balance nahi hai. Pehle deposit karein.');
        return window.openDepositModal();
    }

    const count = playersFor(selectedMatchMode);
    const players = [];
    const seenUids = new Set();
    for (let i = 1; i <= count; i++) {
        const ign = ($(`p_ign_${i}`)?.value || '').trim();
        const uid = ($(`p_uid_${i}`)?.value || '').trim();
        if (!ign || !uid) return notifyError(`Player ${i} ki IGN aur UID enter karein.`);
        if (!/^\d{5,15}$/.test(uid)) return notifyError(`Player ${i} ki UID sirf numbers (5-15 digits) honi chahiye.`);
        if (seenUids.has(uid)) return notifyError('Ek hi UID do baar use nahi ho sakti.');
        seenUids.add(uid);
        players.push({ ign, uid });
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const tourneyRef = doc(db, 'tournaments', matchId);
    const regRef = doc(db, 'registrations', `${matchId}_${currentUser.uid}`); // one entry per user per match

    isJoining = true;
    try {
        await runTransaction(db, async (tx) => {
            const [userSnap, tourneySnap, regSnap] = await Promise.all([
                tx.get(userRef), tx.get(tourneyRef), tx.get(regRef)
            ]);

            if (!userSnap.exists() || !tourneySnap.exists()) throw new Error('Match ya User data nahi mila!');
            if (regSnap.exists()) throw new Error('Aap is match me pehle se registered hain.');

            const t = tourneySnap.data();
            if (statusOf(t) !== 'UPCOMING') throw new Error('Is match ki registration band ho chuki hai.');

            const totalSlots = num(t.totalSlots, 48) || 48;
            const joined = num(t.joinedSlots);
            if (joined + 1 > totalSlots) throw new Error('Match full ho chuka hai.');

            // Entry fee always comes from the database, never from the page
            const entry = money(t.entry);
            let { dep, win } = getBalances(userSnap.data());
            if (dep + win < entry) throw new Error('Wallet me sufficient balance nahi hai. Pehle deposit karein.');

            // Spend deposit cash first, then winnings
            let remaining = entry;
            const fromDep = Math.min(dep, remaining);
            dep = money(dep - fromDep);
            remaining = money(remaining - fromDep);
            win = money(win - remaining);

            tx.update(userRef, { depositBalance: dep, winningBalance: win });
            tx.update(tourneyRef, { joinedSlots: joined + 1 });
            tx.set(regRef, {
                tournamentId: matchId,
                userId: currentUser.uid,
                userEmail: currentUser.email || '',
                matchMode: selectedMatchMode,
                teamSize: count,
                entryPaid: entry,
                players,
                joinedAt: serverTimestamp()
            });
        });

        window.closeModal('joinModal');
        toast('Successfully Registered!');
    } catch (err) {
        console.error('Join failed:', err);
        notifyError(err.message || 'Registration failed.');
    } finally {
        isJoining = false;
    }
};

/* ==========================================================================
   DEPOSIT (manual UPI + UTR verification by admin)
   ========================================================================== */
async function fetchUpiId() {
    try {
        const snap = await getDoc(doc(db, 'system_settings', 'payment_info'));
        return snap.exists() ? (snap.data().upiId || '').trim() : '';
    } catch (err) {
        console.error('UPI fetch error:', err);
        return '';
    }
}

window.openDepositModal = async () => {
    if (!currentUser) return notifyError('Pehle login karein!');
    const upi = await fetchUpiId();
    if (!upi) return notifyError('Deposit abhi available nahi hai. Thodi der baad try karein.');
    $('depositModal').classList.add('active');
};

window.startDirectUpiPayment = async () => {
    const amount = money($('depositAmountInput')?.value);
    if (!amount || amount < 10) return notifyError('Kam se kam ₹10 enter karo!');
    if (amount > 50000) return notifyError('Ek baar me maximum ₹50,000 deposit kar sakte hain.');

    const upi = await fetchUpiId();
    if (!upi) return notifyError('Payment details load nahi hui. Dobara try karein.');

    pendingDepositAmount = amount;
    const link = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent('Booyah HUB Esports')}` +
                 `&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('BooyahHub Deposit')}`;

    window.closeModal('depositModal');
    window.location.href = link;
    setTimeout(() => $('verifyUpiModal')?.classList.add('active'), 1200);
};

window.submitUpiVerification = async () => {
    if (isSubmittingDeposit) return;
    if (!currentUser) return notifyError('Pehle login karein!');
    if (!pendingDepositAmount) return notifyError('Pehle deposit amount select karein.');

    const utr = ($('upiUtrInput')?.value || '').trim();
    if (!/^\d{12}$/.test(utr)) return notifyError('Sahi 12-digit UTR / Ref Number enter karein.');

    isSubmittingDeposit = true;
    try {
        // UTR is the document id, so the same UTR can never be submitted twice
        await setDoc(doc(db, 'deposit_requests', utr), {
            userId: currentUser.uid,
            userEmail: currentUser.email || '',
            amount: pendingDepositAmount,
            utrNumber: utr,
            status: 'PENDING',
            createdAt: serverTimestamp()
        });

        window.closeModal('verifyUpiModal');
        $('upiUtrInput').value = '';
        $('depositAmountInput').value = '';
        pendingDepositAmount = 0;
        toast('Deposit request submit ho gayi! Admin verify karke balance add karega.');
    } catch (err) {
        console.error('Deposit submit failed:', err);
        notifyError(err.code === 'permission-denied'
            ? 'Ye UTR pehle se submit ho chuka hai.'
            : 'Submission error: ' + err.message);
    } finally {
        isSubmittingDeposit = false;
    }
};

/* ==========================================================================
   WITHDRAW (winnings only; balance is locked immediately inside a transaction)
   ========================================================================== */
window.openWithdrawModal = () => {
    if (!currentUser) return notifyError('Pehle login karein!');
    $('withdrawModal').classList.add('active');
};

window.handleWithdrawMethodChange = () => {
    const isUpi = $('withdrawMethodSelect').value === 'UPI';
    $('withdrawUpiFields').style.display = isUpi ? 'block' : 'none';
    $('withdrawBankFields').style.display = isUpi ? 'none' : 'block';
};

window.submitWithdrawalRequest = async () => {
    if (isSubmittingWithdraw) return;
    if (!currentUser) return notifyError('Pehle login karein!');

    const amount = money($('withdrawAmountInput')?.value);
    const method = $('withdrawMethodSelect').value;

    if (!amount || amount < 50) return notifyError('Minimum withdrawal ₹50 hai!');

    let paymentDetails;
    if (method === 'UPI') {
        const upiId = ($('withdrawUpiId')?.value || '').trim();
        if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) return notifyError('Valid UPI ID enter karein (e.g. name@upi).');
        paymentDetails = { upiId };
    } else {
        const bankName = ($('withdrawBankName')?.value || '').trim();
        const accNo = ($('withdrawAccNo')?.value || '').trim();
        const ifsc = ($('withdrawIfsc')?.value || '').trim().toUpperCase();
        if (!bankName || !accNo || !ifsc) return notifyError('Poori bank details bharein.');
        if (!/^\d{9,18}$/.test(accNo)) return notifyError('Account number 9-18 digits ka hona chahiye.');
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return notifyError('Valid IFSC code enter karein.');
        paymentDetails = { bankName, accNo, ifsc };
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const reqRef = doc(collection(db, 'withdrawal_requests'));

    isSubmittingWithdraw = true;
    try {
        await runTransaction(db, async (tx) => {
            const userSnap = await tx.get(userRef);
            if (!userSnap.exists()) throw new Error('User account nahi mila!');

            const { dep, win } = getBalances(userSnap.data());
            if (win < amount) throw new Error('Aapke paas sufficient Winning Balance nahi hai!');

            tx.update(userRef, { depositBalance: dep, winningBalance: money(win - amount) });
            tx.set(reqRef, {
                userId: currentUser.uid,
                userEmail: currentUser.email || '',
                amount,
                method,
                paymentDetails,
                status: 'PENDING',
                createdAt: serverTimestamp()
            });
        });

        window.closeModal('withdrawModal');
        ['withdrawAmountInput', 'withdrawUpiId', 'withdrawBankName', 'withdrawAccNo', 'withdrawIfsc']
            .forEach(id => { if ($(id)) $(id).value = ''; });
        toast('Withdrawal request submit ho gayi!');
    } catch (err) {
        console.error('Withdraw failed:', err);
        notifyError(err.message || 'Withdrawal failed.');
    } finally {
        isSubmittingWithdraw = false;
    }
};

/* ==========================================================================
   RESULT SCREENSHOT UPLOAD
   ========================================================================== */
window.openResultModal = (matchId) => {
    if (!currentUser) return notifyError('Pehle login karein!');
    const t = tournamentsData.find(x => x.id === matchId);
    selectedResultMatchId = matchId;
    selectedResultFile = null;
    $('resultRoomId').value = (t && t.roomId) || matchId;
    $('fileSelectedName').textContent = '';
    if ($('ssFile')) $('ssFile').value = '';
    $('resultModal').classList.add('active');
};

window.handleFileSelect = (input) => {
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        input.value = '';
        return notifyError('Sirf image file (PNG/JPG) select karein.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        input.value = '';
        return notifyError('Screenshot 5MB se chhota hona chahiye.');
    }
    selectedResultFile = file;
    $('fileSelectedName').textContent = `Selected: ${file.name}`;
};

window.submitResult = async () => {
    if (isSubmittingResult) return;
    if (!currentUser) return notifyError('Pehle login karein!');
    if (!selectedResultFile) return notifyError('Pehle screenshot select karein!');
    if (!joinedMatchIds.has(selectedResultMatchId)) return notifyError('Aap is match me registered nahi hain.');

    isSubmittingResult = true;
    try {
        toast('Uploading Screenshot...');
        const matchId = selectedResultMatchId;
        const fileRef = ref(storage, `results/${currentUser.uid}/${matchId}_${Date.now()}`);
        const uploaded = await uploadBytes(fileRef, selectedResultFile, { contentType: selectedResultFile.type });
        const screenshotUrl = await getDownloadURL(uploaded.ref);

        // One result per user per match (a REJECTED one can be re-submitted - see firestore.rules)
        await setDoc(doc(db, 'results', `${matchId}_${currentUser.uid}`), {
            tournamentId: matchId,
            userId: currentUser.uid,
            userEmail: currentUser.email || '',
            screenshotUrl,
            status: 'PENDING',
            submittedAt: serverTimestamp()
        });

        window.closeModal('resultModal');
        toast('Result Submitted Successfully!');
    } catch (err) {
        console.error('Result submit failed:', err);
        notifyError(err.code === 'permission-denied'
            ? 'Is match ka result pehle se submit ho chuka hai.'
            : 'Screenshot upload failed: ' + err.message);
    } finally {
        isSubmittingResult = false;
    }
};

/* ==========================================================================
   LEADERBOARD (built from the `winners` collection written when admin pays a prize)
   ========================================================================== */
async function renderLeaderboard(content) {
    content.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-trophy"></i> Top Arena Players</div>
        <div class="card" style="padding:15px;" id="leaderboardBox">
            <div style="color:var(--text-muted);font-size:12px;text-align:center;">Loading winners...</div>
        </div>`;

    try {
        const snap = await getDocs(query(collection(db, 'winners'), orderBy('createdAt', 'desc'), limit(300)));
        if (activePage !== 'Leaderboard') return;
        const box = $('leaderboardBox');
        if (!box) return;

        const totals = new Map();
        snap.forEach(d => {
            const w = d.data();
            const cur = totals.get(w.userId) || { name: w.name || 'Player', wins: 0, amount: 0 };
            cur.wins += 1;
            cur.amount += num(w.amount);
            totals.set(w.userId, cur);
        });

        const top = [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, 10);
        if (!top.length) {
            box.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center;">Abhi tak koi winner nahi. Pehle match jeetne wale aap ban sakte hain! 🏆</div>`;
            return;
        }

        box.innerHTML = top.map((p, i) => `
            <div class="list-item">
                <div><strong>#${i + 1}. ${esc(p.name)}</strong><br>
                    <span style="font-size:11px;color:var(--text-muted)">${p.wins} Win${p.wins > 1 ? 's' : ''}</span></div>
                <span style="color:var(--accent-orange);font-weight:700;">₹${p.amount.toLocaleString('en-IN')} Won</span>
            </div>`).join('');
    } catch (err) {
        console.error('Leaderboard error:', err);
        const box = $('leaderboardBox');
        if (box) box.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center;">Leaderboard load nahi ho paya.</div>`;
    }
}

/* ==========================================================================
   BOOT
   ========================================================================== */
listenToAnnouncements();
listenToTournaments();
window.renderCurrentPage();
