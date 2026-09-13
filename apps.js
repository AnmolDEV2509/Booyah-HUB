import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, onSnapshot, updateDoc, addDoc, 
    getDoc, increment, serverTimestamp, query, where, getDocs, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { 
    getAuth, GoogleAuthProvider, signInWithPopup, 
    createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBd53nUisAs6ZzxKpG0Z-CMeCpfMPqvFTc",
  authDomain: "booyah-hub-e041d.firebaseapp.com",
  projectId: "booyah-hub-e041d",
  storageBucket: "booyah-hub-e041d.firebasestorage.app",
  messagingSenderId: "1007690608229",
  appId: "1:1007690608229:web:7ce6b6d19a6200430ce08c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// App State Management
let currentUser = null;
let tournamentsData = [];
let userJoinedMatches = new Set();
let currentModeFilter = 'ALL';
let currentStatusFilter = 'ALL';
let selectedMatchMode = 'SOLO';
let currentMatchToJoin = null;
let activeMatchEntryFee = 0;
let selectedResultFile = null;
let selectedResultMatchId = null;
let notifEnabled = true;
let activePage = 'Home';
let currentPendingAmount = 0;
let liveAdminUpiId = "yourupiid@okaxis"; 

// Active Timers Tracker
let activeTimers = {};

// Wallet State Management
let unsubscribeWallet = null;
let cachedWalletData = { deposit: 0, winning: 0, total: 0 };

// Fetch Admin Payment UPI
async function fetchSystemPaymentInfo() {
    try {
        const snap = await getDoc(doc(db, "system_settings", "payment_info"));
        if(snap.exists() && snap.data().upiId) {
            liveAdminUpiId = snap.data().upiId;
        }
    } catch(e) {
        console.error("UPI Load Error:", e);
    }
}

// UI Helpers
function updateWalletUI(deposit, winning) {
    const dep = Number(deposit) || 0;
    const win = Number(winning) || 0;
    const total = dep + win;

    cachedWalletData = { deposit: dep, winning: win, total: total };

    const depElem = document.getElementById('depositVal');
    const winElem = document.getElementById('winningVal');
    const totalElem = document.getElementById('totalVal');
    const headerElem = document.getElementById('headerWalletDisplay');

    if (depElem) depElem.innerText = `₹ ${dep.toFixed(2)}`;
    if (winElem) winElem.innerText = `₹ ${win.toFixed(2)}`;
    if (totalElem) totalElem.innerText = `₹ ${total.toFixed(2)}`;
    if (headerElem) headerElem.innerText = `₹ ${total.toFixed(2)}`;
}

function setupWalletListener(uid) {
    if (unsubscribeWallet) unsubscribeWallet();

    unsubscribeWallet = onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            updateWalletUI(data.depositBalance, data.winningBalance);
        } else {
            updateWalletUI(0, 0);
        }
    }, (err) => {
        console.error("Wallet listener error:", err);
    });
}

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    fetchSystemPaymentInfo();
    if (user) {
        setupWalletListener(user.uid);
        await fetchUserRegistrations();
    } else {
        if (unsubscribeWallet) unsubscribeWallet();
        userJoinedMatches.clear();
        updateWalletUI(0, 0);
    }
    window.renderCurrentPage();
});

// Live Announcements Sync
function listenToAnnouncements() {
    onSnapshot(collection(db, "announcements"), (snapshot) => {
        const tickerContent = document.getElementById('tickerContent');
        if (!tickerContent) return;

        let messages = [];
        snapshot.forEach(docSnap => {
            messages.push(docSnap.data().text);
        });

        if (messages.length > 0) {
            tickerContent.innerHTML = messages.map(msg => `🔥 ${msg}`).join(" &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ");
        } else {
            tickerContent.innerText = "🔥 Booyah HUB me aapka swagat hai! Matches join karein aur prizes jeetein!";
        }
    }, (error) => {
        console.error("Announcements Error: ", error);
    });
}

