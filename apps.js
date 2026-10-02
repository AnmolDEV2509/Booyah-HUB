// app.js
import { db, auth, googleProvider } from './firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    updateDoc, 
    addDoc,
    query, 
    where, 
    orderBy, 
    limit,
    onSnapshot,
    runTransaction,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;
let currentMatches = [];
let selectedMatch = null;
let userUnsub = null;

// Navigation Function
window.navigate = function(pageName, btnElement) {
    if (btnElement) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
    }

    const contentDiv = document.getElementById('content');
    if (!contentDiv) return;

    contentDiv.dataset.activePage = pageName;

    switch(pageName) {
        case 'Home':
            renderHomePage(contentDiv);
            break;
        case 'Leaderboard':
            renderLeaderboardPage(contentDiv);
            break;
        case 'Wallet':
            renderWalletPage(contentDiv);
            break;
        case 'Profile':
            renderProfilePage(contentDiv);
            break;
        default:
            renderHomePage(contentDiv);
    }
};

window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
};

window.toggleNotif = function() {
    alert("Notifications Active Hain!");
};

// Auth Observer
onAuthStateChanged(auth, (user) => {
    if (userUnsub) userUnsub();

    if (user) {
        const userRef = doc(db, 'users', user.uid);
        
        userUnsub = onSnapshot(userRef, async (docSnap) => {
            if (docSnap.exists()) {
                currentUser = { uid: user.uid, ...docSnap.data() };
            } else {
                const newUser = {
                    uid: user.uid,
                    displayName: user.displayName || 'Booyah Player',
                    email: user.email || '',
                    photoURL: user.photoURL || 'https://via.placeholder.com/90',
                    walletBalance: 0,
                    winnings: 0,
                    ign: '',
                    gameUid: '',
                    createdAt: serverTimestamp()
                };
                await setDoc(userRef, newUser);
                currentUser = newUser;
            }
            
            const totalBalance = (currentUser.walletBalance || 0) + (currentUser.winnings || 0);
            updateHeaderWalletDisplay(totalBalance);

            const contentDiv = document.getElementById('content');
            if (contentDiv && contentDiv.dataset.activePage === 'Wallet') {
                renderWalletPage(contentDiv);
            } else if (contentDiv && contentDiv.dataset.activePage === 'Profile') {
                renderProfilePage(contentDiv);
            }
        }, (err) => {
            console.error("User Sync Error:", err);
        });
    } else {
        currentUser = null;
        updateHeaderWalletDisplay(0);
        const contentDiv = document.getElementById('content');
        if (contentDiv && contentDiv.dataset.activePage === 'Profile') {
            renderProfilePage(contentDiv);
        }
    }

    const contentDiv = document.getElementById('content');
    if (contentDiv) {
        window.navigate(contentDiv.dataset.activePage || 'Home');
    }
});

function renderHomePage(container) {
    container.innerHTML = `
        <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="searchInput" placeholder="Search tournament..." onkeyup="window.filterMatches()">
        </div>

        <div class="filter-chips">
            <button class="chip active" onclick="window.filterByTag('ALL', this)">ALL</button>
            <button class="chip" onclick="window.filterByTag('SOLO', this)">SOLO</button>
            <button class="chip" onclick="window.filterByTag('DUO', this)">DUO</button>
            <button class="chip" onclick="window.filterByTag('SQUAD', this)">SQUAD</button>
        </div>

        <div class="section-title">
            <i class="fa-solid fa-fire"></i> Active Tournaments
        </div>

        <div id="matchesListContainer">
            <div style="text-align:center; padding:30px; color:var(--text-muted);">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;"></i>
                <p style="margin-top:10px;">Loading Live Tournaments...</p>
            </div>
        </div>
    `;

    fetchMatches();
}

