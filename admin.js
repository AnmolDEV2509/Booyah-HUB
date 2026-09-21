// admin.js - Super Admin panel (admin.html)
import { db, auth, SUPER_ADMIN_EMAIL } from "./firebase-config.js";
import {
    collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, getDocs,
    query, where, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    esc, money, num, getBalances, isValidEmail, debounce, toast, notifyError, authErrorMessage
} from "./utils.js";
import { setupAnnouncements, setupTournaments, setupResults } from "./admin-common.js";

const $ = (id) => document.getElementById(id);
const isSuperAdmin = (user) =>
    !!user?.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
const reviewer = () => ({ reviewedBy: auth.currentUser?.email || 'admin', reviewedAt: serverTimestamp() });

/* ==========================================================================
   LOGIN / LOGOUT
   ========================================================================== */
window.adminLogin = async () => {
    const email = ($('adminAuthEmail')?.value || '').trim();
    const pass = $('adminAuthPassword')?.value || '';
    const btn = $('adminLoginBtn');

    if (!email || !pass) return notifyError('Email aur Password dono fill karein!');

    const original = btn?.innerHTML;
    if (btn) { btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`; btn.disabled = true; }

    try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        if (!isSuperAdmin(cred.user)) {
            notifyError(`Access Denied! ${cred.user.email} Super Admin nahi hai.`);
            await signOut(auth);
        }
        // success is handled by onAuthStateChanged below
    } catch (e) {
        console.error('Login Error:', e);
        notifyError(authErrorMessage(e));
    } finally {
        if (btn) { btn.innerHTML = original; btn.disabled = false; }
    }
};

window.adminLogout = async () => {
    await signOut(auth);
    location.reload();
};

/* ==========================================================================
   AUTH STATE (panels are initialised exactly once)
   ========================================================================== */
let panelsStarted = false;

onAuthStateChanged(auth, (user) => {
    const overlay = $('authOverlay');
    if (isSuperAdmin(user)) {
        if (overlay) overlay.style.display = 'none';
        if (!panelsStarted) {
            panelsStarted = true;
            startPanels();
        }
    } else if (overlay) {
        overlay.style.display = 'flex';
    }
});

function startPanels() {
    loadPaymentSettings();
    listenSubAdmins();
    loadUsers();
    listenWithdrawalRequests();
    listenDepositRequests();
    setupAnnouncements();
    setupTournaments({ canKick: true, canRefund: true });
    setupResults({ canPay: true });
}

/* ==========================================================================
   PAYMENT SETTINGS
   ========================================================================== */
async function loadPaymentSettings() {
    try {
        const snap = await getDoc(doc(db, 'system_settings', 'payment_info'));
        if (!snap.exists()) return;
        const data = snap.data();
        if ($('adminUpiId')) $('adminUpiId').value = data.upiId || '';
        if ($('adminQrUrl')) $('adminQrUrl').value = data.qrCodeUrl || '';
    } catch (e) {
        console.error('Error loading payment settings:', e);
    }
}

window.savePaymentSettings = async () => {
    const upiId = ($('adminUpiId')?.value || '').trim();
    const qrCodeUrl = ($('adminQrUrl')?.value || '').trim();

    if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) return notifyError('Valid UPI ID enter karein (e.g. name@okaxis).');
    if (qrCodeUrl && !/^https?:\/\//i.test(qrCodeUrl)) return notifyError('QR link http(s) se start hona chahiye.');

    try {
        await setDoc(doc(db, 'system_settings', 'payment_info'), {
            upiId, qrCodeUrl, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || ''
        });
        toast('Banking UPI Details Updated!');
    } catch (e) {
        notifyError('Error updating UPI settings: ' + e.message);
    }
};

/* ==========================================================================
   USER WALLETS (fetched once - not a live listener - to keep reads low)
   ========================================================================== */
let usersCache = [];
const MAX_USERS_SHOWN = 50;

async function loadUsers() {
    const container = $('adminUsersWalletList');
    if (container) container.innerHTML = 'Loading users...';
    try {
        const snap = await getDocs(collection(db, 'users'));
        usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderUsers();
    } catch (e) {
        console.error('Users load error:', e);
        if (container) container.innerHTML = `<div style="color:var(--accent-red); font-size:12px;">Users load nahi hue: ${esc(e.message)}</div>`;
    }
}
window.refreshUsers = loadUsers;

function renderUsers() {
    const container = $('adminUsersWalletList');
    if (!container) return;

    const q = ($('userWalletSearch')?.value || '').toLowerCase().trim();
    const matches = usersCache.filter(u =>
        !q || (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q) || u.id.toLowerCase().includes(q));

    if (!matches.length) {
        container.innerHTML = `<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:10px;">Koi user nahi mila.</div>`;
        return;
    }

    const shown = matches.slice(0, MAX_USERS_SHOWN);
    container.innerHTML = shown.map(u => {
        const { dep, win } = getBalances(u);
        return `
            <div class="user-wallet-card" data-uid="${esc(u.id)}">
                <div class="user-wallet-header">
                    <div>
                        <strong style="color:var(--text-main);">${esc(u.email || 'No Email')}</strong>
                        ${u.name ? `<span style="font-size:11px; color:var(--text-muted);"> (${esc(u.name)})</span>` : ''}
                        <br><span style="font-size:10px; color:var(--text-muted);">UID: ${esc(u.id)}</span>
                    </div>
                </div>
                <div class="edit-grid" style="margin-top:0;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Deposit Balance (₹)</label>
                        <input type="number" step="0.01" min="0" name="dep" value="${dep}" data-orig="${dep}">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Winning Balance (₹)</label>
                        <input type="number" step="0.01" min="0" name="win" value="${win}" data-orig="${win}">
                    </div>
                </div>
                <button class="btn btn-primary" style="padding:6px; font-size:11px; margin-top:8px;" data-action="save-wallet">
                    <i class="fa-solid fa-floppy-disk"></i> Update Wallet
                </button>
            </div>`;
    }).join('');

    if (matches.length > MAX_USERS_SHOWN) {
        container.insertAdjacentHTML('beforeend',
            `<div style="grid-column:1/-1; font-size:11px; color:var(--text-muted); text-align:center;">
                Pehle ${MAX_USERS_SHOWN} of ${matches.length} users dikh rahe hain. Search se filter karein.</div>`);
    }
}