// Fetch Joined Matches
async function fetchUserRegistrations() {
    if(!currentUser) return;
    try {
        const q = query(collection(db, "registrations"), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        userJoinedMatches.clear();
        querySnapshot.forEach((docSnap) => {
            userJoinedMatches.add(docSnap.data().tournamentId);
        });
    } catch (error) {
        console.error("Registrations Sync Error: ", error);
    }
}

// Live Tournaments Sync
function listenToTournaments() {
    onSnapshot(collection(db, "tournaments"), (snapshot) => {
        tournamentsData = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            tournamentsData.push({ 
                id: docSnap.id, 
                ...data,
                isJoined: userJoinedMatches.has(docSnap.id)
            });
        });
        window.renderTournaments();
    }, (error) => {
        console.error("Firebase Live Sync Error: ", error);
    });
}

// Window Global Functions

window.toggleNotif = () => {
    notifEnabled = !notifEnabled;
    const btn = document.getElementById('notifToggle');
    if (btn) btn.style.color = notifEnabled ? 'var(--accent-orange)' : 'var(--text-muted)';
    window.showToast(notifEnabled ? 'Notifications Enabled' : 'Notifications Muted');
};

window.navigate = async (page, element) => {
    if (element) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        element.classList.add('active');
    }
    activePage = page;
    window.renderCurrentPage();
};

window.renderCurrentPage = async () => {
    const content = document.getElementById('content');
    if (!content) return;
    
    if(activePage === 'Home') {
        content.innerHTML = `
            <div class="search-box">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="searchInput" placeholder="Search tournaments..." oninput="window.renderTournaments()">
            </div>

            <div class="filter-chips">
                <div class="chip active mode-chip" onclick="window.setModeFilter('ALL', this)">All Modes</div>
                <div class="chip mode-chip" onclick="window.setModeFilter('SOLO', this)">Solo</div>
                <div class="chip mode-chip" onclick="window.setModeFilter('DUO', this)">Duo</div>
                <div class="chip mode-chip" onclick="window.setModeFilter('SQUAD', this)">Squad</div>
                <div class="chip mode-chip" onclick="window.setModeFilter('CS', this)">Clash Squad</div>
            </div>

            <div class="filter-chips status-chips">
                <div class="chip active status-chip" onclick="window.setStatusFilter('ALL', this)">All Matches</div>
                <div class="chip status-chip" onclick="window.setStatusFilter('JOINED', this)">⚔️ Joined Matches</div>
                <div class="chip status-chip" onclick="window.setStatusFilter('UPCOMING', this)">Upcoming</div>
                <div class="chip status-chip" onclick="window.setStatusFilter('LIVE', this)">Live</div>
                <div class="chip status-chip" onclick="window.setStatusFilter('COMPLETED', this)">Completed</div>
            </div>

            <div class="section-title"><i class="fa-solid fa-fire"></i> Available Arena Matches</div>
            <div id="tourneys">Connecting to Firestore...</div>
        `;

        if(currentUser) await fetchUserRegistrations();
        listenToAnnouncements();
        listenToTournaments();

    } else if(activePage === 'Leaderboard') {
        content.innerHTML = `
            <div class="section-title"><i class="fa-solid fa-trophy"></i> Top Arena Players</div>
            <div class="card" style="padding:15px;">
                <div class="list-item">
                    <div><strong>#1. OP_LEGEND_99</strong><br><span style="font-size:11px; color:var(--text-muted)">14 Booyahs</span></div>
                    <span style="color:var(--accent-orange); font-weight:700;">₹2,400 Won</span>
                </div>
            </div>
        `;
    } else if(activePage === 'Wallet') {
        content.innerHTML = `
            <div class="section-title"><i class="fa-solid fa-wallet"></i> My Wallet</div>
            <div class="card" style="text-align: center; padding: 25px 20px;">
                <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Total Available Balance</span>
                <h1 style="font-size: 36px; margin: 8px 0;" id="totalVal">₹ ${cachedWalletData.total.toFixed(2)}</h1>

                <div class="wallet-stats-grid">
                    <div class="wallet-stat-card">
                        <span>Deposit Cash</span>
                        <h3 id="depositVal" style="color: var(--text-main);">₹ ${cachedWalletData.deposit.toFixed(2)}</h3>
                    </div>
                    <div class="wallet-stat-card">
                        <span>Winnings</span>
                        <h3 id="winningVal" style="color: var(--green-glow);">₹ ${cachedWalletData.winning.toFixed(2)}</h3>
                    </div>
                </div>

                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button class="btn-primary" onclick="window.openDepositModal()">Deposit Money</button>
                    <button class="btn-secondary" onclick="window.openWithdrawModal()">Withdraw</button>
                </div>
            </div>
        `;
        updateWalletUI(cachedWalletData.deposit, cachedWalletData.winning);
    } else if(activePage === 'Profile') {
        if(!currentUser) {
            window.renderAuthScreen(content);
        } else {
            content.innerHTML = `
                <div class="section-title"><i class="fa-solid fa-user"></i> My Profile</div>
                <div class="card" style="text-align: center; padding: 20px;">
                    <i class="fa-solid fa-circle-user" style="font-size:50px; color:var(--accent-orange); margin-bottom:10px;"></i>
                    <h3>${currentUser.displayName || 'Gamer User'}</h3>
                    <p style="color: var(--text-muted); font-size: 12px; margin-top:4px;">${currentUser.email}</p>
                    <p style="color: var(--text-muted); font-size: 10px; margin-top:2px;">UID: ${currentUser.uid}</p>
                    <button class="btn-primary btn-logout" onclick="window.handleLogout()">Logout Account</button>
                </div>
            `;
        }
    }
    updateWalletUI(cachedWalletData.deposit, cachedWalletData.winning);
};

