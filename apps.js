import { db, auth } from './firebase-config.js';
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

// Global App State
let currentUser = null;
let currentMatches = [];
let selectedMatch = null;

// ==========================================
// 1. GLOBAL NAVIGATION & UI HANDLERS
// ==========================================

window.navigate = function(pageName, btnElement) {
    console.log("Navigating to:", pageName);
    
    // Bottom Navigation Active Class Change
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
// 2. PAGE RENDERERS
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
                <p style="margin-top:10px;">Matches loading ho rhe hain...</p>
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
    const name = currentUser ? (currentUser.displayName || 'Booyah Player') : 'Guest User';
    const email = currentUser ? (currentUser.email || 'guest@booyahhub.com') : 'Log in for cloud save';
    const photo = currentUser ? (currentUser.photoURL || 'https://via.placeholder.com/90') : 'https://via.placeholder.com/90';

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
        </div>
    `;
}

// ==========================================
// 3. FIRESTORE & DYNAMIC UI LOGIC
// ==========================================

async function fetchMatches() {
    const container = document.getElementById('matchesListContainer');
    if (!container) return;

    try {
        // Fallback Local Match Data (Firestore Sync ke saath replace kar sakte hain)
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

        renderMatchCards(currentMatches, container);
    } catch (error) {
        console.error("Error fetching matches:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">Tournaments load nahi ho paaye.</p>`;
    }
}

function renderMatchCards(matches, container) {
    if (matches.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">Koi tournament nahi mila.</p>`;
        return;
    }

    container.innerHTML = matches.map(m => `
        <div class="card">
            <img src="${m.banner}" class="card-banner" alt="Match Banner">
            <div class="card-body">
                <div class="card-header">
                    <div class="card-title">${m.title}</div>
                    <span class="badge-status badge-upcoming">${m.status}</span>
                </div>
                <div class="card-details">
                    <div class="detail-item"><span>PRIZE POOL</span><strong>₹${m.prizePool}</strong></div>
                    <div class="detail-item"><span>ENTRY</span><strong>₹${m.entryFee}</strong></div>
                    <div class="detail-item"><span>MODE</span><strong>${m.mode}</strong></div>
                </div>
                <div class="slot-tracker">
                    <div class="slot-info">
                        <span>Slots Filled</span>
                        <span>${m.filledSlots}/${m.totalSlots}</span>
                    </div>
                    <div class="progress-bg">
                        <div class="progress-fill" style="width: ${(m.filledSlots / m.totalSlots) * 100}%"></div>
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

    document.getElementById('detBanner').src = selectedMatch.banner;
    document.getElementById('detTitle').innerText = selectedMatch.title;
    document.getElementById('detMode').innerText = `${selectedMatch.mode} | ${selectedMatch.map.toUpperCase()}`;
    document.getElementById('detPrize').innerText = `₹${selectedMatch.prizePool}`;
    document.getElementById('detEntry').innerText = `₹${selectedMatch.entryFee}`;
    document.getElementById('payout1').innerText = `₹${selectedMatch.prizePool * 0.5}`;
    document.getElementById('payout2').innerText = `₹${selectedMatch.prizePool * 0.25}`;
    document.getElementById('payoutKill').innerText = `₹${selectedMatch.perKill}`;
    document.getElementById('detSlotText').innerText = `${selectedMatch.filledSlots}/${selectedMatch.totalSlots} Filled`;

    // Populate seats grid
    const seatsGrid = document.getElementById('seatsGrid');
    seatsGrid.innerHTML = '';
    for (let i = 1; i <= selectedMatch.totalSlots; i++) {
        const isFilled = i <= selectedMatch.filledSlots;
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

    document.getElementById('modalMatchTitle').innerText = selectedMatch.title;
    document.getElementById('modalMatchMode').innerText = `MODE: ${selectedMatch.mode} • ENTRY ₹${selectedMatch.entryFee}`;

    const container = document.getElementById('dynamicFormContainer');
    let formHTML = '';

    const count = selectedMatch.mode === 'SOLO' ? 1 : selectedMatch.mode === 'DUO' ? 2 : 4;
    for (let i = 1; i <= count; i++) {
        formHTML += `
            <div class="player-form-block">
                <h4>Player ${i} Credentials</h4>
                <div class="form-group">
                    <label>In-Game Name (IGN)</label>
                    <input type="text" id="ignP${i}" placeholder="Player ${i} IGN enter karein">
                </div>
                <div class="form-group">
                    <label>Game UID</label>
                    <input type="text" id="uidP${i}" placeholder="Player ${i} UID enter karein">
                </div>
            </div>
        `;
    }

    container.innerHTML = formHTML;
    window.openModal('joinModal');
};

window.confirmJoin = function() {
    alert("Registration Submit ho gayi h!");
    window.closeModal('joinModal');
};

async function fetchLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    if (!container) return;

    const dummyLeaders = [
        { name: "Alpha_FF", kills: 120, winnings: 2400 },
        { name: "Ninja_Pro", kills: 98, winnings: 1900 },
        { name: "Viper_07", kills: 85, winnings: 1500 }
    ];

    container.innerHTML = dummyLeaders.map((player, idx) => `
        <div class="list-item">
            <div>
                <strong>#${idx + 1} ${player.name}</strong>
                <p style="font-size:10px; color:var(--text-muted);">${player.kills} Kills</p>
            </div>
            <strong style="color:var(--green-glow);">₹${player.winnings}</strong>
        </div>
    `).join('');
}

// Payment & Withdrawal
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

window.saveProfileData = function() {
    const ign = document.getElementById('profileIgn').value;
    const uid = document.getElementById('profileUid').value;

    if (!ign || !uid) {
        alert("IGN aur UID dono fill karein!");
        return;
    }

    if (!currentUser) currentUser = {};
    currentUser.ign = ign;
    currentUser.gameUid = uid;

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
        m.title.toLowerCase().includes(query) || m.mode.toLowerCase().includes(query)
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
// 4. INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    console.log("Booyah HUB App Engine Active.");
    window.navigate('Home');
});