function renderLeaderboardPage(container) {
    container.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-trophy"></i> Top Ranking Players</div>
        <div class="card card-body" id="leaderboardContainer">
            <div style="text-align:center; padding:20px; color:var(--text-muted);">
                <i class="fa-solid fa-spinner fa-spin"></i> Loading Leaderboard...
            </div>
        </div>
    `;

    fetchLeaderboard();
}

function renderWalletPage(container) {
    const depositBal = currentUser ? (currentUser.walletBalance || 0) : 0;
    const winBal = currentUser ? (currentUser.winnings || 0) : 0;

    container.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-wallet"></i> My Wallet</div>
        <div class="card card-body">
            <div class="wallet-stats-grid">
                <div class="wallet-stat-card">
                    <span>Deposit Balance</span>
                    <h3>₹${depositBal}</h3>
                </div>
                <div class="wallet-stat-card">
                    <span>Winnings Balance</span>
                    <h3>₹${winBal}</h3>
                </div>
            </div>
            
            <div class="form-row" style="margin-top:16px;">
                <button class="btn-primary" onclick="window.openDepositModal()">
                    <i class="fa-solid fa-plus"></i> Add Cash
                </button>
                <button class="btn-secondary" onclick="window.openWithdrawModal()">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Withdraw
                </button>
            </div>
        </div>

        <div class="section-title"><i class="fa-solid fa-clock-rotate-left"></i> Transaction History</div>
        <div class="card card-body" id="transactionHistory">
            <div style="text-align:center; padding:15px; color:var(--text-muted);">
                <i class="fa-solid fa-spinner fa-spin"></i> Fetching history...
            </div>
        </div>
    `;

    fetchTransactionHistory();
}

function renderProfilePage(container) {
    if (!currentUser) {
        container.innerHTML = `
            <div class="section-title"><i class="fa-solid fa-user"></i> My Profile</div>
            <div class="card card-body" style="text-align:center; padding:30px 15px;">
                <i class="fa-solid fa-lock" style="font-size:32px; color:var(--accent-orange); margin-bottom:12px;"></i>
                <h3 style="margin-bottom:6px;">Login Required</h3>
                <p style="color:var(--text-muted); font-size:12px; margin-bottom:20px;">Tournaments join karne ke liye Google login karein.</p>
                <button class="btn-primary" onclick="window.handleGoogleLogin()">
                    <i class="fa-brands fa-google"></i> Login with Google
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-user"></i> My Profile</div>
        <div class="card card-body" style="text-align:center;">
            <div class="profile-avatar-wrap">
                <img src="${currentUser.photoURL || 'https://via.placeholder.com/90'}" class="profile-avatar" alt="Avatar">
            </div>
            <h3 style="margin-top:5px;">${currentUser.displayName || 'Player'}</h3>
            <p style="font-size:12px; color:var(--text-muted);">${currentUser.email || '-'}</p>

            <div class="form-group" style="margin-top:20px; text-align:left;">
                <label>In-Game Name (IGN)</label>
                <input type="text" id="profileIgn" placeholder="e.g. BooyahKing" value="${currentUser.ign || ''}">
            </div>
            <div class="form-group" style="text-align:left;">
                <label>In-Game UID</label>
                <input type="text" id="profileUid" placeholder="e.g. 123456789" value="${currentUser.gameUid || ''}">
            </div>

            <button class="btn-primary" onclick="window.saveProfileData()">Save Profile</button>
            <button class="btn-secondary" onclick="window.handleLogout()" style="margin-top:10px;">Logout</button>
        </div>
    `;
}

function fetchMatches() {
    const container = document.getElementById('matchesListContainer');
    if (!container) return;

    const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="card card-body" style="text-align:center; color:var(--text-muted); padding:30px;">
                    <i class="fa-solid fa-circle-exclamation" style="font-size:28px; margin-bottom:8px; color:var(--accent-orange);"></i>
                    <p>Koi tournaments uplabdha nahi hain.</p>
                </div>
            `;
            currentMatches = [];
            return;
        }

        currentMatches = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        renderMatchCards(currentMatches, container);
    }, (error) => {
        console.error("Firestore Listen Error:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">Load Failed: ${error.message}</p>`;
    });
}

