// app.js - Firebase Config Connected
import { db, auth, googleProvider } from './firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    updateDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Global App State
let currentUser = null;
let currentMatches = [];
let selectedMatch = null;

// ==========================================
// 1. AUTHENTICATION & SYNC
// ==========================================

// Firebase Auth Observer - Site ko live data se connect karta h
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                currentUser = { uid: user.uid, ...userSnap.data() };
            } else {
                // New user document setup
                currentUser = {
                    uid: user.uid,
                    displayName: user.displayName || 'Booyah Player',
                    email: user.email,
                    photoURL: user.photoURL,
                    walletBalance: 0,
                    winnings: 0,
                    createdAt: serverTimestamp()
                };
                await setDoc(userRef, currentUser);
            }
            updateHeaderWalletDisplay((currentUser.walletBalance || 0) + (currentUser.winnings || 0));
        } catch (err) {
            console.error("Auth User Sync Error:", err);
        }
    } else {
        currentUser = null;
        updateHeaderWalletDisplay(0);
    }
    
    // Page load re-render
    const contentDiv = document.getElementById('content');
    if (contentDiv && contentDiv.children.length === 0) {
        window.navigate('Home');
    }
});

// ==========================================
// 2. GLOBAL NAVIGATION & UI HANDLERS
// ==========================================

window.navigate = function(pageName, btnElement) {
    if (btnElement) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
    }

    const contentDiv = document.getElementById('content');
    if (!contentDiv) return;

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
    alert("Sabhi notifications active hain!");
};

// ==========================================
// 3. PAGE RENDERERS
// ==========================================

function renderHomePage(container) {
    container.innerHTML = `
        <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="searchInput" placeholder="Search tournament name ya mode..." onkeyup="window.filterMatches()">
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
                <p style="margin-top:10px;">Live Tournaments loading ho rhe hain...</p>
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
                Leaderboard data loading...
            </div>
        </div>
    `;

    fetchLeaderboard();
}

function renderWalletPage(container) {
    const balance = currentUser ? (currentUser.walletBalance || 0) : 0;
    const winnings = currentUser ? (currentUser.winnings || 0) : 0;

    container.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-wallet"></i> My Wallet</div>
        <div class="card card-body">
            <div class="wallet-stats-grid">
                <div class="wallet-stat-card">
                    <span>Deposit Balance</span>
                    <h3>₹${balance}</h3>
                </div>
                <div class="wallet-stat-card">
                    <span>Winnings Balance</span>
                    <h3>₹${winnings}</h3>
                </div>
            </div>
            
            <div class="form-row" style="margin-top:16px;">
                <button class="btn-primary" onclick="window.openModal('depositModal')">
                    <i class="fa-solid fa-plus"></i> Add Cash
                </button>
                <button class="btn-secondary" onclick="window.openModal('withdrawModal')">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Withdraw
                </button>
            </div>
        </div>

        <div class="section-title"><i class="fa-solid fa-clock-rotate-left"></i> Transaction History</div>
        <div class="card card-body" id="transactionHistory">
            <p style="font-size:12px; color:var(--text-muted); text-align:center;">Abhi koi transaction nahi hua hai.</p>
        </div>
    `;

    updateHeaderWalletDisplay(balance + winnings);
}

function renderProfilePage(container) {
    if (!currentUser) {
        container.innerHTML = `
            <div class="section-title"><i class="fa-solid fa-user"></i> My Profile</div>
            <div class="card card-body" style="text-align:center;">
                <p style="color:var(--text-muted); margin-bottom:15px;">Google Account se Login karke sync karein.</p>
                <button class="btn-primary" onclick="window.handleGoogleLogin()"><i class="fa-brands fa-google"></i> Login with Google</button>
            </div>
        `;
        return;
    }

    const name = currentUser.displayName || 'Booyah Player';
    const email = currentUser.email || '-';
    const photo = currentUser.photoURL || 'https://via.placeholder.com/90';

    container.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-user"></i> My Profile</div>
        <div class="card card-body" style="text-align:center;">
            <div class="profile-avatar-wrap">
                <img src="${photo}" class="profile-avatar" id="userAvatarImg" alt="Avatar">
            </div>
            <h3 style="margin-top:5px;">${name}</h3>
            <p style="font-size:12px; color:var(--text-muted);">${email}</p>

            <div class="form-group" style="margin-top:20px; text-align:left;">
                <label>In-Game Name (IGN)</label>
                <input type="text" id="profileIgn" placeholder="e.g. BooyahKing" value="${currentUser?.ign || ''}">
            </div>
            <div class="form-group" style="text-align:left;">
                <label>In-Game UID</label>
                <input type="text" id="profileUid" placeholder="e.g. 123456789" value="${currentUser?.gameUid || ''}">
            </div>

            <button class="btn-primary" onclick="window.saveProfileData()">Save Profile</button>
            <button class="btn-secondary" onclick="window.handleLogout()" style="margin-top:10px;">Logout</button>
        </div>
    `;
}

