import { db, auth, googleProvider } from "./firebase-config.js";
import { 
    signInWithPopup, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    onSnapshot, 
    runTransaction, 
    serverTimestamp, 
    query, 
    where, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// STATE MANAGEMENT
let currentUser = null;
let userProfile = null;
let tournamentsData = [];
let activeModeFilter = 'ALL';
let currentSelectedMatch = null;

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    setupAuthListeners();
    setupTabSwitching();
    setupSearchAndFilters();
    listenTournaments();
    listenLeaderboard();
    setupForms();
});

// 1. AUTHENTICATION
function setupAuthListeners() {
    const googleBtn = document.getElementById("googleLoginBtn");
    googleBtn.addEventListener("click", async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            alert("Login Failed: " + err.message);
        }
    });

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const profileNav = document.getElementById("userProfileNav");
        const loginBtn = document.getElementById("googleLoginBtn");

        if (user) {
            loginBtn.classList.add("hidden");
            profileNav.classList.remove("hidden");
            document.getElementById("userAvatar").src = user.photoURL || 'https://via.placeholder.com/150';
            document.getElementById("profileCardAvatar").src = user.photoURL || 'https://via.placeholder.com/150';
            document.getElementById("profileCardName").textContent = user.displayName || 'Gamer';
            document.getElementById("profileCardEmail").textContent = user.email;

            // Sync user document
            await syncUserProfile(user);
            listenUserRealtimeData(user.uid);
        } else {
            loginBtn.classList.remove("hidden");
            profileNav.classList.add("hidden");
        }
    });
}

async function syncUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
        const initialData = {
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            depositBalance: 0,
            winningsBalance: 0,
            ign: "",
            characterUid: "",
            createdAt: serverTimestamp()
        };
        await setDoc(userRef, initialData);
    }
}

