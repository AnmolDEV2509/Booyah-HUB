import { db, auth, messaging, googleProvider } from "./firebase-config.js";
import { 
    signInWithPopup, 
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile
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
import { 
    onMessage 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

// STATE MANAGEMENT
let currentUser = null;
let userProfile = null;
let tournamentsData = [];
let activeModeFilter = 'ALL';
let currentSelectedMatch = null;
let authMode = 'login'; // 'login' or 'signup'

// EXPLICIT GLOBAL BINDINGS
window.switchTab = function(tabName) {
    const tabs = ['tournaments', 'wallet', 'leaderboard', 'profile'];
    
    tabs.forEach(t => {
        const viewEl = document.getElementById(`view-${t}`);
        const btnEl = document.getElementById(`tab-${t}`);
        const mobileBtnEl = document.getElementById(`bottom-nav-${t}`);
        
        if (viewEl) viewEl.classList.add("hidden");
        if (btnEl) btnEl.className = "tab-btn inactive-tab px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 whitespace-nowrap";
        if (mobileBtnEl) mobileBtnEl.className = "mobile-nav-btn inactive-mobile-tab py-1.5 rounded-xl flex flex-col items-center justify-center gap-1 transition";
    });

    const activeView = document.getElementById(`view-${tabName}`);
    const activeBtn = document.getElementById(`tab-${tabName}`);
    const activeMobileBtn = document.getElementById(`bottom-nav-${tabName}`);

    if (activeView) activeView.classList.remove("hidden");
    if (activeBtn) activeBtn.className = "tab-btn active-tab px-4 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 whitespace-nowrap";
    if (activeMobileBtn) activeMobileBtn.className = "mobile-nav-btn active-mobile-tab py-1.5 rounded-xl flex flex-col items-center justify-center gap-1 transition";
};

window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("hidden");
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("hidden");
};

window.toggleAuthMode = function(mode) {
    authMode = mode;
    const loginTab = document.getElementById("toggleLoginTabBtn");
    const signupTab = document.getElementById("toggleSignupTabBtn");
    const nameGroup = document.getElementById("authNameGroup");
    const submitBtn = document.getElementById("authSubmitBtn");

    if (mode === 'signup') {
        if (loginTab) loginTab.className = "py-2 rounded-lg text-slate-400 transition";
        if (signupTab) signupTab.className = "py-2 rounded-lg bg-orange-500 text-slate-950 transition";
        if (nameGroup) nameGroup.classList.remove("hidden");
        if (submitBtn) submitBtn.textContent = "Create Account";
    } else {
        if (loginTab) loginTab.className = "py-2 rounded-lg bg-orange-500 text-slate-950 transition";
        if (signupTab) signupTab.className = "py-2 rounded-lg text-slate-400 transition";
        if (nameGroup) nameGroup.classList.add("hidden");
        if (submitBtn) submitBtn.textContent = "Login";
    }
};

window.filterMode = function(mode) {
    activeModeFilter = mode;
    document.querySelectorAll(".filter-chip").forEach(chip => {
        if (chip.textContent.trim().toUpperCase() === mode) {
            chip.className = "filter-chip active-chip px-3.5 py-2 rounded-lg text-xs font-bold border transition bg-orange-500 text-slate-950 border-orange-500";
        } else {
            chip.className = "filter-chip inactive-chip px-3.5 py-2 rounded-lg text-xs font-bold border transition bg-slate-900 text-slate-400 border-slate-800";
        }
    });
    renderTournaments();
};

// IMPROVED OPEN MATCH DETAILS MODAL
window.openMatchDetails = function(matchId) {
    currentSelectedMatch = tournamentsData.find(t => t.id === matchId);
    if (!currentSelectedMatch) return;

    const t = currentSelectedMatch;

    // Helper formatting
    const matchTime = t.matchTime ? (t.matchTime.toDate ? new Date(t.matchTime.toDate()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : t.matchTime) : "To Be Announced";

    const titleEl = document.getElementById("modalMatchTitle");
    const prizeEl = document.getElementById("modalPrizePool");
    const killEl = document.getElementById("modalPerKill");
    const entryEl = document.getElementById("modalEntryFee");

    if (titleEl) titleEl.textContent = t.title || "Match Details";
    if (prizeEl) prizeEl.textContent = `₹${t.prizePool || 0}`;
    if (killEl) killEl.textContent = `₹${t.perKill || 0}`;
    if (entryEl) entryEl.textContent = `₹${t.entryFee || 0}`;

    // Additional dynamic details injection (Map, Mode, Time, Rules)
    const extraInfoContainer = document.getElementById("modalExtraDetails");
    if (extraInfoContainer) {
        extraInfoContainer.innerHTML = `
            <div class="grid grid-cols-2 gap-2 text-xs bg-slate-950/90 p-3 rounded-xl border border-slate-800/80 mb-4">
                <div><span class="text-slate-500 font-semibold">Map:</span> <span class="text-slate-200 font-bold">${t.map || 'Bermuda'}</span></div>
                <div><span class="text-slate-500 font-semibold">Mode:</span> <span class="text-slate-200 font-bold">${t.mode || 'SOLO'}</span></div>
                <div><span class="text-slate-500 font-semibold">Type:</span> <span class="text-slate-200 font-bold">${t.type || 'Esports Custom'}</span></div>
                <div><span class="text-slate-500 font-semibold">Time:</span> <span class="text-amber-400 font-bold">${matchTime}</span></div>
            </div>
            ${t.roomId ? `
            <div class="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl text-center mb-4">
                <div class="text-[11px] text-emerald-400 font-bold uppercase">Room Credentials</div>
                <div class="text-xs text-slate-200 font-mono mt-1">ID: <b>${t.roomId}</b> \vert{} Pass: <b>${t.roomPass || '123'}</b></div>
            </div>` : ''}
        `;
    }

    // Seat Grid Rendering
    const seatGrid = document.getElementById("modalSeatGrid");
    if (seatGrid) {
        seatGrid.innerHTML = "";
        const totalSlots = t.totalSlots || 48;
        const filledSlots = t.registeredSlots || 0;

        for (let i = 1; i <= totalSlots; i++) {
            const isFilled = i <= filledSlots;
            const dot = document.createElement("div");
            dot.className = `w-full aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold ${
                isFilled 
                ? 'bg-slate-800 text-slate-600 border border-slate-700/50 cursor-not-allowed' 
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500 hover:text-slate-950 cursor-pointer transition'
            }`;
            dot.textContent = i;
            seatGrid.appendChild(dot);
        }
    }

    const btnRegister = document.getElementById("btnProceedRegister");
    if (btnRegister) {
        btnRegister.onclick = () => {
            window.closeModal("matchModal");
            openRegistrationModal();
        };
    }

    window.openModal("matchModal");
};

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    setupAuthListeners();
    setupSearchAndFilters();
    listenTournaments();
    listenLeaderboard();
    setupForms();
    setupMessagingListeners();
});