// ==========================================
// 4. FIRESTORE LIVE DATA & ACTIONS
// ==========================================

function fetchMatches() {
    const container = document.getElementById('matchesListContainer');
    if (!container) return;

    // Real-time Firestore Listener
    const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            // Fallback mock matches agar Firestore me data empty ho
            currentMatches = [
                {
                    id: "match_01",
                    title: "Bermuda Daily Championship",
                    mode: "SOLO",
                    map: "Bermuda",
                    entryFee: 20,
                    prizePool: 500,
                    perKill: 10,
                    filledSlots: 18,
                    totalSlots: 48,
                    banner: "https://via.placeholder.com/600x200/14171f/ff5500?text=Bermuda+SOLO",
                    status: "UPCOMING"
                },
                {
                    id: "match_02",
                    title: "Purgatory Duo Clash",
                    mode: "DUO",
                    map: "Purgatory",
                    entryFee: 40,
                    prizePool: 1000,
                    perKill: 20,
                    filledSlots: 24,
                    totalSlots: 48,
                    banner: "https://via.placeholder.com/600x200/14171f/ff5500?text=Purgatory+DUO",
                    status: "UPCOMING"
                }
            ];
        } else {
            currentMatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        renderMatchCards(currentMatches, container);
    }, (error) => {
        console.error("Firestore Listen Error:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">Tournaments load nahi ho paaye. Error: ${error.message}</p>`;
    });
}

function renderMatchCards(matches, container) {
    if (matches.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">Koi tournament active nahi hai.</p>`;
        return;
    }

    container.innerHTML = matches.map(m => `
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
                        <span>${m.filledSlots || 0}/${m.totalSlots || 48}</span>
                    </div>
                    <div class="progress-bg">
                        <div class="progress-fill" style="width: ${((m.filledSlots || 0) / (m.totalSlots || 48)) * 100}%"></div>
                    </div>
                </div>
                <button class="btn-primary" onclick="window.viewMatchDetails('${m.id}')">View Details & Register</button>
            </div>
        </div>
    `).join('');
}

window.viewMatchDetails = function(matchId) {
    selectedMatch = currentMatches.find(m => m.id === matchId);
    if (!selectedMatch) return;

    document.getElementById('detBanner').src = selectedMatch.banner || 'https://via.placeholder.com/600x200/14171f/ff5500?text=Tournament';
    document.getElementById('detTitle').innerText = selectedMatch.title || selectedMatch.name;
    document.getElementById('detMode').innerText = `${selectedMatch.mode || 'SOLO'} | ${selectedMatch.map ? selectedMatch.map.toUpperCase() : 'BERMUDA'}`;
    document.getElementById('detPrize').innerText = `₹${selectedMatch.prizePool || 0}`;
    document.getElementById('detEntry').innerText = `₹${selectedMatch.entryFee || 0}`;
    document.getElementById('payout1').innerText = `₹${(selectedMatch.prizePool || 0) * 0.5}`;
    document.getElementById('payout2').innerText = `₹${(selectedMatch.prizePool || 0) * 0.25}`;
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
    if (!selectedMatch) return;

    document.getElementById('modalMatchTitle').innerText = selectedMatch.title || selectedMatch.name;
    document.getElementById('modalMatchMode').innerText = `MODE: ${selectedMatch.mode || 'SOLO'} • ENTRY ₹${selectedMatch.entryFee || 0}`;

    const container = document.getElementById('dynamicFormContainer');
    let formHTML = '';

    const mode = selectedMatch.mode || 'SOLO';
    const count = mode === 'SOLO' ? 1 : mode === 'DUO' ? 2 : 4;
    for (let i = 1; i <= count; i++) {
        formHTML += `
            <div class="player-form-block">
                <h4>Player ${i} Credentials</h4>
                <div class="form-group">
                    <label>In-Game Name (IGN)</label>
                    <input type="text" id="ignP${i}" placeholder="Player ${i} IGN enter karein" value="${i === 1 ? (currentUser?.ign || '') : ''}">
                </div>
                <div class="form-group">
                    <label>Game UID</label>
                    <input type="text" id="uidP${i}" placeholder="Player ${i} UID enter karein" value="${i === 1 ? (currentUser?.gameUid || '') : ''}">
                </div>
            </div>
        `;
    }

    container.innerHTML = formHTML;
    window.openModal('joinModal');
};