function renderMatchCards(matches, container) {
    if (matches.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">Koi match nahi mila.</p>`;
        return;
    }

    container.innerHTML = matches.map(m => {
        const filled = m.filledSlots || 0;
        const total = m.totalSlots || 48;
        const percent = Math.min(100, Math.round((filled / total) * 100));

        return `
            <div class="card">
                <img src="${m.banner || 'https://via.placeholder.com/600x200/14171f/ff5500?text=Tournament'}" class="card-banner" alt="Match Banner">
                <div class="card-body">
                    <div class="card-header">
                        <div class="card-title">${m.title || m.name || 'Tournament'}</div>
                        <span class="badge-status badge-upcoming">${m.status || 'UPCOMING'}</span>
                    </div>
                    <div class="card-details">
                        <div class="detail-item"><span>PRIZE POOL</span><strong>₹${m.prizePool || 0}</strong></div>
                        <div class="detail-item"><span>ENTRY</span><strong>₹${m.entryFee || 0}</strong></div>
                        <div class="detail-item"><span>MODE</span><strong>${m.mode || 'SOLO'}</strong></div>
                    </div>
                    <div class="slot-tracker">
                        <div class="slot-info">
                            <span>Slots Filled</span>
                            <span>${filled}/${total}</span>
                        </div>
                        <div class="progress-bg">
                            <div class="progress-fill" style="width: ${percent}%"></div>
                        </div>
                    </div>
                    <button class="btn-primary" onclick="window.viewMatchDetails('${m.id}')">View Details & Register</button>
                </div>
            </div>
        `;
    }).join('');
}

window.viewMatchDetails = function(matchId) {
    selectedMatch = currentMatches.find(m => m.id === matchId);
    if (!selectedMatch) return;

    document.getElementById('detBanner').src = selectedMatch.banner || 'https://via.placeholder.com/600x200/14171f/ff5500?text=Tournament';
    document.getElementById('detTitle').innerText = selectedMatch.title || selectedMatch.name;
    document.getElementById('detMode').innerText = `${selectedMatch.mode || 'SOLO'} | ${selectedMatch.map ? selectedMatch.map.toUpperCase() : 'BERMUDA'}`;
    document.getElementById('detPrize').innerText = `₹${selectedMatch.prizePool || 0}`;
    document.getElementById('detEntry').innerText = `₹${selectedMatch.entryFee || 0}`;
    document.getElementById('payout1').innerText = `₹${selectedMatch.prize1 || Math.round((selectedMatch.prizePool || 0) * 0.5)}`;
    document.getElementById('payout2').innerText = `₹${selectedMatch.prize2 || Math.round((selectedMatch.prizePool || 0) * 0.25)}`;
    document.getElementById('payoutKill').innerText = `₹${selectedMatch.perKill || 0}`;
    document.getElementById('detSlotText').innerText = `${selectedMatch.filledSlots || 0}/${selectedMatch.totalSlots || 48} Filled`;

    const seatsGrid = document.getElementById('seatsGrid');
    seatsGrid.innerHTML = '';
    const total = selectedMatch.totalSlots || 48;
    const filled = selectedMatch.filledSlots || 0;

    for (let i = 1; i <= total; i++) {
        const isFilled = i <= filled;
        seatsGrid.innerHTML += `<div class="seat-dot ${isFilled ? 'filled' : ''}">${i}</div>`;
    }

    const joinBtn = document.getElementById('detJoinBtn');
    joinBtn.onclick = () => {
        window.closeModal('detailsModal');
        window.openJoinModal();
    };

    window.openModal('detailsModal');
};

window.openJoinModal = function() {
    if (!currentUser) {
        alert("Pehle Google Login karein!");
        window.navigate('Profile');
        return;
    }

    if (!selectedMatch) return;

    document.getElementById('modalMatchTitle').innerText = selectedMatch.title || selectedMatch.name;
    document.getElementById('modalMatchMode').innerText = `MODE: ${selectedMatch.mode || 'SOLO'} • ENTRY FEE: ₹${selectedMatch.entryFee || 0}`;

    const container = document.getElementById('dynamicFormContainer');
    let formHTML = '';

    const mode = selectedMatch.mode || 'SOLO';
    const count = mode === 'SOLO' ? 1 : mode === 'DUO' ? 2 : 4;
    for (let i = 1; i <= count; i++) {
        formHTML += `
            <div class="player-form-block">
                <h4>Player ${i} Details</h4>
                <div class="form-group">
                    <label>In-Game Name (IGN)</label>
                    <input type="text" id="ignP${i}" placeholder="Enter IGN" value="${i === 1 ? (currentUser.ign || '') : ''}">
                </div>
                <div class="form-group">
                    <label>Game UID</label>
                    <input type="text" id="uidP${i}" placeholder="Enter Numeric UID" value="${i === 1 ? (currentUser.gameUid || '') : ''}">
                </div>
            </div>
        `;
    }

    container.innerHTML = formHTML;
    window.openModal('joinModal');
};