window.filterUsersList = debounce(renderUsers, 200);

$('adminUsersWalletList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="save-wallet"]');
    if (!btn) return;

    const card = btn.closest('[data-uid]');
    const uid = card.dataset.uid;
    const depInput = card.querySelector('[name="dep"]');
    const winInput = card.querySelector('[name="win"]');

    // Only fields the admin actually edited are written. This stops a stale form
    // from overwriting a balance that changed meanwhile (deposit approved, prize paid...).
    const depChanged = depInput.value !== '' && money(depInput.value) !== money(depInput.dataset.orig);
    const winChanged = winInput.value !== '' && money(winInput.value) !== money(winInput.dataset.orig);
    if (!depChanged && !winChanged) return toast('Koi change nahi kiya.');

    const newDep = money(depInput.value);
    const newWin = money(winInput.value);
    if ((depChanged && !(newDep >= 0)) || (winChanged && !(newWin >= 0))) {
        return notifyError('Valid (0 ya usse zyada) amount enter karein!');
    }

    const userRef = doc(db, 'users', uid);
    btn.disabled = true;
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(userRef);
            if (!snap.exists()) throw new Error('User document nahi mila.');
            const before = getBalances(snap.data());
            const after = { dep: depChanged ? newDep : before.dep, win: winChanged ? newWin : before.win };

            tx.update(userRef, { depositBalance: after.dep, winningBalance: after.win });
            // audit trail: who changed which wallet and from/to what
            tx.set(doc(collection(db, 'wallet_logs')), {
                userId: uid,
                userEmail: snap.data().email || '',
                before, after,
                changedBy: auth.currentUser?.email || 'admin',
                createdAt: serverTimestamp()
            });
        });
        toast('User wallet updated!');
        refreshUser(uid);
    } catch (err) {
        console.error(err);
        notifyError('Wallet update failed: ' + err.message);
    } finally {
        btn.disabled = false;
    }
});

// Keep one user's card fresh after a wallet-changing action (no full reload needed)
async function refreshUser(uid) {
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) return;
        const data = { id: uid, ...snap.data() };
        const i = usersCache.findIndex(u => u.id === uid);
        if (i >= 0) usersCache[i] = data; else usersCache.push(data);

        const card = document.querySelector(`[data-uid="${CSS.escape(uid)}"]`);
        if (!card) return;
        const { dep, win } = getBalances(data);
        const typing = document.activeElement?.tagName === 'INPUT' && card.contains(document.activeElement);
        if (typing) return;
        for (const [name, v] of [['dep', dep], ['win', win]]) {
            const input = card.querySelector(`[name="${name}"]`);
            input.value = v;
            input.dataset.orig = v;
        }
    } catch (e) {
        console.error('refreshUser failed:', e);
    }
}
window.addEventListener('wallet-changed', (e) => refreshUser(e.detail.uid));