window.confirmJoin = async function() {
    if (!currentUser) {
        alert("Pehle profile me jaakar Login karein!");
        window.closeModal('joinModal');
        window.navigate('Profile');
        return;
    }

    alert("Registration Submit ho gayi h!");
    window.closeModal('joinModal');
};

async function fetchLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    if (!container) return;

    try {
        const q = query(collection(db, 'users'), orderBy('winnings', 'desc'));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = `<p style="text-align:center; color:var(--text-muted);">Koi leaderboard data nahi hai.</p>`;
            return;
        }

        container.innerHTML = snap.docs.slice(0, 10).map((docSnap, idx) => {
            const data = docSnap.data();
            return `
                <div class="list-item">
                    <div>
                        <strong>#${idx + 1} ${data.displayName || 'Player'}</strong>
                        <p style="font-size:10px; color:var(--text-muted);">${data.ign || 'N/A'}</p>
                    </div>
                    <strong style="color:var(--green-glow);">₹${data.winnings || 0}</strong>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Leaderboard Error:", err);
    }
}

// Payment & Auth Actions
window.handleGoogleLogin = async function() {
    try {
        await signInWithPopup(auth, googleProvider);
        window.navigate('Profile');
    } catch (err) {
        alert("Login failed: " + err.message);
    }
};

window.handleLogout = async function() {
    await signOut(auth);
    window.navigate('Home');
};

window.startDirectUpiPayment = function() {
    const amount = document.getElementById('depositAmountInput').value;
    if (!amount || amount < 10) {
        alert("Min. ₹10 enter karein!");
        return;
    }

    window.closeModal('depositModal');
    window.openModal('verifyUpiModal');
};

window.submitUpiVerification = function() {
    const utr = document.getElementById('upiUtrInput').value;
    if (!utr || utr.length !== 12) {
        alert("Valid 12-digit UTR enter karein!");
        return;
    }

    alert("UTR verification received! Processing me h.");
    window.closeModal('verifyUpiModal');
};

window.handleWithdrawMethodChange = function() {
    const method = document.getElementById('withdrawMethodSelect').value;
    document.getElementById('withdrawUpiFields').style.display = method === 'UPI' ? 'block' : 'none';
    document.getElementById('withdrawBankFields').style.display = method === 'BANK' ? 'block' : 'none';
};

window.submitWithdrawalRequest = function() {
    const amount = document.getElementById('withdrawAmountInput').value;
    if (!amount || amount < 50) {
        alert("Minimum withdrawal ₹50 hai.");
        return;
    }

    alert("Withdrawal Request bhej di gayi hai!");
    window.closeModal('withdrawModal');
};

window.saveProfileData = async function() {
    const ign = document.getElementById('profileIgn').value;
    const uid = document.getElementById('profileUid').value;

    if (!ign || !uid) {
        alert("IGN aur UID dono fill karein!");
        return;
    }

    if (currentUser && currentUser.uid) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            ign: ign,
            gameUid: uid
        });
        currentUser.ign = ign;
        currentUser.gameUid = uid;
    }

    alert("Profile Save Ho Gayi!");
};

function updateHeaderWalletDisplay(amount) {
    const walletDisplay = document.getElementById('headerWalletDisplay');
    if (walletDisplay) {
        walletDisplay.innerText = `₹${amount}`;
    }
}

// Search & Filter
window.filterMatches = function() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = currentMatches.filter(m => 
        (m.title || m.name || '').toLowerCase().includes(query) || (m.mode || '').toLowerCase().includes(query)
    );
    renderMatchCards(filtered, document.getElementById('matchesListContainer'));
};

window.filterByTag = function(tag, chipBtn) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (chipBtn) chipBtn.classList.add('active');

    if (tag === 'ALL') {
        renderMatchCards(currentMatches, document.getElementById('matchesListContainer'));
    } else {
        const filtered = currentMatches.filter(m => m.mode === tag);
        renderMatchCards(filtered, document.getElementById('matchesListContainer'));
    }
};

// ==========================================
// 5. INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    console.log("Booyah HUB Connected with Firebase Config.");
    window.navigate('Home');
});