window.confirmJoin = async function() {
    if (!currentUser || !selectedMatch) return;

    const entryFee = Number(selectedMatch.entryFee || 0);
    const totalBal = (currentUser.walletBalance || 0) + (currentUser.winnings || 0);

    if (totalBal < entryFee) {
        alert(`Insufficient balance! Fee: ₹${entryFee}, Balance: ₹${totalBal}.`);
        window.closeModal('joinModal');
        window.navigate('Wallet');
        return;
    }

    const mode = selectedMatch.mode || 'SOLO';
    const count = mode === 'SOLO' ? 1 : mode === 'DUO' ? 2 : 4;
    let players = [];

    for (let i = 1; i <= count; i++) {
        const ign = document.getElementById(`ignP${i}`)?.value?.trim();
        const uid = document.getElementById(`uidP${i}`)?.value?.trim();

        if (!ign || !uid) {
            alert(`Player ${i} details fill karein!`);
            return;
        }
        players.push({ ign, gameUid: uid });
    }

    try {
        await runTransaction(db, async (transaction) => {
            const matchRef = doc(db, 'tournaments', selectedMatch.id);
            const userRef = doc(db, 'users', currentUser.uid);

            const matchDoc = await transaction.get(matchRef);
            const userDoc = await transaction.get(userRef);

            if (!matchDoc.exists()) throw new Error("Match not found.");
            
            const matchData = matchDoc.data();
            const userData = userDoc.data();

            const currentSlots = matchData.filledSlots || 0;
            const maxSlots = matchData.totalSlots || 48;

            if (currentSlots >= maxSlots) throw new Error("Match full ho gaya hai!");

            let currentDeposit = userData.walletBalance || 0;
            let currentWinnings = userData.winnings || 0;

            if ((currentDeposit + currentWinnings) < entryFee) throw new Error("Balance low hai!");

            if (currentDeposit >= entryFee) {
                currentDeposit -= entryFee;
            } else {
                const rem = entryFee - currentDeposit;
                currentDeposit = 0;
                currentWinnings -= rem;
            }

            transaction.update(userRef, { walletBalance: currentDeposit, winnings: currentWinnings });
            transaction.update(matchRef, { filledSlots: currentSlots + 1 });

            const regRef = doc(collection(db, 'registrations'));
            transaction.set(regRef, {
                tournamentId: selectedMatch.id,
                userId: currentUser.uid,
                players: players,
                entryFee: entryFee,
                joinedAt: serverTimestamp()
            });

            const txnRef = doc(collection(db, 'transactions'));
            transaction.set(txnRef, {
                userId: currentUser.uid,
                amount: entryFee,
                type: 'DEBIT',
                description: `Entry: ${matchData.title || matchData.name}`,
                status: 'SUCCESS',
                createdAt: serverTimestamp()
            });
        });

        alert("Registration Successful!");
        window.closeModal('joinModal');
    } catch (err) {
        alert("Failed: " + err.message);
    }
};

async function fetchLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    if (!container) return;

    try {
        const q = query(collection(db, 'users'), orderBy('winnings', 'desc'), limit(15));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = `<p style="text-align:center; color:var(--text-muted);">Leaderboard is empty.</p>`;
            return;
        }

        let rank = 1;
        container.innerHTML = snap.docs.map(docSnap => {
            const data = docSnap.data();
            const html = `
                <div class="list-item">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-weight:700; color:${rank === 1 ? '#ffb700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : 'var(--text-muted)'};">#${rank}</span>
                        <div>
                            <strong>${data.displayName || 'Player'}</strong>
                            <p style="font-size:10px; color:var(--text-muted);">IGN: ${data.ign || 'N/A'}</p>
                        </div>
                    </div>
                    <strong style="color:var(--green-glow);">₹${data.winnings || 0}</strong>
                </div>
            `;
            rank++;
            return html;
        }).join('');
    } catch (err) {
        console.error("Leaderboard Error:", err);
    }
}

