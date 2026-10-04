import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, doc, onSnapshot, runTransaction, 
    query, orderBy, limit, serverTimestamp, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCDnwGV_rW7BFjivz_QJ7yCPej7ypdI36Y",
  authDomain: "booyahhub2509.firebaseapp.com",
  projectId: "booyahhub2509",
  storageBucket: "booyahhub2509.firebasestorage.app",
  messagingSenderId: "524409836628",
  appId: "1:524409836628:web:fa99832124c5d9862949c1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Global Application State
let currentUser = null;
let userData = null;
let tournamentsData = [];
let currentSelectedMatch = null;
let activeAuthMode = 'login'; // 'login' or 'signup'

// Extract Referrer UID from URL (?ref=USER_UID)
const urlParams = new URLSearchParams(window.location.search);
const referrerUid = urlParams.get('ref');

// --- HELPER FUNCTION: DATE/TIME FORMATTER ---
function formatMatchTime(timeVal) {
    if (!timeVal) return "To Be Announced";
    
    try {
        if (timeVal && typeof timeVal.toDate === 'function') {
            return timeVal.toDate().toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }
        
        const dateObj = new Date(timeVal);
        if (!isNaN(dateObj.getTime())) {
            return dateObj.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }
    } catch (e) {
        console.error("Time parsing error:", e);
    }
    
    return String(timeVal);
}

// --- SHAREABLE LINK UTILITIES ---
window.copyShareLink = function(matchId, event) {
    if (event) event.stopPropagation();
    const shareUrl = `${window.location.origin}${window.location.pathname}#match?id=${matchId}`;
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert("Match link copied to clipboard!");
        }).catch(err => {
            prompt("Copy this match link:", shareUrl);
        });
    } else {
        prompt("Copy this match link:", shareUrl);
    }
};

window.copyReferralLink = function() {
    const refInput = document.getElementById("referralLinkInput");
    if (refInput && currentUser) {
        navigator.clipboard.writeText(refInput.value).then(() => {
            alert("Referral link copied! Share with your friends to earn points! 🚀");
        }).catch(() => {
            prompt("Copy your referral link:", refInput.value);
        });
    } else {
        alert("Please login first to get your referral link!");
    }
};

function handleUrlHashMatch() {
    const hash = window.location.hash;
    if (hash && hash.includes("#match?id=")) {
        const matchId = hash.split("#match?id=")[1];
        if (matchId && tournamentsData.length > 0) {
            const foundMatch = tournamentsData.find(t => t.id === matchId);
            if (foundMatch) {
                openMatchDetails(matchId);
            }
        }
    }
}

// --- MODAL UTILITIES ---
window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("hidden");
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("hidden");
    if (modalId === 'matchModal' && window.location.hash.includes("#match?id=")) {
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }
};

// --- TAB SWITCHER ---
window.switchTab = function(tabName) {
    const views = ['tournaments', 'wallet', 'leaderboard', 'profile'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');

        const tabBtn = document.getElementById(`tab-${v}`);
        if (tabBtn) {
            tabBtn.classList.remove('active-tab', 'text-orange-500', 'border-orange-500');
            tabBtn.classList.add('inactive-tab', 'text-slate-400');
        }

        const bottomBtn = document.getElementById(`bottom-nav-${v}`);
        if (bottomBtn) {
            bottomBtn.classList.remove('active-mobile-tab', 'text-orange-500');
            bottomBtn.classList.add('inactive-mobile-tab', 'text-slate-400');
        }
    });

    const targetView = document.getElementById(`view-${tabName}`);
    if (targetView) targetView.classList.remove('hidden');

    const activeTabBtn = document.getElementById(`tab-${tabName}`);
    if (activeTabBtn) {
        activeTabBtn.classList.add('active-tab', 'text-orange-500');
        activeTabBtn.classList.remove('inactive-tab', 'text-slate-400');
    }

    const activeBottomBtn = document.getElementById(`bottom-nav-${tabName}`);
    if (activeBottomBtn) {
        activeBottomBtn.classList.add('active-mobile-tab', 'text-orange-500');
        activeBottomBtn.classList.remove('inactive-mobile-tab', 'text-slate-400');
    }
};