// AUTHENTICATION LOGIC
function setupAuthListeners() {
    const googleBtn = document.getElementById("googleAuthBtn");
    if (googleBtn) {
        googleBtn.addEventListener("click", async () => {
            try {
                await signInWithPopup(auth, googleProvider);
                window.closeModal("authModal");
            } catch (err) {
                alert("Google Auth Error: " + err.message);
            }
        });
    }

    const authForm = document.getElementById("authEmailForm");
    if (authForm) {
        authForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("authEmailInput").value.trim();
            const password = document.getElementById("authPasswordInput").value.trim();
            const name = document.getElementById("authNameInput").value.trim();

            try {
                if (authMode === 'signup') {
                    if (!name) {
                        alert("Please enter your full name.");
                        return;
                    }
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    await updateProfile(userCredential.user, { displayName: name });
                    await syncUserProfile(userCredential.user, name);
                    alert("Account Created Successfully!");
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                    alert("Logged In Successfully!");
                }
                window.closeModal("authModal");
                document.getElementById("authEmailForm").reset();
            } catch (err) {
                alert("Authentication Failed: " + err.message);
            }
        });
    }

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const profileNav = document.getElementById("userProfileNav");
        const openAuthBtn = document.getElementById("openAuthBtn");

        if (user) {
            if (openAuthBtn) openAuthBtn.classList.add("hidden");
            if (profileNav) profileNav.classList.remove("hidden");
            
            await syncUserProfile(user);
            listenUserRealtimeData(user.uid);
        } else {
            if (openAuthBtn) openAuthBtn.classList.remove("hidden");
            if (profileNav) profileNav.classList.add("hidden");
            userProfile = null;
        }
    });
}