async function fetchTransactionHistory() {
    const container = document.getElementById('transactionHistory');
    if (!container || !currentUser) {
        if (container) container.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center;">History ke liye login karein.</p>`;
        return;
    }

    try {
        const q = query(
            collection(db, 'transactions'), 
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(10)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center;">No transaction history.</p>`;
            return;
        }

        container.innerHTML = snap.docs.map(docSnap => {
            const t = docSnap.data();
            const isCredit = t.type === 'CREDIT';
            return `
                <div class="list-item">
                    <div>
                        <strong>${t.description || 'Transaction'}</strong>
                        <p style="font-size:10px; color:var(--text-muted);">${t.status || 'COMPLETED'}</p>
                    </div>
                    <strong style="color: ${isCredit ? 'var(--green-glow)' : '#ff4444'};">
                        ${isCredit ? '+' : '-'}₹${t.amount || 0}
                    </strong>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("History error:", err);
    }
}

window.openDepositModal = function() {
    if (!currentUser) { alert("Login required!"); window.navigate('Profile'); return; }
    window.openModal('depositModal');
};

window.openWithdrawModal = function() {
    if (!currentUser) { alert("Login required!"); window.navigate('Profile'); return; }
    window.openModal('withdrawModal');
};

window.handleGoogleLogin = async function() {
    try {
        await signInWithPopup(auth, googleProvider);
        window.navigate('Profile');
    } catch (err) {
        alert("Login Error: " + err.message);
    }
};

window.handleLogout = async function() {
    await signOut(auth);
    window.navigate('Home');
};

window.startDirectUpiPayment = function() {
    const amount = Number(document.getElementById('depositAmountInput')?.value);
    if (!amount || amount < 10) { alert("Min Deposit ₹10"); return; }
    window.closeModal('depositModal');
    window.openModal('verifyUpiModal');
};

window.submitUpiVerification = async function() {
    const utr = document.getElementById('upiUtrInput')?.value?.trim();
    const amount = Number(document.getElementById('depositAmountInput')?.value);

    if (!utr || utr.length !== 12) { alert("Valid 12-digit UTR daalein!"); return; }

    try {
        await addDoc(collection(db, 'deposits'), {
            userId: currentUser.uid,
            amount: amount,
            utr: utr,
            status: 'PENDING',
            createdAt: serverTimestamp()
        });
        alert("UTR Submit ho gaya hai!");
        window.closeModal('verifyUpiModal');
    } catch (err) {
        alert("Error: " + err.message);
    }
};

window.handleWithdrawMethodChange = function() {
    const method = document.getElementById('withdrawMethodSelect').value;
    document.getElementById('withdrawUpiFields').style.display = method === 'UPI' ? 'block' : 'none';
    document.getElementById('withdrawBankFields').style.display = method === 'BANK' ? 'block' : 'none';
};

window.submitWithdrawalRequest = async function() {
    const amount = Number(document.getElementById('withdrawAmountInput')?.value);
    if (!amount || amount < 50) { alert("Min Withdrawal ₹50!"); return; }

    try {
        await addDoc(collection(db, 'withdrawals'), {
            userId: currentUser.uid,
            amount: amount,
            method: document.getElementById('withdrawMethodSelect').value,
            status: 'PENDING',
            createdAt: serverTimestamp()
        });
        alert("Withdrawal Requested!");
        window.closeModal('withdrawModal');
    } catch (err) {
        alert("Error: " + err.message);
    }
};

window.saveProfileData = async function() {
    const ign = document.getElementById('profileIgn').value.trim();
    const uid = document.getElementById('profileUid').value.trim();

    if (!ign || !uid) { alert("IGN aur UID fill karein!"); return; }

    if (currentUser?.uid) {
        await updateDoc(doc(db, 'users', currentUser.uid), { ign, gameUid: uid });
        alert("Profile Saved!");
    }
};

function updateHeaderWalletDisplay(amount) {
    const walletDisplay = document.getElementById('headerWalletDisplay');
    if (walletDisplay) walletDisplay.innerText = `₹${amount}`;
}

window.filterMatches = function() {
    const queryStr = document.getElementById('searchInput')?.value.toLowerCase();
    const filtered = currentMatches.filter(m => 
        (m.title || m.name || '').toLowerCase().includes(queryStr) || 
        (m.mode || '').toLowerCase().includes(queryStr)
    );
    renderMatchCards(filtered, document.getElementById('matchesListContainer'));
};

window.filterByTag = function(tag, chipBtn) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (chipBtn) chipBtn.classList.add('active');

    if (tag === 'ALL') {
        renderMatchCards(currentMatches, document.getElementById('matchesListContainer'));
    } else {
        const filtered = currentMatches.filter(m => (m.mode || '').toUpperCase() === tag);
        renderMatchCards(filtered, document.getElementById('matchesListContainer'));
    }
};

document.addEventListener("DOMContentLoaded", () => {
    window.navigate('Home');
});