// --- AUTH SYSTEM ---
window.toggleAuthMode = function(mode) {
    activeAuthMode = mode;
    const nameGroup = document.getElementById("authNameGroup");
    const submitBtn = document.getElementById("authSubmitBtn");
    const loginTab = document.getElementById("toggleLoginTabBtn");
    const signupTab = document.getElementById("toggleSignupTabBtn");

    if (mode === 'signup') {
        if (nameGroup) nameGroup.classList.remove("hidden");
        if (submitBtn) submitBtn.textContent = "Create Account";
        if (signupTab) signupTab.className = "py-2 rounded-lg bg-orange-500 text-slate-950 transition";
        if (loginTab) loginTab.className = "py-2 rounded-lg text-slate-400 transition";
    } else {
        if (nameGroup) nameGroup.classList.add("hidden");
        if (submitBtn) submitBtn.textContent = "Login";
        if (loginTab) loginTab.className = "py-2 rounded-lg bg-orange-500 text-slate-950 transition";
        if (signupTab) signupTab.className = "py-2 rounded-lg text-slate-400 transition";
    }
};

// Listen Auth State
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const openAuthBtn = document.getElementById("openAuthBtn");
    const userProfileNav = document.getElementById("userProfileNav");

    if (user) {
        if (openAuthBtn) openAuthBtn.classList.add("hidden");
        if (userProfileNav) userProfileNav.classList.remove("hidden");
        closeModal("authModal");

        // Sync Profile Data
        const userRef = doc(db, "users", user.uid);
        onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
                userData = snap.data();
                updateUIWithUserData();
            } else {
                const newUserData = {
                    uid: user.uid,
                    name: user.displayName || "Gamer",
                    email: user.email,
                    photoURL: user.photoURL || "https://via.placeholder.com/150",
                    depositBalance: 0,
                    winningsBalance: 0,
                    referralCount: 0,
                    referredBy: (referrerUid && referrerUid !== user.uid) ? referrerUid : null,
                    ign: "",
                    gameUid: "",
                    createdAt: serverTimestamp()
                };
                setDoc(userRef, newUserData);

                if (referrerUid && referrerUid !== user.uid) {
                    processReferralReward(referrerUid, user.uid);
                }
            }
        });

        listenUserTransactions(user.uid);
    } else {
        userData = null;
        if (openAuthBtn) openAuthBtn.classList.remove("hidden");
        if (userProfileNav) userProfileNav.classList.add("hidden");
        updateUIWithUserData();
    }
});

// REFERRAL REWARD TRANSACTION (+5 Points & Max 6 Limit)
async function processReferralReward(referrerId, newUserId) {
    const referralLogRef = doc(db, "referrals", newUserId);
    const referrerRef = doc(db, "users", referrerId);

    try {
        await runTransaction(db, async (transaction) => {
            const refLogSnap = await transaction.get(referralLogRef);
            if (refLogSnap.exists()) return;

            const referrerSnap = await transaction.get(referrerRef);
            if (!referrerSnap.exists()) return;

            const referrerData = referrerSnap.data();
            const currentCount = referrerData.referralCount || 0;

            // Strict limit of 6 referrals
            if (currentCount >= 6) {
                console.log("Referral limit reached for this user (Max 6 allowed).");
                return;
            }

            const currentDep = referrerData.depositBalance || 0;

            transaction.update(referrerRef, {
                depositBalance: currentDep + 5,
                referralCount: currentCount + 1
            });

            transaction.set(referralLogRef, {
                referrerUid: referrerId,
                referredUid: newUserId,
                rewardAmount: 5,
                createdAt: serverTimestamp()
            });

            const txRef = doc(collection(db, "transactions"));
            transaction.set(txRef, {
                userId: referrerId,
                type: "REFERRAL_REWARD",
                amount: 5,
                status: "SUCCESS",
                createdAt: serverTimestamp()
            });
        });
        console.log("Referral Bonus Successfully Added!");
    } catch (e) {
        console.error("Referral process error:", e);
    }
}