window.renderAuthScreen = (container) => {
    container.innerHTML = `
        <div class="section-title"><i class="fa-solid fa-lock"></i> User Authentication</div>
        <div class="card" style="padding: 20px;">
            <div class="form-group">
                <label>Email Address</label>
                <input type="email" id="authEmail" placeholder="Enter your email">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="authPassword" placeholder="••••••••">
            </div>
            <button class="btn-primary" onclick="window.handleEmailLogin()">Sign In</button>
            <button class="btn-secondary" style="width:100%; margin-top:8px;" onclick="window.handleEmailSignup()">Create Account</button>
            <div style="text-align:center; font-size:11px; color:var(--text-muted); margin: 10px 0;">OR</div>
            <button class="btn-primary btn-google" onclick="window.handleGoogleLogin()">
                <i class="fa-brands fa-google" style="color:#4285F4;"></i> Sign In with Google
            </button>
        </div>
    `;
};

window.handleGoogleLogin = async () => {
    try {
        await signInWithPopup(auth, googleProvider);
        window.showToast("Logged in with Google!");
    } catch (err) {
        alert("Google Auth Failed: " + err.message);
    }
};

window.handleEmailLogin = async () => {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.showToast("Login Successful!");
    } catch (err) {
        alert("Login Error: " + err.message);
    }
};

window.handleEmailSignup = async () => {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPassword').value;
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        window.showToast("Account Created!");
    } catch (err) {
        alert("Signup Error: " + err.message);
    }
};

window.handleLogout = async () => {
    await signOut(auth);
    window.showToast("Logged Out");
    window.navigate('Home', document.querySelector('.nav-btn'));
};

window.setModeFilter = (mode, el) => {
    document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    currentModeFilter = mode;
    window.renderTournaments();
};

