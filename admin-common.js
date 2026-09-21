// admin-common.js - logic shared by admin.html (super admin) and subadmin.html
import { db, auth } from "./firebase-config.js";
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs,
    query, where, orderBy, limit, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    esc, num, money, getBalances, toMillis, toInputDateTime, toast, notifyError, DEFAULT_BANNER
} from "./utils.js";

const $ = (id) => document.getElementById(id);
const actor = () => auth.currentUser?.email || 'admin';
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

/** tournamentId -> name (used to show readable names in the results panel) */
const tournamentNames = new Map();

/* ==========================================================================
   ANNOUNCEMENTS
   ========================================================================== */
export function setupAnnouncements() {
    let posting = false;

    window.postAnnouncement = async () => {
        if (posting) return;
        const input = $('announcementText');
        const text = (input?.value || '').trim();
        if (!text) return notifyError('Announcement text enter karo!');
        if (text.length > 300) return notifyError('Announcement 300 characters se chhota rakhein.');

        posting = true;
        try {
            await addDoc(collection(db, 'announcements'), {
                text, createdAt: serverTimestamp(), createdBy: actor()
            });
            input.value = '';
            toast('Announcement Added!');
        } catch (e) {
            notifyError('Error adding announcement: ' + e.message);
        } finally {
            posting = false;
        }
    };

    const container = $('announcementsList');
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="delete-announcement"]');
        if (!btn) return;
        if (!confirm('Announcement delete karna hai?')) return;
        try {
            await deleteDoc(doc(db, 'announcements', btn.dataset.id));
        } catch (err) {
            notifyError('Delete failed: ' + err.message);
        }
    });

    onSnapshot(collection(db, 'announcements'), (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">No active announcements.</div>`;
            return;
        }
        const docs = [...snapshot.docs].sort((a, b) =>
            (toMillis(b.data().createdAt) ?? Date.now()) - (toMillis(a.data().createdAt) ?? Date.now()));

        container.innerHTML = docs.map(d => `
            <div class="announcement-item">
                <span>${esc(d.data().text)}</span>
                <button class="btn btn-danger" style="width:auto; padding:4px 8px; font-size:10px;"
                        data-action="delete-announcement" data-id="${esc(d.id)}">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            </div>`).join('');
    }, (err) => console.error('Announcements listener:', err));
}

/* ==========================================================================
   TOURNAMENTS
   options: { canKick, canRefund }
   ========================================================================== */