// Update UI with User Profile Data
function updateUIWithUserData() {
    const navWallet = document.getElementById("navWalletBalance");
    const totalBal = document.getElementById("totalBalanceText");
    const depBal = document.getElementById("depositBalanceText");
    const winBal = document.getElementById("winningsBalanceText");
    const navAvatar = document.getElementById("userAvatar");

    const profileName = document.getElementById("profileCardName");
    const profileEmail = document.getElementById("profileCardEmail");
    const profileAvatar = document.getElementById("profileCardAvatar");
    const inputIgn = document.getElementById("profileIgn");
    const inputUid = document.getElementById("profileUid");

    const refInput = document.getElementById("referralLinkInput");
    const refBadge = document.getElementById("referralBadge");

    if (userData) {
        const deposit = userData.depositBalance || 0;
        const winnings = userData.winningsBalance || 0;
        const total = deposit + winnings;

        if (navWallet) navWallet.textContent = `₹${total}`;
        if (totalBal) totalBal.textContent = `₹${total}`;
        if (depBal) depBal.textContent = `₹${deposit}`;
        if (winBal) winBal.textContent = `₹${winnings}`;

        if (navAvatar) navAvatar.src = userData.photoURL || "https://via.placeholder.com/150";
        if (profileAvatar) profileAvatar.src = userData.photoURL || "https://via.placeholder.com/150";
        if (profileName) profileName.textContent = userData.name || "Gamer";
        if (profileEmail) profileEmail.textContent = userData.email || "";

        if (inputIgn && !inputIgn.value) inputIgn.value = userData.ign || "";
        if (inputUid && !inputUid.value) inputUid.value = userData.gameUid || "";

        if (refInput && currentUser) {
            refInput.value = `${window.location.origin}${window.location.pathname}?ref=${currentUser.uid}`;
        }

        if (refBadge) {
            const count = userData.referralCount || 0;
            if (count >= 6) {
                refBadge.className = "px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] font-extrabold rounded-md border border-rose-500/20";
                refBadge.textContent = "Limit Reached (6/6)";
            } else {
                refBadge.className = "px-2 py-0.5 bg-orange-500/10 text-orange-400 text-[10px] font-extrabold rounded-md border border-orange-500/20";
                refBadge.textContent = `${count} / 6 Used`;
            }
        }
    } else {
        if (navWallet) navWallet.textContent = "₹0";
        if (totalBal) totalBal.textContent = "₹0";
        if (depBal) depBal.textContent = "₹0";
        if (winBal) winBal.textContent = "₹0";
        if (refInput) refInput.value = "Login to see your link";
    }
}