window.setStatusFilter = (status, el) => {
    document.querySelectorAll('.status-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    currentStatusFilter = status;
    window.renderTournaments();
};

window.startTimer = (id, targetTime) => {
    if (activeTimers[id]) {
        clearInterval(activeTimers[id]);
    }

    const updateTimer = () => {
        const timerEl = document.getElementById(`timer-${id}`);
        if (!timerEl) {
            clearInterval(activeTimers[id]);
            delete activeTimers[id];
            return;
        }

        const diff = targetTime - Date.now();
        if (diff <= 0) {
            timerEl.innerText = "Match Live!";
            timerEl.style.color = "var(--green-glow)";
            clearInterval(activeTimers[id]);
            delete activeTimers[id];
        } else {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            if (hours > 0) {
                timerEl.innerText = `Starts in: ${hours}h ${mins}m ${secs}s`;
            } else {
                timerEl.innerText = `Starts in: ${mins}m ${secs}s`;
            }
        }
    };

    updateTimer();
    activeTimers[id] = setInterval(updateTimer, 1000);
};

window.renderTournaments = () => {
    const list = document.getElementById('tourneys');
    if (!list) return;

    const searchQuery = document.getElementById('searchInput')?.value.toLowerCase() || '';

    const filtered = tournamentsData.filter(item => {
        const matchesMode = (currentModeFilter === 'ALL') || (item.mode?.toUpperCase() === currentModeFilter);
        let matchesStatus = true;
        if (currentStatusFilter === 'JOINED') {
            matchesStatus = item.isJoined === true;
        } else if (currentStatusFilter !== 'ALL') {
            matchesStatus = item.status?.toUpperCase() === currentStatusFilter;
        }
        const matchesSearch = item.name?.toLowerCase().includes(searchQuery);
        return matchesMode && matchesStatus && matchesSearch;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div class="card" style="text-align:center; padding: 20px; color: var(--text-muted);">No matches found.</div>`;
        return;
    }

    list.innerHTML = "";
    filtered.forEach(data => {
        const total = data.totalSlots || 48;
        const joined = data.joinedSlots || 0;
        const percent = Math.round((joined / total) * 100);
        const status = data.status || 'UPCOMING';
        const banner = data.banner || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop';

        let statusBadgeClass = 'badge-upcoming';
        if (status === 'LIVE') statusBadgeClass = 'badge-live';
        else if (status === 'COMPLETED') statusBadgeClass = 'badge-completed';

        let roomBoxHTML = '';
        if (data.isJoined && data.roomId) {
            roomBoxHTML = `
                <div class="room-box" onclick="event.stopPropagation()">
                    <div class="room-row">
                        <span>Room ID: <strong style="color:var(--green-glow);">${data.roomId}</strong></span>
                        <button class="copy-btn" onclick="window.copyToClipboard('${data.roomId}', 'Room ID')"><i class="fa-regular fa-copy"></i> Copy</button>
                    </div>
                    <div class="room-row">
                        <span>Password: <strong style="color:var(--green-glow);">${data.roomPass || 'N/A'}</strong></span>
                        <button class="copy-btn" onclick="window.copyToClipboard('${data.roomPass || ''}', 'Password')"><i class="fa-regular fa-copy"></i> Copy</button>
                    </div>
                </div>
            `;
        }

        let actionBtnHTML = '';
        if (data.isJoined) {
            if (status === 'LIVE' || status === 'COMPLETED') {
                actionBtnHTML = `<button class="btn-primary btn-success" onclick="event.stopPropagation(); window.openResultModal('${data.id}', '${data.roomId || ''}')"><i class="fa-solid fa-trophy"></i> Upload Result / Screenshot</button>`;
            } else {
                actionBtnHTML = `<button class="btn-primary" style="background:#222; border:1px solid var(--green-glow); color:var(--green-glow);" disabled><i class="fa-solid fa-circle-check"></i> Registered</button>`;
            }
        } else if (status === 'COMPLETED') {
            actionBtnHTML = `<button class="btn-primary" disabled style="opacity:0.5">Match Finished</button>`;
        } else if (joined >= total) {
            actionBtnHTML = `<button class="btn-primary" disabled style="opacity:0.5">Match Full</button>`;
        } else {
            actionBtnHTML = `<button class="btn-primary" onclick="event.stopPropagation(); window.openModal('${data.id}', '${data.name}', '${data.mode}', ${data.entry || 0})">Join Match</button>`;
        }

        list.innerHTML += `
            <div class="card" style="cursor: pointer;" onclick="window.openModal('${data.id}', '${data.name}', '${data.mode}', ${data.entry || 0})">
                <img src="${banner}" class="card-banner" alt="Match Banner">
                <div class="card-body">
                    <div class="card-header">
                        <div class="card-title">${data.name}</div>
                        <span class="badge-status ${statusBadgeClass}">${status}</span>
                    </div>
                    
                    <div class="timer-bar">
                        <i class="fa-regular fa-clock"></i> <span id="timer-${data.id}">Calculating...</span>
                    </div>

                    <div class="card-details">
                        <div class="detail-item"><span>Prize</span><strong>₹${data.prize}</strong></div>
                        <div class="detail-item"><span>Entry</span><strong>₹${data.entry}</strong></div>
                        <div class="detail-item"><span>Mode</span><strong>${data.mode}</strong></div>
                    </div>

                    ${roomBoxHTML}

                    <div class="slot-tracker">
                        <div class="slot-info">
                            <span>Slots Filled</span>
                            <span>${joined}/${total}</span>
                        </div>
                        <div class="progress-bg">
                            <div class="progress-fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>

                    ${actionBtnHTML}
                </div>
            </div>
        `;

        if (data.startTime) {
            let timeStamp;
            if (typeof data.startTime === 'object' && data.startTime.seconds) {
                timeStamp = data.startTime.seconds * 1000;
            } else if (typeof data.startTime === 'string' || typeof data.startTime === 'number') {
                timeStamp = new Date(data.startTime).getTime();
            }

            if (timeStamp) {
                window.startTimer(data.id, timeStamp);
            }
        }
    });
};

window.openModal = (matchId, name, mode, entryFee) => {
    if(!currentUser) {
        alert("Please Login first to join tournaments!");
        activePage = 'Profile';
        window.renderCurrentPage();
        return;
    }

    currentMatchToJoin = matchId;
    activeMatchEntryFee = entryFee || 0;
    selectedMatchMode = (mode || 'SOLO').toUpperCase();
    document.getElementById('modalMatchTitle').innerText = name;
    document.getElementById('modalMatchMode').innerText = `MODE: ${selectedMatchMode}`;
    
    const container = document.getElementById('dynamicFormContainer');
    container.innerHTML = "";

    let playerCounts = 1;
    if (selectedMatchMode === 'DUO') playerCounts = 2;
    else if (selectedMatchMode === 'SQUAD' || selectedMatchMode === 'CS') playerCounts = 4;

    for(let i = 1; i <= playerCounts; i++) {
        container.innerHTML += `
            <div class="player-form-block">
                <h4>Player ${i} Details</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>In-Game Name (IGN)</label>
                        <input type="text" id="p_ign_${i}" placeholder="e.g. OP_Gamer${i}">
                    </div>
                    <div class="form-group">
                        <label>Game UID</label>
                        <input type="number" id="p_uid_${i}" placeholder="e.g. 1029384${i}">
                    </div>
                </div>
            </div>
        `;
    }

    document.getElementById('joinModal').classList.add('active');
};

window.closeModal = (modalId) => {
    document.getElementById(modalId).classList.remove('active');
};

window.openDepositModal = () => {
    if (!currentUser) {
        alert("Pehle Login karein!");
        return;
    }
    document.getElementById('depositModal').classList.add('active');
};

window.startDirectUpiPayment = () => {
    const amountVal = parseFloat(document.getElementById('depositAmountInput').value);

    if (!amountVal || amountVal < 10) {
        alert("Kam se kam ₹10 enter karo!");
        return;
    }

    currentPendingAmount = amountVal;
    const payeeName = "Booyah HUB Esports";
    const upiDeepLink = `upi://pay?pa=${liveAdminUpiId}&pn=${encodeURIComponent(payeeName)}&am=${amountVal}&cu=INR&tn=BooyahHub_Deposit`;

    window.location.href = upiDeepLink;

    window.closeModal('depositModal');
    setTimeout(() => {
        document.getElementById('verifyUpiModal').classList.add('active');
    }, 1200);
};

window.submitUpiVerification = async () => {
    const utrVal = document.getElementById('upiUtrInput').value.trim();

    if (utrVal.length < 12) {
        alert("Kripya 12-digit ka sahi UTR / Ref Number enter karein!");
        return;
    }

    try {
        window.showToast("Submitting payment...");

        await addDoc(collection(db, "deposit_requests"), {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            amount: currentPendingAmount,
            utrNumber: utrVal,
            status: "PENDING",
            createdAt: serverTimestamp()
        });

        window.closeModal('verifyUpiModal');
        alert("Deposit request submit ho gayi hai! Admin verify karke balance add kar dega.");
        document.getElementById('upiUtrInput').value = "";
    } catch (err) {
        alert("Submission Error: " + err.message);
    }
};

window.openWithdrawModal = () => {
    if (!currentUser) {
        alert("Pehle Login karein!");
        return;
    }
    document.getElementById('withdrawModal').classList.add('active');
};

window.handleWithdrawMethodChange = () => {
    const method = document.getElementById('withdrawMethodSelect').value;
    if (method === 'UPI') {
        document.getElementById('withdrawUpiFields').style.display = 'block';
        document.getElementById('withdrawBankFields').style.display = 'none';
    } else {
        document.getElementById('withdrawUpiFields').style.display = 'none';
        document.getElementById('withdrawBankFields').style.display = 'block';
    }
};

window.submitWithdrawalRequest = async () => {
    const amount = parseFloat(document.getElementById('withdrawAmountInput').value);
    const method = document.getElementById('withdrawMethodSelect').value;

    if (!amount || amount < 50) {
        alert("Minimum Withdrawal Amount ₹50 hai!");
        return;
    }

    let paymentDetails = {};
    if (method === 'UPI') {
        const upiId = document.getElementById('withdrawUpiId').value.trim();
        if (!upiId || !upiId.includes('@')) {
            alert("Kripya valid UPI ID enter karein!");
            return;
        }
        paymentDetails = { upiId: upiId };
    } else {
        const bankName = document.getElementById('withdrawBankName').value.trim();
        const accNo = document.getElementById('withdrawAccNo').value.trim();
        const ifsc = document.getElementById('withdrawIfsc').value.trim();

        if (!bankName || !accNo || !ifsc) {
            alert("Kripya poori Bank details bharein!");
            return;
        }
        paymentDetails = { bankName, accNo, ifsc };
    }

    const userRef = doc(db, "users", currentUser.uid);

    try {
        window.showToast("Processing Withdrawal...");

        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists()) {
                throw new Error("User Account nahi mila!");
            }

            const userData = userSnap.data();
            const winningBalance = Number(userData.winningBalance) || 0;

            if (winningBalance < amount) {
                throw new Error("Aapke paas पर्याप्त Winning Balance nahi hai!");
            }

            transaction.update(userRef, {
                winningBalance: winningBalance - amount
            });

            const withdrawRef = doc(collection(db, "withdrawal_requests"));
            transaction.set(withdrawRef, {
                userId: currentUser.uid,
                userEmail: currentUser.email,
                amount: amount,
                method: method,
                paymentDetails: paymentDetails,
                status: "PENDING",
                createdAt: serverTimestamp()
            });
        });

        window.closeModal('withdrawModal');
        alert("Withdrawal request submit ho gayi hai!");
        document.getElementById('withdrawAmountInput').value = "";
        document.getElementById('withdrawUpiId').value = "";
    } catch (err) {
        alert("Withdrawal Error: " + err.message);
    }
};