export function setupTournaments({ canKick = false, canRefund = false } = {}) {
    /* ---------- create ---------- */
    let creating = false;
    window.createMatch = async () => {
        if (creating) return;

        const title = ($('newTitle')?.value || '').trim();
        const startVal = $('newStartTime')?.value;
        const totalSlots = parseInt($('newSlots')?.value, 10);
        const entry = parseInt($('newEntry')?.value, 10);
        const prize = parseInt($('newPrize')?.value, 10);
        const perKill = parseInt($('newPerKill')?.value, 10) || 0;

        if (!title || !startVal) return notifyError('Title aur Start Time zaroori hain!');
        if (!(totalSlots >= 1)) return notifyError('Total slots kam se kam 1 hone chahiye.');
        if (!(entry >= 0) || !(prize >= 0)) return notifyError('Entry fee aur prize valid number hone chahiye.');

        const startTime = new Date(startVal).getTime();
        if (!Number.isFinite(startTime)) return notifyError('Start time valid nahi hai.');

        creating = true;
        try {
            await addDoc(collection(db, 'tournaments'), {
                name: title,
                mode: $('newMode')?.value || 'SOLO',
                map: $('newMap')?.value || 'Bermuda',
                totalSlots,
                joinedSlots: 0,
                perKill,
                entry,
                prize,
                startTime,
                banner: ($('newBanner')?.value || '').trim() || DEFAULT_BANNER,
                description: ($('newDescription')?.value || '').trim() || 'No specific rules provided.',
                status: 'UPCOMING',
                roomId: '',
                roomPass: '',
                createdBy: actor(),
                createdAt: serverTimestamp()
            });
            toast('Tournament Published Successfully!');
            if ($('newTitle')) $('newTitle').value = '';
            if ($('newDescription')) $('newDescription').value = '';
        } catch (e) {
            notifyError('Failed to create tournament: ' + e.message);
        } finally {
            creating = false;
        }
    };

    /* ---------- list ---------- */
    const container = $('adminTournamentsList');
    if (!container) return;

    const cards = new Map(); // tournamentId -> element
    let ready = false;

    const field = (label, name, value, type = 'text', extra = '') => `
        <div class="form-group">
            <label>${label}</label>
            <input type="${type}" name="${name}" value="${esc(value)}" ${extra}>
        </div>`;

    const opt = (value, current) =>
        `<option value="${value}" ${current === value ? 'selected' : ''}>${value}</option>`;

    function cardHTML(d) {
        const status = (d.status || 'UPCOMING').toUpperCase();
        return `
            <div class="tourney-header">
                <div>
                    <strong style="font-size:15px;">${esc(d.name)}</strong>
                    <span style="font-size:11px; color:var(--accent-orange); margin-left:8px;">[${esc(d.mode)} | ${esc(d.map || 'Bermuda')}]</span>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
                        Slots: <span class="js-slots">${num(d.joinedSlots)}/${num(d.totalSlots)}</span>
                    </div>
                </div>
                <select name="status" style="background:#000; color:#fff; border:1px solid var(--border-color); padding:4px 8px; border-radius:4px; font-size:11px; width:auto;">
                    ${opt('UPCOMING', status)}${opt('LIVE', status)}${opt('COMPLETED', status)}
                </select>
            </div>

            <div class="edit-grid">
                ${field('Room ID', 'room', d.roomId || '', 'text', 'placeholder="Enter Room ID"')}
                ${field('Room Password', 'pass', d.roomPass || '', 'text', 'placeholder="Enter Pass"')}
            </div>

            <div class="action-btns">
                <button class="btn btn-success" style="width:auto; padding:6px 12px;" data-action="save-room"><i class="fa-solid fa-key"></i> Save Room ID/Pass</button>
                <button class="btn btn-primary" style="width:auto; padding:6px 12px;" data-action="toggle-edit"><i class="fa-solid fa-pen-to-square"></i> Edit Full Details</button>
                <button class="btn btn-secondary" style="width:auto; padding:6px 12px;" data-action="toggle-players"><i class="fa-solid fa-users"></i> View Players</button>
                <button class="btn btn-danger" style="width:auto; padding:6px 12px;" data-action="delete-match"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>

            <div class="full-edit-container">
                <h4 style="font-size:13px; color:var(--accent-orange); margin-bottom:10px;"><i class="fa-solid fa-sliders"></i> Modify Hosted Tournament Info</h4>
                ${field('Title', 'title', d.name || '')}
                <div class="edit-grid">
                    <div class="form-group">
                        <label>Mode</label>
                        <select name="mode">${['SOLO', 'DUO', 'SQUAD', 'CS'].map(m => opt(m, (d.mode || '').toUpperCase())).join('')}</select>
                    </div>
                    <div class="form-group">
                        <label>Map</label>
                        <select name="map">${['Bermuda', 'Kalahari', 'Purgatory', 'Alpine', 'Nexterra'].map(m => opt(m, d.map || 'Bermuda')).join('')}</select>
                    </div>
                </div>
                <div class="edit-grid">
                    ${field('Total Slots', 'slots', num(d.totalSlots, 48), 'number', 'min="1"')}
                    ${field('Per Kill (₹)', 'perkill', num(d.perKill), 'number', 'min="0"')}
                </div>
                <div class="edit-grid">
                    ${field('Entry Fee (₹)', 'entry', num(d.entry), 'number', 'min="0"')}
                    ${field('Prize Pool (₹)', 'prize', num(d.prize), 'number', 'min="0"')}
                </div>
                ${field('Start Time', 'start', toInputDateTime(toMillis(d.startTime)), 'datetime-local')}
                ${field('Banner URL', 'banner', d.banner || '')}
                <div class="form-group">
                    <label>Rules / Description</label>
                    <textarea name="desc" rows="3">${esc(d.description || '')}</textarea>
                </div>
                <button class="btn btn-primary" style="margin-top:5px;" data-action="save-full"><i class="fa-solid fa-floppy-disk"></i> Update Hosted Match</button>
            </div>

            <div class="players-container"></div>`;
    }

    function upsertCard(id, d) {
        let el = cards.get(id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'tourney-item';
            el.dataset.tid = id;
            el.innerHTML = cardHTML(d);
            cards.set(id, el);
            return el;
        }

        const editOpen = el.querySelector('.full-edit-container')?.style.display === 'block';
        const busy = el.contains(document.activeElement);

        if (editOpen || busy) {
            // Admin is typing: don't wipe their inputs, only sync the safe live bits.
            const slots = el.querySelector('.js-slots');
            if (slots) slots.textContent = `${num(d.joinedSlots)}/${num(d.totalSlots)}`;
            const sel = el.querySelector('[name="status"]');
            if (sel && document.activeElement !== sel) sel.value = (d.status || 'UPCOMING').toUpperCase();
        } else {
            el.innerHTML = cardHTML(d);
        }
        return el;
    }

    onSnapshot(collection(db, 'tournaments'), (snapshot) => {
        if (!ready) { container.innerHTML = ''; ready = true; }

        tournamentNames.clear();
        const live = new Set();
        const docs = [...snapshot.docs].sort((a, b) =>
            (toMillis(b.data().startTime) ?? 0) - (toMillis(a.data().startTime) ?? 0));

        const ordered = docs.map(d => {
            live.add(d.id);
            tournamentNames.set(d.id, d.data().name || d.id);
            return upsertCard(d.id, d.data());
        });

        for (const [id, el] of cards) {
            if (!live.has(id)) { el.remove(); cards.delete(id); }
        }

        container.querySelector('.js-empty')?.remove();
        if (!ordered.length) {
            container.insertAdjacentHTML('beforeend',
                `<div class="js-empty" style="color:var(--text-muted); text-align:center;">No tournaments found.</div>`);
            return;
        }
        // Reorder only what is out of place (keeps focus in untouched cards)
        ordered.forEach((el, i) => {
            if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
        });
    }, (err) => {
        console.error('Tournaments listener:', err);
        container.innerHTML = `<div style="color:var(--accent-red);">Tournaments load nahi hue: ${esc(err.message)}</div>`;
    });

    /* ---------- actions ---------- */
    const val = (card, name) => card.querySelector(`[name="${name}"]`)?.value ?? '';

    container.addEventListener('change', async (e) => {
        if (e.target.name !== 'status') return;
        const card = e.target.closest('[data-tid]');
        try {
            await updateDoc(doc(db, 'tournaments', card.dataset.tid), { status: e.target.value });
            toast(`Match status: ${e.target.value}`);
        } catch (err) {
            notifyError('Status change failed: ' + err.message);
        }
    });

    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const card = btn.closest('[data-tid]');
        if (!card) return;
        const id = card.dataset.tid;

        try {
            switch (btn.dataset.action) {
                case 'save-room':
                    await updateDoc(doc(db, 'tournaments', id), {
                        roomId: val(card, 'room').trim(),
                        roomPass: val(card, 'pass').trim()
                    });
                    toast('Room Credentials Saved!');
                    break;

                case 'toggle-edit': {
                    const box = card.querySelector('.full-edit-container');
                    box.style.display = box.style.display === 'block' ? 'none' : 'block';
                    break;
                }

                case 'save-full': {
                    const title = val(card, 'title').trim();
                    const startTime = new Date(val(card, 'start')).getTime();
                    const slots = parseInt(val(card, 'slots'), 10);
                    const entry = parseInt(val(card, 'entry'), 10);
                    const prize = parseInt(val(card, 'prize'), 10);
                    const perKill = parseInt(val(card, 'perkill'), 10) || 0;

                    if (!title || !Number.isFinite(startTime)) return notifyError('Title aur Start Time required hain!');
                    if (!(slots >= 1) || !(entry >= 0) || !(prize >= 0)) return notifyError('Slots, entry aur prize valid numbers hone chahiye.');

                    await updateDoc(doc(db, 'tournaments', id), {
                        name: title,
                        mode: val(card, 'mode'),
                        map: val(card, 'map'),
                        totalSlots: slots,
                        perKill, entry, prize, startTime,
                        banner: val(card, 'banner').trim() || DEFAULT_BANNER,
                        description: val(card, 'desc').trim(),
                        updatedAt: serverTimestamp()
                    });
                    toast('Tournament details updated!');
                    card.querySelector('.full-edit-container').style.display = 'none';
                    break;
                }

                case 'toggle-players':
                    await togglePlayers(card, id);
                    break;

                case 'delete-match': {
                    const joined = parseInt(card.querySelector('.js-slots')?.textContent, 10) || 0;
                    const warn = joined > 0
                        ? `⚠️ Is match me ${joined} registration(s) hain aur unki entry fee wapas nahi hogi.\nPhir bhi permanently delete karein?`
                        : 'Is match ko permanently delete karna hai?';
                    if (!confirm(warn)) return;
                    await deleteDoc(doc(db, 'tournaments', id));
                    toast('Tournament Deleted!');
                    break;
                }

                case 'kick':
                    await kickPlayer(card, id, btn.dataset.reg);
                    break;

                default: break;
            }
        } catch (err) {
            console.error(err);
            notifyError(err.message || 'Kuch galat ho gaya.');
        }
    });

    async function togglePlayers(card, tourneyId) {
        const box = card.querySelector('.players-container');
        if (box.style.display === 'block') { box.style.display = 'none'; return; }

        box.style.display = 'block';
        box.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">Fetching players...</span>`;

        try {
            const snap = await getDocs(query(collection(db, 'registrations'), where('tournamentId', '==', tourneyId)));
            if (snap.empty) {
                box.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">No players registered yet.</span>`;
                return;
            }

            const rows = snap.docs.map(d => {
                const reg = d.data();
                const players = Array.isArray(reg.players) ? reg.players : [];
                return `
                    <div class="player-row" style="margin-bottom:8px; padding-bottom:6px; border-bottom:1px dashed rgba(255,255,255,0.1);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                            <div><strong>User:</strong> ${esc(reg.userEmail || 'N/A')}</div>
                            ${canKick ? `<button class="btn btn-danger" style="width:auto; padding:3px 8px; font-size:10px;" data-action="kick" data-reg="${esc(d.id)}"><i class="fa-solid fa-user-xmark"></i> Kick</button>` : ''}
                        </div>
                        ${players.map((p, i) => `
                            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
                                &nbsp;&nbsp;• P${i + 1}: <strong style="color:#fff;">${esc(p.ign)}</strong> (UID: ${esc(p.uid)})
                            </div>`).join('')}
                    </div>`;
            }).join('');

            box.innerHTML = `<div style="font-size:11px; font-weight:700; color:var(--accent-orange); margin-bottom:8px;">REGISTERED TEAMS/PLAYERS (${snap.size}):</div>${rows}`;
        } catch (err) {
            console.error('Players load error:', err);
            box.innerHTML = `<span style="font-size:11px; color:var(--accent-red);">Error loading players!</span>`;
        }
    }

    async function kickPlayer(card, tourneyId, regId) {
        if (!canKick || !regId) return;

        const regRef = doc(db, 'registrations', regId);
        const tourneyRef = doc(db, 'tournaments', tourneyId);

        // Peek at the registration so we can ask about the refund before the transaction
        let refundAmount = 0;
        if (canRefund) {
            const peek = await getDocs(query(collection(db, 'registrations'), where('tournamentId', '==', tourneyId)));
            const reg = peek.docs.find(d => d.id === regId)?.data();
            refundAmount = money(reg?.entryPaid ?? 0);
        }

        if (!confirm('Is player/team ko tournament se kick karna hai?')) return;
        const doRefund = canRefund && refundAmount > 0 &&
            confirm(`Entry fee ₹${refundAmount} player ke Deposit wallet me refund karein?`);

        let refundUid = null;
        await runTransaction(db, async (tx) => {
            const regSnap = await tx.get(regRef);
            const tSnap = await tx.get(tourneyRef);
            if (!regSnap.exists()) throw new Error('Registration pehle hi remove ho chuki hai.');

            const reg = regSnap.data();
            refundUid = reg.userId;
            let userRef, userSnap;
            if (doRefund) {
                userRef = doc(db, 'users', reg.userId);
                userSnap = await tx.get(userRef);
            }

            tx.delete(regRef);
            if (tSnap.exists()) tx.update(tourneyRef, { joinedSlots: Math.max(0, num(tSnap.data().joinedSlots) - 1) });
            if (doRefund && userSnap?.exists()) {
                const { dep, win } = getBalances(userSnap.data());
                tx.update(userRef, { depositBalance: money(dep + money(reg.entryPaid)), winningBalance: win });
            }
        });

        toast(doRefund ? 'Player kicked & refunded.' : 'Player kicked.');
        if (doRefund && refundUid) window.dispatchEvent(new CustomEvent('wallet-changed', { detail: { uid: refundUid } }));
        // refresh the list
        const box = card.querySelector('.players-container');
        box.style.display = 'none';
        await togglePlayers(card, tourneyId);
    }
}