// Auth Form Handlers
document.getElementById("authEmailForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("authEmailInput").value;
    const password = document.getElementById("authPasswordInput").value;
    const name = document.getElementById("authNameInput")?.value || "Gamer";

    try {
        if (activeAuthMode === 'signup') {
            const res = await createUserWithEmailAndPassword(auth, email, password);
            const newUid = res.user.uid;

            await setDoc(doc(db, "users", newUid), {
                uid: newUid,
                name: name,
                email: email,
                photoURL: "https://via.placeholder.com/150",
                depositBalance: 0,
                winningsBalance: 0,
                referralCount: 0,
                referredBy: (referrerUid && referrerUid !== newUid) ? referrerUid : null,
                ign: "",
                gameUid: "",
                createdAt: serverTimestamp()
            });

            if (referrerUid && referrerUid !== newUid) {
                await processReferralReward(referrerUid, newUid);
            }
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        closeModal("authModal");
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById("googleAuthBtn")?.addEventListener("click", async () => {
    try {
        await signInWithPopup(auth, googleProvider);
        closeModal("authModal");
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth);
});

// Profile Update Form
document.getElementById("profileForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return alert("Please login first!");

    const ign = document.getElementById("profileIgn").value;
    const uid = document.getElementById("profileUid").value;
    const photoURL = document.getElementById("profilePhotoUrl").value;

    try {
        const updatePayload = { ign, gameUid: uid };
        if (photoURL) updatePayload.photoURL = photoURL;

        await setDoc(doc(db, "users", currentUser.uid), updatePayload, { merge: true });
        alert("Profile details updated successfully!");
    } catch (err) {
        alert(err.message);
    }
});

// --- TOURNAMENTS REALTIME LISTENER & FILTERING ---
function listenTournaments() {
    const tournamentsRef = collection(db, "tournaments");
    
    onSnapshot(tournamentsRef, (snapshot) => {
        tournamentsData = [];
        snapshot.forEach(docSnap => {
            tournamentsData.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        tournamentsData.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });

        renderTournamentsGrid(tournamentsData);
        handleUrlHashMatch();
    }, (error) => {
        console.error("Error fetching tournaments:", error);
        const grid = document.getElementById("tournamentsGrid");
        if (grid) {
            grid.innerHTML = `<div class="col-span-full text-center py-12 text-rose-400 text-xs font-bold">Error loading matches: ${error.message}</div>`;
        }
    });
}
listenTournaments();

window.filterMode = function(mode) {
    const buttons = document.querySelectorAll(".filter-chip");
    buttons.forEach(btn => {
        if (btn.textContent === mode) {
            btn.className = "filter-chip active-chip px-3.5 py-2 rounded-lg text-xs font-bold border transition bg-orange-500 text-slate-950 border-orange-500";
        } else {
            btn.className = "filter-chip inactive-chip px-3.5 py-2 rounded-lg text-xs font-bold border transition bg-slate-900 text-slate-400 border-slate-800";
        }
    });

    if (mode === 'ALL') {
        renderTournamentsGrid(tournamentsData);
    } else {
        const filtered = tournamentsData.filter(t => (t.mode || 'SOLO').toUpperCase() === mode);
        renderTournamentsGrid(filtered);
    }
};

document.getElementById("tournamentSearch")?.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = tournamentsData.filter(t => {
        const nameStr = t.title || t.name || t.tournamentName || t.matchName || "";
        return nameStr.toLowerCase().includes(term);
    });
    renderTournamentsGrid(filtered);
});