window.confirmJoin = async () => {
    let playerCounts = 1;
    if (selectedMatchMode === 'DUO') playerCounts = 2;
    else if (selectedMatchMode === 'SQUAD' || selectedMatchMode === 'CS') playerCounts = 4;

    let playersDataArr = [];
    for(let i = 1; i <= playerCounts; i++) {
        const ign = document.getElementById(`p_ign_${i}`)?.value.trim();
        const uid = document.getElementById(`p_uid_${i}`)?.value.trim();

        if(!ign || !uid) {
            alert(`Please enter valid details for Player ${i}`);
            return;
        }
        playersDataArr.push({ ign, uid });
    }

    const userRef = doc(db, "users", currentUser.uid);
    const tourneyRef = doc(db, "tournaments", currentMatchToJoin);

    try {
        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            const tourneySnap = await transaction.get(tourneyRef);

            if (!userSnap.exists() || !tourneySnap.exists()) {
                throw new Error("Match ya User data nahi mila!");
            }

            const userData = userSnap.data();
            let deposit = Number(userData.depositBalance) || 0;
            let winning = Number(userData.winningBalance) || 0;
            const totalBalance = deposit + winning;

            if (totalBalance < activeMatchEntryFee) {
                throw new Error("Wallet mein sufficient balance nahi hai! Pehle deposit karein.");
            }

            let feeRemaining = activeMatchEntryFee;

            if (deposit >= feeRemaining) {
                deposit -= feeRemaining;
                feeRemaining = 0;
            } else {
                feeRemaining -= deposit;
                deposit = 0;
                winning -= feeRemaining;
            }

            transaction.update(userRef, { 
                depositBalance: deposit,
                winningBalance: winning 
            });
            transaction.update(tourneyRef, { 
                joinedSlots: increment(1) 
            });

            const regRef = doc(collection(db, "registrations"));
            transaction.set(regRef, {
                tournamentId: currentMatchToJoin,
                userId: currentUser.uid,
                userEmail: currentUser.email,
                players: playersDataArr,
                joinedAt: serverTimestamp()
            });
        });

        userJoinedMatches.add(currentMatchToJoin);
        window.closeModal('joinModal');
        window.showToast("Successfully Registered!");
        window.renderTournaments();
    } catch (err) {
        alert("Registration Failed: " + err.message);
    }
};