/* ==========================================================================
   WITHDRAWAL REQUESTS (only PENDING ones are fetched)
   ========================================================================== */
function paymentDetailsHTML(r) {
    const pd = r.paymentDetails || {};
    const upi = pd.upiId || r.upiId;
    if (upi) return `UPI: ${esc(upi)}`;
    if (pd.accNo) return `Bank: ${esc(pd.bankName)}<br>A/C: ${esc(pd.accNo)}<br>IFSC: ${esc(pd.ifsc)}`;
    return esc(r.accountDetails || 'N/A');
}

function listenWithdrawalRequests() {
    const listEl = $('adminWithdrawalRequests');
    if (!listEl) return;

    onSnapshot(query(collection(db, 'withdrawal_requests'), where('status', '==', 'PENDING')), (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:10px;">No pending withdrawal requests.</div>`;
            return;
        }
        listEl.innerHTML = snapshot.docs.map(d => {
            const r = d.data();
            return `
                <div class="deposit-item">
                    <div>
                        <strong>User:</strong> ${esc(r.userEmail || r.userId)}<br>
                        <strong>Amount:</strong> <span style="color:var(--accent-red);">₹${esc(num(r.amount))}</span><br>
                        <strong>${esc(r.method || 'Payout')}:</strong>
                        <span style="color:var(--accent-orange); font-family:monospace;">${paymentDetailsHTML(r)}</span>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-success" style="width:auto; padding:6px 10px;" data-action="approve-withdraw" data-id="${esc(d.id)}">Approve</button>
                        <button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-action="reject-withdraw" data-id="${esc(d.id)}">Reject</button>
                    </div>
                </div>`;
        }).join('');
    }, (err) => {
        console.error('Withdrawals listener:', err);
        listEl.innerHTML = `<div style="color:var(--accent-red); font-size:12px;">Load nahi hua: ${esc(err.message)}</div>`;
    });

    listEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const reqRef = doc(db, 'withdrawal_requests', id);
        btn.disabled = true;

        try {
            if (btn.dataset.action === 'approve-withdraw') {
                if (!confirm('Payout kar diya hai? Approve karne se pehle paise transfer karein.')) return;
                await runTransaction(db, async (tx) => {
                    const snap = await tx.get(reqRef);
                    if (!snap.exists() || snap.data().status !== 'PENDING') throw new Error('Ye request pehle hi process ho chuki hai.');
                    tx.update(reqRef, { status: 'APPROVED', ...reviewer() });
                });
                toast('Withdrawal Approved!');

            } else if (btn.dataset.action === 'reject-withdraw') {
                if (!confirm('Request reject karein aur player ka winning balance refund karein?')) return;
                let uid;
                await runTransaction(db, async (tx) => {
                    const snap = await tx.get(reqRef);
                    if (!snap.exists() || snap.data().status !== 'PENDING') throw new Error('Ye request pehle hi process ho chuki hai.');
                    const r = snap.data();
                    uid = r.userId;
                    const userRef = doc(db, 'users', r.userId);
                    const uSnap = await tx.get(userRef);
                    if (!uSnap.exists()) throw new Error('User nahi mila.');

                    const { dep, win } = getBalances(uSnap.data());
                    tx.update(userRef, { depositBalance: dep, winningBalance: money(win + money(r.amount)) });
                    tx.update(reqRef, { status: 'REJECTED', ...reviewer() });
                });
                toast('Withdrawal Rejected & amount refunded.');
                window.dispatchEvent(new CustomEvent('wallet-changed', { detail: { uid } }));
            }
        } catch (err) {
            console.error(err);
            notifyError(err.message);
        } finally {
            btn.disabled = false;
        }
    });
}

/* ==========================================================================
   DEPOSIT REQUESTS
   ========================================================================== */