function listenUserRealtimeData(uid) {
    onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            userProfile = docSnap.data();
            const total = (userProfile.depositBalance || 0) + (userProfile.winningsBalance || 0);
            
            document.getElementById("navWalletBalance").textContent = `₹${total}`;
            document.getElementById("depositBalanceText").textContent = `₹${userProfile.depositBalance || 0}`;
            document.getElementById("winningsBalanceText").textContent = `₹${userProfile.winningsBalance || 0}`;
            document.getElementById("totalBalanceText").textContent = `₹${total}`;

            // Populate profile inputs
            if (userProfile.ign) document.getElementById("profileIgn").value = userProfile.ign;
            if (userProfile.characterUid) document.getElementById("profileUid").value = userProfile.characterUid;
        }
    });

    // Listen to User Transactions
    const qTx = query(collection(db, "transactions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(10));
    onSnapshot(qTx, (snapshot) => {
        const tbody = document.getElementById("transactionHistoryTable");
        tbody.innerHTML = "";
        if (snapshot.empty) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No transactions found.</td></tr>`;
            return;
        }
        snapshot.forEach(docSnap => {
            const tx = docSnap.data();
            const dateStr = tx.createdAt ? new Date(tx.createdAt.toDate()).toLocaleDateString() : 'Pending';
            
            let statusColor = 'text-amber-400 bg-amber-500/10';
            if (tx.status === 'SUCCESS' || tx.status === 'APPROVED') statusColor = 'text-emerald-400 bg-emerald-500/10';
            if (tx.status === 'REJECTED' || tx.status === 'FAILED') statusColor = 'text-rose-400 bg-rose-500/10';

            tbody.innerHTML += `
                <tr>
                    <td class="p-3 font-semibold text-slate-200">${tx.type}</td>
                    <td class="p-3 font-bold ${tx.type === 'DEPOSIT' || tx.type === 'WINNING' ? 'text-emerald-400' : 'text-slate-200'}">₹${tx.amount}</td>
                    <td class="p-3"><span class="px-2 py-1 rounded-md text-[10px] font-bold ${statusColor}">${tx.status}</span></td>
                    <td class="p-3 text-slate-500 text-xs">${dateStr}</td>
                </tr>
            `;
        });
    });
}

// 2. MATCH DISCOVERY & FILTERS
function listenTournaments() {
    onSnapshot(collection(db, "tournaments"), (snapshot) => {
        tournamentsData = [];
        snapshot.forEach(docSnap => {
            tournamentsData.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderTournaments();
    });
}

function renderTournaments() {
    const grid = document.getElementById("tournamentsGrid");
    const searchQuery = document.getElementById("tournamentSearch").value.toLowerCase();

    const filtered = tournamentsData.filter(t => {
        const matchesMode = activeModeFilter === 'ALL' || t.mode === activeModeFilter;
        const matchesSearch = t.title.toLowerCase().includes(searchQuery);
        return matchesMode && matchesSearch;
    });

    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500">No tournaments active right now.</div>`;
        return;
    }

    filtered.forEach(t => {
        const filledSlots = t.registeredSlots || 0;
        const maxSlots = t.totalSlots || 48;
        const fillPercentage = Math.min(100, Math.round((filledSlots / maxSlots) * 100));

        grid.innerHTML += `
            <div class="bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-2xl overflow-hidden transition backdrop-blur-sm flex flex-col justify-between">
                <div>
                    <div class="relative h-40 bg-slate-950 overflow-hidden">
                        <img src="${t.bannerUrl || 'https://via.placeholder.com/600x300'}" class="w-full h-full object-cover">
                        <span class="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-extrabold text-orange-400 border border-orange-500/20">${t.mode}</span>
                        <span class="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-bold text-slate-300 border border-slate-800">${t.status || 'UPCOMING'}</span>
                    </div>
                    <div class="p-5 space-y-4">
                        <h3 class="font-bold text-slate-100 text-lg leading-snug">${t.title}</h3>
                        
                        <div class="grid grid-cols-3 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 text-center">
                            <div>
                                <span class="text-[10px] text-slate-500 block font-bold uppercase">Prize Pool</span>
                                <span class="text-xs font-extrabold text-amber-400">₹${t.prizePool}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-slate-500 block font-bold uppercase">Per Kill</span>
                                <span class="text-xs font-extrabold text-emerald-400">₹${t.perKill}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-slate-500 block font-bold uppercase">Entry</span>
                                <span class="text-xs font-extrabold text-orange-400">₹${t.entryFee}</span>
                            </div>
                        </div>

                        <!-- Slot Tracking Bar -->
                        <div class="space-y-1.5">
                            <div class="flex justify-between text-xs font-semibold">
                                <span class="text-slate-400">Spots Filled</span>
                                <span class="text-slate-200">${filledSlots}/${maxSlots}</span>
                            </div>
                            <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                                <div class="bg-gradient-to-r from-orange-500 to-amber-400 h-2 rounded-full transition-all duration-300" style="width: ${fillPercentage}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="p-5 pt-0">
                    <button onclick="openMatchDetails('${t.id}')" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-2">
                        View & Join <i class="fa-solid fa-arrow-right text-[10px]"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

function setupSearchAndFilters() {
    document.getElementById("tournamentSearch").addEventListener("input", renderTournaments);
}

window.filterMode = (mode) => {
    activeModeFilter = mode;
    document.querySelectorAll(".filter-chip").forEach(chip => {
        if (chip.textContent === mode) {
            chip.className = "filter-chip active-chip px-3.5 py-2 rounded-lg text-xs font-bold border transition";
        } else {
            chip.className = "filter-chip inactive-chip px-3.5 py-2 rounded-lg text-xs font-bold border transition";
        }
    });
    renderTournaments();
};

// 3. MATCH DETAILS & INTERACTIVE SEAT GRID
window.openMatchDetails = (matchId) => {
    currentSelectedMatch = tournamentsData.find(t => t.id === matchId);
    if (!currentSelectedMatch) return;

    document.getElementById("modalMatchTitle").textContent = currentSelectedMatch.title;
    document.getElementById("modalPrizePool").textContent = `₹${currentSelectedMatch.prizePool}`;
    document.getElementById("modalPerKill").textContent = `₹${currentSelectedMatch.perKill}`;
    document.getElementById("modalEntryFee").textContent = `₹${currentSelectedMatch.entryFee}`;

    // Render Seats Grid
    const seatGrid = document.getElementById("modalSeatGrid");
    seatGrid.innerHTML = "";
    const totalSlots = currentSelectedMatch.totalSlots || 48;
    const filledSlots = currentSelectedMatch.registeredSlots || 0;

    for (let i = 1; i <= totalSlots; i++) {
        const isFilled = i <= filledSlots;
        const dot = document.createElement("div");
        dot.className = `w-full aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold ${
            isFilled ? 'bg-slate-800 text-slate-600 border border-slate-700/50' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500 hover:text-slate-950 cursor-pointer transition'
        }`;
        dot.textContent = i;
        seatGrid.appendChild(dot);
    }

    document.getElementById("btnProceedRegister").onclick = () => {
        closeModal("matchModal");
        openRegistrationModal();
    };

    openModal("matchModal");
};

// 4. SMART TOURNAMENT REGISTRATION (ATOMIC TRANSACTION)
function openRegistrationModal() {
    if (!currentUser) {
        alert("Please Google Login to register for tournaments!");
        return;
    }

    const container = document.getElementById("dynamicPlayerInputs");
    container.innerHTML = "";
    const mode = currentSelectedMatch.mode; // SOLO, DUO, SQUAD
    const playerCount = mode === 'SQUAD' ? 4 : (mode === 'DUO' ? 2 : 1);

    document.getElementById("registerDeductFee").textContent = `₹${currentSelectedMatch.entryFee}`;

    for (let i = 1; i <= playerCount; i++) {
        const isSelf = i === 1;
        const defaultIgn = isSelf ? (userProfile?.ign || '') : '';
        const defaultUid = isSelf ? (userProfile?.characterUid || '') : '';

        container.innerHTML += `
            <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <span class="text-[11px] font-bold text-orange-400 uppercase">Player ${i} Details</span>
                <div class="grid grid-cols-2 gap-2">
                    <input type="text" id="regIgn_${i}" value="${defaultIgn}" required placeholder="In-Game Name (IGN)" class="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200">
                    <input type="text" id="regUid_${i}" value="${defaultUid}" required placeholder="Character UID" class="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200">
                </div>
            </div>
        `;
    }

    openModal("registerModal");
}

function setupForms() {
    // Registration Submission with Atomic Firestore Transaction
    document.getElementById("tournamentRegistrationForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser || !currentSelectedMatch) return;

        const entryFee = currentSelectedMatch.entryFee;

        try {
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, "users", currentUser.uid);
                const tournamentRef = doc(db, "tournaments", currentSelectedMatch.id);

                const userDoc = await transaction.get(userRef);
                const tourneyDoc = await transaction.get(tournamentRef);

                if (!userDoc.exists()) throw new Error("User profile not found!");
                if (!tourneyDoc.exists()) throw new Error("Tournament does not exist!");

                const userData = userDoc.data();
                const tourneyData = tourneyDoc.data();

                // Balance Deduct logic (Deposit balance first, then Winnings balance)
                let deposit = userData.depositBalance || 0;
                let winnings = userData.winningsBalance || 0;
                let totalBal = deposit + winnings;

                if (totalBal < entryFee) {
                    throw new Error("Insufficient Wallet Balance! Add funds to join.");
                }

                if (tourneyData.registeredSlots >= tourneyData.totalSlots) {
                    throw new Error("Tournament is already FULL!");
                }

                let remainingFee = entryFee;
                if (deposit >= remainingFee) {
                    deposit -= remainingFee;
                } else {
                    remainingFee -= deposit;
                    deposit = 0;
                    winnings -= remainingFee;
                }

                // Execute Atomic Updates
                transaction.update(userRef, {
                    depositBalance: deposit,
                    winningsBalance: winnings
                });

                transaction.update(tournamentRef, {
                    registeredSlots: (tourneyData.registeredSlots || 0) + 1
                });

                // Record Registration Tx
                const txRef = doc(collection(db, "transactions"));
                transaction.set(txRef, {
                    userId: currentUser.uid,
                    type: "REGISTRATION",
                    amount: entryFee,
                    status: "SUCCESS",
                    tournamentId: currentSelectedMatch.id,
                    createdAt: serverTimestamp()
                });
            });

            alert("Registration Successful! Best of luck!");
            closeModal("registerModal");
        } catch (err) {
            alert(err.message);
        }
    });

    // Profile Form Update
    document.getElementById("profileForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const ign = document.getElementById("profileIgn").value.trim();
        const characterUid = document.getElementById("profileUid").value.trim();

        await setDoc(doc(db, "users", currentUser.uid), { ign, characterUid }, { merge: true });
        alert("In-Game Details Updated!");
    });

    // Deposit UTR Form Submission
    document.getElementById("addMoneyForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const amount = parseFloat(document.getElementById("addAmount").value);
        const utr = document.getElementById("addUtr").value.trim();

        const txRef = doc(collection(db, "transactions"));
        await setDoc(txRef, {
            userId: currentUser.uid,
            type: "DEPOSIT",
            amount: amount,
            utr: utr,
            status: "PENDING",
            createdAt: serverTimestamp()
        });

        alert("Deposit Request Submitted! It will be verified shortly.");
        closeModal("addMoneyModal");
        document.getElementById("addMoneyForm").reset();
    });

    // Withdraw Form Submission
    document.getElementById("withdrawForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const amount = parseFloat(document.getElementById("withdrawAmount").value);
        const method = document.getElementById("withdrawMethod").value;
        const details = document.getElementById("withdrawDetails").value.trim();

        if (amount > (userProfile?.winningsBalance || 0)) {
            alert("Insufficient Winnings balance!");
            return;
        }

        const txRef = doc(collection(db, "transactions"));
        await setDoc(txRef, {
            userId: currentUser.uid,
            type: "WITHDRAWAL",
            amount: amount,
            method: method,
            details: details,
            status: "PENDING",
            createdAt: serverTimestamp()
        });

        alert("Withdrawal request created!");
        closeModal("withdrawModal");
        document.getElementById("withdrawForm").reset();
    });
}

// 5. LEADERBOARD SYSTEM
function listenLeaderboard() {
    const q = query(collection(db, "users"), orderBy("winningsBalance", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById("leaderboardList");
        list.innerHTML = "";
        let rank = 1;

        snapshot.forEach((docSnap) => {
            const u = docSnap.data();
            let badgeClass = "bg-slate-800 text-slate-400";
            if (rank === 1) badgeClass = "bg-amber-500 text-slate-950 font-black";
            if (rank === 2) badgeClass = "bg-slate-300 text-slate-950 font-black";
            if (rank === 3) badgeClass = "bg-amber-700 text-slate-100 font-black";

            list.innerHTML += `
                <div class="flex items-center justify-between p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl">
                    <div class="flex items-center gap-4">
                        <span class="w-8 h-8 rounded-lg flex items-center justify-center text-xs ${badgeClass}">#${rank}</span>
                        <img src="${u.photoURL || 'https://via.placeholder.com/150'}" class="w-10 h-10 rounded-xl border border-slate-800">
                        <div>
                            <div class="font-bold text-slate-100 text-sm">${u.name || 'Anonymous Player'}</div>
                            <div class="text-[11px] text-slate-500">IGN: ${u.ign || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs text-slate-400">Total Winnings</div>
                        <div class="font-extrabold text-amber-400 text-sm">₹${u.winningsBalance || 0}</div>
                    </div>
                </div>
            `;
            rank++;
        });
    });
}

// TAB NAVIGATION HELPERS
window.switchTab = (tabName) => {
    ['tournaments', 'wallet', 'leaderboard', 'profile'].forEach(t => {
        document.getElementById(`view-${t}`).classList.add("hidden");
        const btn = document.getElementById(`tab-${t}`);
        btn.className = "tab-btn inactive-tab px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 whitespace-nowrap";
    });

    document.getElementById(`view-${tabName}`).classList.remove("hidden");
    const activeBtn = document.getElementById(`tab-${tabName}`);
    activeBtn.className = "tab-btn active-tab px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 whitespace-nowrap";
};

// MODAL UTILITIES
window.openModal = (id) => document.getElementById(id).classList.remove("hidden");
window.closeModal = (id) => document.getElementById(id).classList.add("hidden");