async function syncUserProfile(user, customDisplayName = null) {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
        const initialData = {
            uid: user.uid,
            name: customDisplayName || user.displayName || "Gamer",
            email: user.email,
            photoURL: user.photoURL || 'https://via.placeholder.com/150',
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
            
            const navBal = document.getElementById("navWalletBalance");
            const depBal = document.getElementById("depositBalanceText");
            const winBal = document.getElementById("winningsBalanceText");
            const totBal = document.getElementById("totalBalanceText");

            if (navBal) navBal.textContent = `₹${total}`;
            if (depBal) depBal.textContent = `₹${userProfile.depositBalance || 0}`;
            if (winBal) winBal.textContent = `₹${userProfile.winningsBalance || 0}`;
            if (totBal) totBal.textContent = `₹${total}`;

            const displayAvatar = userProfile.photoURL || currentUser?.photoURL || 'https://via.placeholder.com/150';
            const avatar = document.getElementById("userAvatar");
            const profileAvatar = document.getElementById("profileCardAvatar");
            const profileName = document.getElementById("profileCardName");
            const profileEmail = document.getElementById("profileCardEmail");

            if (avatar) avatar.src = displayAvatar;
            if (profileAvatar) profileAvatar.src = displayAvatar;
            if (profileName) profileName.textContent = userProfile.name || currentUser?.displayName || 'Gamer';
            if (profileEmail) profileEmail.textContent = userProfile.email || currentUser?.email;

            const ignInput = document.getElementById("profileIgn");
            const uidInput = document.getElementById("profileUid");
            const photoUrlInput = document.getElementById("profilePhotoUrl");

            if (ignInput && userProfile.ign) ignInput.value = userProfile.ign;
            if (uidInput && userProfile.characterUid) uidInput.value = userProfile.characterUid;
            if (photoUrlInput && userProfile.photoURL) photoUrlInput.value = userProfile.photoURL;
        }
    });

    const qTx = query(collection(db, "transactions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(10));
    onSnapshot(qTx, (snapshot) => {
        const tbody = document.getElementById("transactionHistoryTable");
        if (!tbody) return;
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

// REALTIME TOURNAMENTS (DETAILED RENDER)
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
    const searchInput = document.getElementById("tournamentSearch");
    if (!grid) return;

    const searchQuery = searchInput ? searchInput.value.toLowerCase() : "";

    const filtered = tournamentsData.filter(t => {
        const matchesMode = activeModeFilter === 'ALL' || (t.mode || 'SOLO').toUpperCase() === activeModeFilter;
        const matchesSearch = (t.title || "").toLowerCase().includes(searchQuery) || (t.map || "").toLowerCase().includes(searchQuery);
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

        const formattedTime = t.matchTime ? (t.matchTime.toDate ? new Date(t.matchTime.toDate()).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : t.matchTime) : "TBA";

        grid.innerHTML += `
            <div class="bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-2xl overflow-hidden transition backdrop-blur-sm flex flex-col justify-between">
                <div>
                    <div class="relative h-44 bg-slate-950 overflow-hidden">
                        <img src="${t.bannerUrl || 'https://via.placeholder.com/600x300'}" class="w-full h-full object-cover">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40"></div>
                        <span class="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-extrabold text-orange-400 border border-orange-500/20">${t.mode || 'SOLO'}</span>
                        <span class="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-bold text-slate-300 border border-slate-800">${t.status || 'UPCOMING'}</span>
                        
                        <div class="absolute bottom-2 left-3 right-3 flex justify-between items-center text-[11px] text-slate-300">
                            <span class="bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800"><i class="fa-solid fa-map-location-dot text-orange-400 mr-1"></i> ${t.map || 'Bermuda'}</span>
                            <span class="bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800"><i class="fa-regular fa-clock text-amber-400 mr-1"></i> ${formattedTime}</span>
                        </div>
                    </div>
                    
                    <div class="p-4 space-y-3">
                        <h3 class="font-bold text-slate-100 text-base leading-snug line-clamp-1">${t.title || 'Free Fire Tournament'}</h3>
                        
                        <div class="grid grid-cols-3 gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
                            <div>
                                <span class="text-[9px] text-slate-500 block font-bold uppercase">Prize Pool</span>
                                <span class="text-xs font-extrabold text-amber-400">₹${t.prizePool || 0}</span>
                            </div>
                            <div>
                                <span class="text-[9px] text-slate-500 block font-bold uppercase">Per Kill</span>
                                <span class="text-xs font-extrabold text-emerald-400">₹${t.perKill || 0}</span>
                            </div>
                            <div>
                                <span class="text-[9px] text-slate-500 block font-bold uppercase">Entry</span>
                                <span class="text-xs font-extrabold text-orange-400">₹${t.entryFee || 0}</span>
                            </div>
                        </div>

                        <div class="space-y-1">
                            <div class="flex justify-between text-[11px] font-semibold">
                                <span class="text-slate-400">Spots Filled</span>
                                <span class="text-slate-200">${filledSlots}/${maxSlots}</span>
                            </div>
                            <div class="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                                <div class="bg-gradient-to-r from-orange-500 to-amber-400 h-1.5 rounded-full transition-all duration-300" style="width: ${fillPercentage}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="p-4 pt-0">
                    <button onclick="openMatchDetails('${t.id}')" class="w-full bg-slate-800 hover:bg-orange-500 hover:text-slate-950 text-slate-100 font-bold py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-2 active:scale-95">
                        View Details & Join <i class="fa-solid fa-arrow-right text-[10px]"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

function setupSearchAndFilters() {
    const searchInput = document.getElementById("tournamentSearch");
    if (searchInput) searchInput.addEventListener("input", renderTournaments);
}

// REGISTRATION MODAL
function openRegistrationModal() {
    if (!currentUser) {
        window.openModal("authModal");
        return;
    }

    const container = document.getElementById("dynamicPlayerInputs");
    if (!container) return;
    container.innerHTML = "";
    const mode = (currentSelectedMatch.mode || 'SOLO').toUpperCase(); 
    const playerCount = mode === 'SQUAD' ? 4 : (mode === 'DUO' ? 2 : 1);

    const feeEl = document.getElementById("registerDeductFee");
    if (feeEl) feeEl.textContent = `₹${currentSelectedMatch.entryFee || 0}`;

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

    window.openModal("registerModal");
}

// FORMS SETUP
function setupForms() {
    const profForm = document.getElementById("profileForm");
    if (profForm) {
        profForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!currentUser) {
                window.openModal("authModal");
                return;
            }

            const ign = document.getElementById("profileIgn").value.trim();
            const characterUid = document.getElementById("profileUid").value.trim();
            const customAvatarUrl = document.getElementById("profilePhotoUrl") ? document.getElementById("profilePhotoUrl").value.trim() : "";

            try {
                const updatePayload = { ign, characterUid };
                if (customAvatarUrl) {
                    updatePayload.photoURL = customAvatarUrl;
                }

                await setDoc(doc(db, "users", currentUser.uid), updatePayload, { merge: true });
                alert("Profile Updated Successfully!");
            } catch (err) {
                alert("Error updating profile: " + err.message);
            }
        });
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await signOut(auth);
                alert("Logged out successfully!");
                window.switchTab('tournaments');
            } catch (err) {
                alert("Logout Error: " + err.message);
            }
        });
    }

    const regForm = document.getElementById("tournamentRegistrationForm");
    if (regForm) {
        regForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!currentUser || !currentSelectedMatch) return;

            const entryFee = currentSelectedMatch.entryFee || 0;

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

                    let deposit = userData.depositBalance || 0;
                    let winnings = userData.winningsBalance || 0;
                    let totalBal = deposit + winnings;

                    if (totalBal < entryFee) {
                        throw new Error("Insufficient Wallet Balance!");
                    }

                    if ((tourneyData.registeredSlots || 0) >= (tourneyData.totalSlots || 48)) {
                        throw new Error("Tournament is FULL!");
                    }

                    let remainingFee = entryFee;
                    if (deposit >= remainingFee) {
                        deposit -= remainingFee;
                    } else {
                        remainingFee -= deposit;
                        deposit = 0;
                        winnings -= remainingFee;
                    }

                    transaction.update(userRef, { depositBalance: deposit, winningsBalance: winnings });
                    transaction.update(tournamentRef, { registeredSlots: (tourneyData.registeredSlots || 0) + 1 });

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

                alert("Registration Successful!");
                window.closeModal("registerModal");
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const addForm = document.getElementById("addMoneyForm");
    if (addForm) {
        addForm.addEventListener("submit", async (e) => {
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

            alert("Deposit Request Submitted!");
            window.closeModal("addMoneyModal");
            document.getElementById("addMoneyForm").reset();
        });
    }

    const drawForm = document.getElementById("withdrawForm");
    if (drawForm) {
        drawForm.addEventListener("submit", async (e) => {
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

            alert("Withdrawal Request Submitted!");
            window.closeModal("withdrawModal");
            document.getElementById("withdrawForm").reset();
        });
    }
}

// REALTIME LEADERBOARD
function listenLeaderboard() {
    const q = query(collection(db, "users"), orderBy("winningsBalance", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById("leaderboardList");
        if (!list) return;
        list.innerHTML = "";
        let rank = 1;

        if (snapshot.empty) {
            list.innerHTML = `<div class="text-center text-slate-500 py-4">No top players listed yet.</div>`;
            return;
        }

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
                        <img src="${u.photoURL || 'https://via.placeholder.com/150'}" class="w-10 h-10 rounded-xl border border-slate-800 object-cover">
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

// PUSH MESSAGING
function setupMessagingListeners() {
    if ('serviceWorker' in navigator) {
        onMessage(messaging, (payload) => {
            if (payload.notification) {
                alert(`🔔 ${payload.notification.title}\n${payload.notification.body}`);
            }
        });
    }
}