function listenDepositRequests() {
    const listEl = $('adminDepositRequests');
    if (!listEl) return;

    onSnapshot(query(collection(db, 'deposit_requests'), where('status', '==', 'PENDING')), (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:10px;">No pending deposit requests.</div>`;
            return;
        }
        listEl.innerHTML = snapshot.docs.map(d => {
            const r = d.data();
            return `
                <div class="deposit-item">
                    <div>
                        <strong>User:</strong> ${esc(r.userEmail || r.userId)}<br>
                        <strong>Amount:</strong> <span style="color:var(--green-glow);">₹${esc(num(r.amount))}</span><br>
                        <strong>UTR Ref:</strong> <span style="color:var(--accent-orange); font-family:monospace;">${esc(r.utrNumber)}</span>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-success" style="width:auto; padding:6px 10px;" data-action="approve-deposit" data-id="${esc(d.id)}">Approve</button>
                        <button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-action="reject-deposit" data-id="${esc(d.id)}">Reject</button>
                    </div>
                </div>`;
        }).join('');
    }, (err) => {
        console.error('Deposits listener:', err);
        listEl.innerHTML = `<div style="color:var(--accent-red); font-size:12px;">Load nahi hua: ${esc(err.message)}</div>`;
    });

    listEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const reqRef = doc(db, 'deposit_requests', id);
        btn.disabled = true;

        try {
            if (btn.dataset.action === 'approve-deposit') {
                if (!confirm('Bank/UPI me payment aa gayi hai? Approve karke wallet me add karein?')) return;
                let uid;
                await runTransaction(db, async (tx) => {
                    const snap = await tx.get(reqRef);
                    if (!snap.exists() || snap.data().status !== 'PENDING') throw new Error('Ye request pehle hi process ho chuki hai.');
                    const r = snap.data();
                    uid = r.userId;
                    const amount = money(r.amount);
                    if (!(amount > 0)) throw new Error('Amount valid nahi hai.');

                    const userRef = doc(db, 'users', r.userId);
                    const uSnap = await tx.get(userRef);
                    if (!uSnap.exists()) throw new Error('User nahi mila.');

                    const { dep, win } = getBalances(uSnap.data());
                    tx.update(userRef, { depositBalance: money(dep + amount), winningBalance: win });
                    tx.update(reqRef, { status: 'APPROVED', ...reviewer() });
                });
                toast('Deposit Approved & wallet updated!');
                window.dispatchEvent(new CustomEvent('wallet-changed', { detail: { uid } }));

            } else if (btn.dataset.action === 'reject-deposit') {
                if (!confirm('Is UTR request ko reject karna hai?')) return;
                await runTransaction(db, async (tx) => {
                    const snap = await tx.get(reqRef);
                    if (!snap.exists() || snap.data().status !== 'PENDING') throw new Error('Ye request pehle hi process ho chuki hai.');
                    tx.update(reqRef, { status: 'REJECTED', ...reviewer() });
                });
                toast('Deposit request rejected.');
            }
        } catch (err) {
            console.error(err);
            notifyError(err.message);
        } finally {
            btn.disabled = false;
        }
    });
}

/* ==========================================================================
   SUB-ADMINS
   ========================================================================== */
window.addSubAdmin = async () => {
    const input = $('subAdminEmail');
    const email = (input?.value || '').trim().toLowerCase();
    if (!isValidEmail(email)) return notifyError('Sahi Sub-Admin email enter karein!');
    if (email === SUPER_ADMIN_EMAIL.toLowerCase()) return notifyError('Super Admin ko sub-admin banane ki zaroorat nahi.');

    try {
        await setDoc(doc(db, 'sub_admins', email), {
            email, addedBy: auth.currentUser?.email || 'SuperAdmin', createdAt: serverTimestamp()
        });
        input.value = '';
        toast('Sub-Admin added!');
    } catch (e) {
        notifyError('Error adding sub-admin: ' + e.message);
    }
};

function listenSubAdmins() {
    const list = $('subAdminList');
    if (!list) return;

    onSnapshot(collection(db, 'sub_admins'), (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = `<div style="font-size:11px; color:var(--text-muted);">No sub-admins added yet.</div>`;
            return;
        }
        list.innerHTML = snapshot.docs.map(d => `
            <div class="sub-admin-item">
                <span>${esc(d.data().email || d.id)}</span>
                <button class="btn btn-danger" style="width:auto; padding:2px 6px; font-size:10px;" data-action="remove-sub" data-id="${esc(d.id)}">
                    <i class="fa-solid fa-xmark"></i> Remove
                </button>
            </div>`).join('');
    }, (err) => console.error('Sub-admins listener:', err));

    list.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="remove-sub"]');
        if (!btn) return;
        if (!confirm(`Remove ${btn.dataset.id} from sub-admins?`)) return;
        try {
            await deleteDoc(doc(db, 'sub_admins', btn.dataset.id));
            toast('Sub-Admin removed!');
        } catch (err) {
            notifyError('Error removing sub-admin: ' + err.message);
        }
    });
}