// --- RENDER GRID FUNCTION ---
function renderTournamentsGrid(matches) {
    const grid = document.getElementById("tournamentsGrid");
    if (!grid) return;

    if (matches.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500 text-xs font-bold">No active matches found.</div>`;
        return;
    }

    grid.innerHTML = matches.map(t => {
        const title = t.title || t.name || t.tournamentName || t.matchName || "Free Fire Match";
        const photo = t.bannerUrl || t.banner || t.thumbnail || t.imageUrl || t.image || t.photoURL || t.qrCodeUrl || "https://via.placeholder.com/400x200?text=Booyah+HUB+Match";
        const rawTime = t.matchTime || t.schedule || t.time || t.startTime || t.createdAt;
        const formattedTime = formatMatchTime(rawTime);

        const prize = t.prizePool ?? t.prize ?? t.prizeMoney ?? 0;
        const perKill = t.perKill ?? t.killBonus ?? t.killPrize ?? 0;
        const entry = t.entryFee ?? t.fee ?? t.entry ?? 0;
        const mode = t.mode || t.type || "SOLO";
        const map = t.map || t.mapName || "BERMUDA";
        
        const total = Number(t.totalSlots || t.maxPlayers || t.slots || 8);
        const joinedList = Array.isArray(t.joinedPlayers) ? t.joinedPlayers.length : 0;
        const filled = Number(t.registeredSlots || t.joinedSlots || joinedList || 0);
        const pct = Math.min(100, Math.round((filled / Math.max(total, 1)) * 100));

        return `
            <div class="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-orange-500/40 transition group">
                <div class="relative h-36 w-full bg-slate-950 overflow-hidden">
                    <img src="${photo}" alt="${title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.onerror=null; this.src='https://via.placeholder.com/400x200?text=Booyah+HUB+Match';">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                    <span class="absolute top-2 left-2 px-2 py-0.5 bg-slate-950/80 backdrop-blur-md text-orange-400 border border-orange-500/30 text-[10px] font-black rounded-md uppercase">${mode} • ${map}</span>
                    <button onclick="copyShareLink('${t.id}', event)" title="Share Match" class="absolute top-2 right-2 bg-slate-950/80 hover:bg-orange-500 hover:text-slate-950 text-orange-400 p-1.5 rounded-lg border border-orange-500/30 transition shadow-md">
                        <i class="fa-solid fa-share-nodes text-xs"></i>
                    </button>
                </div>

                <div class="p-4 space-y-3">
                    <div>
                        <div class="flex items-center justify-between gap-2">
                            <h3 class="font-bold text-slate-100 text-sm line-clamp-1">${title}</h3>
                            <span class="bg-orange-500 text-slate-950 px-2 py-0.5 rounded-lg text-xs font-black shrink-0">${entry > 0 ? '₹' + entry : 'FREE'}</span>
                        </div>
                        <div class="flex items-center gap-1.5 mt-1 text-[11px] font-semibold text-slate-400">
                            <i class="fa-regular fa-clock text-orange-400"></i>
                            <span>${formattedTime}</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-center">
                        <div>
                            <span class="text-[9px] text-slate-500 block font-bold">PRIZE POOL</span>
                            <span class="text-xs font-black text-amber-400">₹${prize}</span>
                        </div>
                        <div>
                            <span class="text-[9px] text-slate-500 block font-bold">PER KILL</span>
                            <span class="text-xs font-black text-emerald-400">₹${perKill}</span>
                        </div>
                    </div>

                    <div class="space-y-1">
                        <div class="flex justify-between text-[10px] font-bold">
                            <span class="text-slate-400">Spots Joined</span>
                            <span class="text-orange-400">${filled} / ${total}</span>
                        </div>
                        <div class="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                            <div class="h-full bg-orange-500 rounded-full transition-all" style="width: ${pct}%"></div>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button onclick="openMatchDetails('${t.id}')" class="flex-1 bg-slate-950 hover:bg-orange-500 hover:text-slate-950 text-slate-200 border border-slate-800 font-extrabold py-2.5 rounded-xl transition text-xs active:scale-95">
                            View Details
                        </button>
                        <button onclick="copyShareLink('${t.id}', event)" class="bg-slate-950 hover:bg-orange-500 hover:text-slate-950 text-slate-300 border border-slate-800 font-extrabold px-3 py-2.5 rounded-xl transition text-xs active:scale-95" title="Copy Shareable Link">
                            <i class="fa-solid fa-share-nodes"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// --- OPEN MATCH DETAILS ---
window.openMatchDetails = function(matchId) {
    currentSelectedMatch = tournamentsData.find(t => t.id === matchId);
    if (!currentSelectedMatch) return;

    const t = currentSelectedMatch;
    window.location.hash = `match?id=${matchId}`;

    const title = t.title || t.name || t.tournamentName || t.matchName || "Free Fire Match";
    const rawTime = t.matchTime || t.schedule || t.time || t.startTime || t.createdAt;
    const formattedTime = formatMatchTime(rawTime);
    
    const prize = t.prizePool ?? t.prize ?? t.prizeMoney ?? 0;
    const perKill = t.perKill ?? t.killBonus ?? t.killPrize ?? 0;
    const entry = t.entryFee ?? t.fee ?? t.entry ?? 0;
    const mode = t.mode || t.type || "SOLO";
    const map = t.map || t.mapName || "BERMUDA";
    const roomId = t.roomId || "Will be visible before match";
    const roomPassword = t.roomPassword || "Will be visible before match";

    const titleEl = document.getElementById("modalMatchTitle");
    const prizeEl = document.getElementById("modalPrizePool");
    const killEl = document.getElementById("modalPerKill");
    const entryEl = document.getElementById("modalEntryFee");

    if (titleEl) titleEl.textContent = title;
    if (prizeEl) prizeEl.textContent = `₹${prize}`;
    if (killEl) killEl.textContent = `₹${perKill}`;
    if (entryEl) entryEl.textContent = entry > 0 ? `₹${entry}` : "FREE";

    const extraDetailsContainer = document.getElementById("modalExtraDetails");
    if (extraDetailsContainer) {
        extraDetailsContainer.innerHTML = `
            <div class="grid grid-cols-2 gap-2 text-xs mb-3">
                <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span class="text-[10px] text-slate-500 font-bold uppercase block">Time</span>
                    <span class="font-bold text-slate-200">${formattedTime}</span>
                </div>
                <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span class="text-[10px] text-slate-500 font-bold uppercase block">Mode & Map</span>
                    <span class="font-bold text-slate-200">${mode} | ${map}</span>
                </div>
            </div>

            <div class="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 space-y-1.5 mb-3">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider"><i class="fa-solid fa-key text-orange-400 mr-1"></i> Room ID:</span>
                    <span class="text-xs font-mono font-bold text-amber-400 select-all">${roomId}</span>
                </div>
                <div class="flex items-center justify-between border-t border-slate-800/60 pt-1.5">
                    <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider"><i class="fa-solid fa-lock text-orange-400 mr-1"></i> Password:</span>
                    <span class="text-xs font-mono font-bold text-amber-400 select-all">${roomPassword}</span>
                </div>
            </div>
        `;
    }

    const modalShareBtn = document.getElementById("modalShareMatchBtn");
    if (modalShareBtn) {
        modalShareBtn.onclick = (e) => window.copyShareLink(matchId, e);
    }

    const seatGrid = document.getElementById("modalSeatGrid");
    if (seatGrid) {
        seatGrid.innerHTML = "";
        const totalSlots = Number(t.totalSlots || t.maxPlayers || t.slots || 8);
        const joinedList = Array.isArray(t.joinedPlayers) ? t.joinedPlayers.length : 0;
        const filledSlots = Number(t.registeredSlots || t.joinedSlots || joinedList || 0);

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

// --- DYNAMIC TOURNAMENT REGISTRATION SYSTEM ---
function openRegistrationModal() {
    if (!currentUser) {
        window.openModal("authModal");
        return;
    }

    const t = currentSelectedMatch;
    if (!t) return;

    const mode = (t.mode || t.type || "SOLO").toUpperCase();
    let playerSlots = 1;
    if (mode === "DUO") playerSlots = 2;
    if (mode === "SQUAD") playerSlots = 4;

    const inputsContainer = document.getElementById("dynamicPlayerInputs");
    if (inputsContainer) {
        inputsContainer.innerHTML = "";
        for (let i = 1; i <= playerSlots; i++) {
            const isSelf = i === 1;
            inputsContainer.innerHTML += `
                <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                    <span class="text-[11px] text-orange-400 font-extrabold block">Player ${i} Details ${isSelf ? '(You)' : ''}</span>
                    <div class="grid grid-cols-2 gap-2">
                        <input type="text" id="regIgn_${i}" required placeholder="In-Game Name" value="${isSelf ? (userData?.ign || '') : ''}" class="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500">
                        <input type="text" id="regUid_${i}" required placeholder="Character UID" value="${isSelf ? (userData?.gameUid || '') : ''}" class="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500">
                    </div>
                </div>
            `;
        }
    }

    const deductFee = document.getElementById("registerDeductFee");
    if (deductFee) {
        const entry = t.entryFee ?? t.fee ?? t.entry ?? 0;
        deductFee.textContent = `₹${entry}`;
    }

    window.openModal("registerModal");
}

// Registration Form Submission (Transaction Safe)
document.getElementById("tournamentRegistrationForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser || !currentSelectedMatch) return;

    const tId = currentSelectedMatch.id;
    const mode = (currentSelectedMatch.mode || currentSelectedMatch.type || "SOLO").toUpperCase();
    let playerSlots = 1;
    if (mode === "DUO") playerSlots = 2;
    if (mode === "SQUAD") playerSlots = 4;

    const playersList = [];
    for (let i = 1; i <= playerSlots; i++) {
        const ign = document.getElementById(`regIgn_${i}`)?.value;
        const uid = document.getElementById(`regUid_${i}`)?.value;
        if (!ign || !uid) return alert(`Please enter details for Player ${i}`);
        playersList.push({ ign, uid });
    }

    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", currentUser.uid);
            const matchRef = doc(db, "tournaments", tId);

            const userSnap = await transaction.get(userRef);
            const matchSnap = await transaction.get(matchRef);

            if (!userSnap.exists()) throw "User profile not found.";
            if (!matchSnap.exists()) throw "Tournament no longer exists.";

            const uData = userSnap.data();
            const mData = matchSnap.data();

            const entryFee = Number(mData.entryFee ?? mData.fee ?? mData.entry ?? 0);
            const totalSlots = Number(mData.totalSlots ?? mData.maxPlayers ?? mData.slots ?? 8);
            const joinedList = Array.isArray(mData.joinedPlayers) ? mData.joinedPlayers.length : 0;
            const registeredSlots = Number(mData.registeredSlots ?? mData.joinedSlots ?? joinedList ?? 0);

            if (registeredSlots >= totalSlots) throw "Tournament slots are fully filled!";

            let depBal = uData.depositBalance || 0;
            let winBal = uData.winningsBalance || 0;
            let totalBal = depBal + winBal;

            if (totalBal < entryFee) throw "Insufficient wallet balance! Please add deposit cash.";

            let remainingFee = entryFee;
            if (depBal >= remainingFee) {
                depBal -= remainingFee;
            } else {
                remainingFee -= depBal;
                depBal = 0;
                winBal -= remainingFee;
            }

            transaction.update(userRef, { depositBalance: depBal, winningsBalance: winBal });
            transaction.update(matchRef, { registeredSlots: registeredSlots + 1 });

            const participantRef = doc(collection(db, "tournaments", tId, "participants"));
            transaction.set(participantRef, {
                userId: currentUser.uid,
                userEmail: currentUser.email,
                players: playersList,
                registeredAt: serverTimestamp()
            });

            const txRef = doc(collection(db, "transactions"));
            transaction.set(txRef, {
                userId: currentUser.uid,
                type: "TOURNAMENT_ENTRY",
                amount: entryFee,
                status: "SUCCESS",
                matchTitle: mData.title || mData.name || mData.tournamentName || mData.matchName || "Free Fire Match",
                createdAt: serverTimestamp()
            });
        });

        alert("Registered Successfully! All the best!");
        closeModal("registerModal");
    } catch (err) {
        alert(typeof err === "string" ? err : err.message);
    }
});

// --- WALLET DEPOSIT & WITHDRAWAL HANDLERS ---
document.getElementById("addMoneyForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return alert("Please login first!");

    const amount = Number(document.getElementById("addAmount").value);
    const utr = document.getElementById("addUtr").value;

    try {
        await setDoc(doc(collection(db, "deposit_requests")), {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            amount: amount,
            utrNumber: utr,
            status: "PENDING",
            createdAt: serverTimestamp()
        });

        alert("Deposit request submitted! Admin will verify your UTR shortly.");
        closeModal("addMoneyModal");
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById("withdrawForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return alert("Please login first!");

    const amount = Number(document.getElementById("withdrawAmount").value);
    const method = document.getElementById("withdrawMethod").value;
    const details = document.getElementById("withdrawDetails").value;

    const winnings = userData?.winningsBalance || 0;
    if (amount > winnings) return alert("Insufficient winnings cash available for withdrawal!");

    try {
        await setDoc(doc(collection(db, "withdrawal_requests")), {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            amount: amount,
            method: method,
            paymentDetails: { upiId: details },
            status: "PENDING",
            createdAt: serverTimestamp()
        });

        alert("Withdrawal request submitted successfully!");
        closeModal("withdrawModal");
    } catch (err) {
        alert(err.message);
    }
});

// --- TRANSACTION HISTORY & LEADERBOARD LISTENERS ---
function listenUserTransactions(userId) {
    const q = query(
        collection(db, "transactions"),
        orderBy("createdAt", "desc"),
        limit(20)
    );

    onSnapshot(q, (snapshot) => {
        const tableBody = document.getElementById("transactionHistoryTable");
        if (!tableBody) return;

        let rowsHTML = "";
        snapshot.forEach(docSnap => {
            const tx = docSnap.data();
            if (tx.userId === userId) {
                let badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                if (tx.status === "PENDING") badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                if (tx.status === "REJECTED") badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";

                const dateStr = tx.createdAt?.toDate ? new Date(tx.createdAt.toDate()).toLocaleDateString() : "Just now";

                rowsHTML += `
                    <tr>
                        <td class="p-3 font-bold text-slate-200">${tx.type || 'TX'}</td>
                        <td class="p-3 font-black text-slate-100">₹${tx.amount || 0}</td>
                        <td class="p-3"><span class="px-2 py-0.5 border text-[10px] font-bold rounded-md ${badgeClass}">${tx.status || 'SUCCESS'}</span></td>
                        <td class="p-3 text-slate-400 text-[11px]">${dateStr}</td>
                    </tr>
                `;
            }
        });

        tableBody.innerHTML = rowsHTML || `<tr><td colspan="4" class="p-4 text-center text-slate-500">No recent transactions.</td></tr>`;
    });
}

function listenLeaderboard() {
    const q = query(collection(db, "users"), orderBy("winningsBalance", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        const lbContainer = document.getElementById("leaderboardList");
        if (!lbContainer) return;

        let html = "";
        let rank = 1;
        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            let rankColor = "text-slate-400";
            if (rank === 1) rankColor = "text-amber-400 font-black";
            if (rank === 2) rankColor = "text-slate-300 font-black";
            if (rank === 3) rankColor = "text-orange-400 font-black";

            html += `
                <div class="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <span class="w-6 text-center text-xs font-bold ${rankColor}">#${rank}</span>
                        <img src="${u.photoURL || 'https://via.placeholder.com/150'}" class="w-8 h-8 rounded-lg object-cover border border-slate-800">
                        <div>
                            <h4 class="font-bold text-slate-200 text-xs">${u.name || u.ign || 'Player'}</h4>
                            <span class="text-[10px] text-slate-500 font-semibold">${u.ign ? 'IGN: ' + u.ign : 'Gamer'}</span>
                        </div>
                    </div>
                    <span class="text-xs font-black text-emerald-400">₹${u.winningsBalance || 0}</span>
                </div>
            `;
            rank++;
        });

        lbContainer.innerHTML = html || `<div class="p-4 text-center text-slate-500 text-xs">No leaderboard rankings available yet.</div>`;
    });
}
listenLeaderboard();

window.addEventListener("hashchange", handleUrlHashMatch);