window.openResultModal = (matchId, roomId) => {
    selectedResultMatchId = matchId;
    document.getElementById('resultRoomId').value = roomId || matchId;
    document.getElementById('fileSelectedName').innerText = "";
    selectedResultFile = null;
    document.getElementById('resultModal').classList.add('active');
};

window.handleFileSelect = (input) => {
    if (input.files && input.files[0]) {
        selectedResultFile = input.files[0];
        document.getElementById('fileSelectedName').innerText = `Selected: ${selectedResultFile.name}`;
    }
};

window.submitResult = async () => {
    if(!selectedResultFile) return alert("Please select a screenshot file first!");

    try {
        window.showToast("Uploading Screenshot...");
        const fileRef = ref(storage, `results/${selectedResultMatchId}_${currentUser.uid}_${Date.now()}`);
        const snapshot = await uploadBytes(fileRef, selectedResultFile);
        const downloadURL = await getDownloadURL(snapshot.ref);

        await addDoc(collection(db, "results"), {
            tournamentId: selectedResultMatchId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            screenshotUrl: downloadURL,
            submittedAt: serverTimestamp()
        });

        window.closeModal('resultModal');
        window.showToast("Result Submitted Successfully!");
    } catch (err) {
        alert("Failed to upload screenshot: " + err.message);
    }
};

window.copyToClipboard = (text, label) => {
    if(!text) return;
    navigator.clipboard.writeText(text);
    window.showToast(`${label} Copied!`);
};

window.showToast = (msg) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${msg}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
};

// Initial Render Setup
window.renderCurrentPage();