/* ==========================================================================
   RESULTS / PROOFS
   PENDING -> VERIFIED (any staff)  -> PAID (super admin, credits wallet)
           -> REJECTED
   options: { canPay }
   ========================================================================== */
export function setupResults({ canPay = false } = {}) {
    const container = $('resultsList');
    if (!container) return;

    const visible = canPay ? ['PENDING', 'VERIFIED'] : ['PENDING'];
    const reviewer = () => ({ reviewedBy: actor(), reviewedAt: serverTimestamp() });

    onSnapshot(query(collection(db, 'results'), orderBy('submittedAt', 'desc'), limit(100)), (snapshot) => {
        const items = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(r => visible.includes((r.status || 'PENDING').toUpperCase()));

        if (!items.length) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">No proof screenshots waiting for review.</div>`;
            return;
        }

        container.innerHTML = items.map(r => {
            const status = (r.status || 'PENDING').toUpperCase();
            const url = safeUrl(r.screenshotUrl);
            return `
                <div class="result-card">
                    <div style="font-size:12px; font-weight:600;">User: ${esc(r.userEmail)}</div>
                    <div style="font-size:10px; color:var(--text-muted);">
                        Match: ${esc(tournamentNames.get(r.tournamentId) || r.tournamentId)} • Status: <strong>${esc(status)}</strong>
                    </div>
                    <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">
                        <img src="${esc(url)}" class="result-img" alt="Booyah Proof" loading="lazy">
                    </a>
                    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                        ${canPay
                            ? `<button class="btn btn-success" style="padding:6px; flex:1;" data-action="pay" data-id="${esc(r.id)}"><i class="fa-solid fa-indian-rupee-sign"></i> Pay Prize</button>`
                            : (status === 'PENDING'
                                ? `<button class="btn btn-success" style="padding:6px; flex:1;" data-action="verify" data-id="${esc(r.id)}"><i class="fa-solid fa-check"></i> Verify</button>`
                                : '')}
                        <button class="btn btn-danger" style="padding:6px; flex:1;" data-action="reject" data-id="${esc(r.id)}"><i class="fa-solid fa-xmark"></i> Reject</button>
                    </div>
                </div>`;
        }).join('');
    }, (err) => {
        console.error('Results listener:', err);
        container.innerHTML = `<div style="color:var(--accent-red); font-size:12px;">Results load nahi hue: ${esc(err.message)}</div>`;
    });

    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const resultRef = doc(db, 'results', id);
        btn.disabled = true;

        try {
            if (btn.dataset.action === 'verify') {
                await updateDoc(resultRef, { status: 'VERIFIED', ...reviewer() });
                toast('Proof verified. Super admin prize credit karega.');

            } else if (btn.dataset.action === 'reject') {
                if (!confirm('Is proof ko reject karna hai? User dobara screenshot bhej sakta hai.')) return;
                await updateDoc(resultRef, { status: 'REJECTED', ...reviewer() });
                toast('Proof rejected.');

            } else if (btn.dataset.action === 'pay' && canPay) {
                const input = prompt('Prize amount (₹) jo player ke Winning wallet me add karna hai:');
                if (input === null) return;
                const amount = money(input);
                if (!(amount > 0)) return notifyError('Valid prize amount enter karein.');
                if (!confirm(`₹${amount} player ke Winning wallet me credit karein?`)) return;

                let resultUid;
                await runTransaction(db, async (tx) => {
                    const rSnap = await tx.get(resultRef);
                    if (!rSnap.exists()) throw new Error('Result nahi mila.');
                    const r = rSnap.data();
                    resultUid = r.userId;
                    const st = (r.status || 'PENDING').toUpperCase();
                    if (st !== 'PENDING' && st !== 'VERIFIED') throw new Error('Ye result pehle hi process ho chuka hai.');

                    const userRef = doc(db, 'users', r.userId);
                    const uSnap = await tx.get(userRef);
                    if (!uSnap.exists()) throw new Error('User nahi mila.');
                    const u = uSnap.data();
                    const { dep, win } = getBalances(u);

                    tx.update(userRef, { depositBalance: dep, winningBalance: money(win + amount) });
                    tx.update(resultRef, { status: 'PAID', prizeAmount: amount, ...reviewer() });
                    tx.set(doc(collection(db, 'winners')), {
                        userId: r.userId,
                        name: u.name || (u.email || 'Player').split('@')[0],
                        amount,
                        tournamentId: r.tournamentId,
                        resultId: id,
                        createdAt: serverTimestamp()
                    });
                });
                toast(`₹${amount} credited & winner recorded!`);
                window.dispatchEvent(new CustomEvent('wallet-changed', { detail: { uid: resultUid } }));
            }
        } catch (err) {
            console.error(err);
            notifyError(err.message || 'Action failed.');
        } finally {
            btn.disabled = false;
        }
    });
}
