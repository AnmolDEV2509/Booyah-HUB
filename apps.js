import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, 
    setDoc, getDoc, serverTimestamp, query, where, getDocs, increment, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBd53nUisAs6ZzxKpG0Z-CMeCpfMPqvFTc",
    authDomain: "booyah-hub-e041d.firebaseapp.com",
    projectId: "booyah-hub-e041d",
    storageBucket: "booyah-hub-e041d.firebasestorage.app",
    messagingSenderId: "1007690608229",
    appId: "1:1007690608229:web:7ce6b6d19a6200430ce08c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Auth State Listener
onAuthStateChanged(auth, async (user) => {
    const authSection = document.getElementById('authSection');
    const userProfileSection = document.getElementById('userProfileSection');

    if (user) {
        if (authSection) authSection.style.display = 'none';
        if (userProfileSection) userProfileSection.style.display = 'flex';
        
        loadUserData(user.uid);
        loadUserWallet(user.uid);
    } else {
        if (authSection) authSection.style.display = 'flex';
        if (userProfileSection) userProfileSection.style.display = 'none';
    }
});

async function loadUserData(userId) {
    try {
        const userRef = doc(db, "users", userId);
        const snap = await getDoc(userRef);
        const emailEl = document.getElementById('userEmailDisplay');
        
        if (snap.exists() && emailEl) {
            emailEl.innerText = snap.data().email || auth.currentUser.email;
        }
    } catch (e) {
        console.error("Error loading user data:", e);
    }
}

function loadUserWallet(userId) {
    onSnapshot(doc(db, "users", userId), (docSnap) => {
        const walletEl = document.getElementById('walletBalanceDisplay');
        if (docSnap.exists() && walletEl) {
            const balance = docSnap.data().walletBalance || 0;
            walletEl.innerText = `₹${balance}`;
        }
    });
}

// Display Tournaments on Home
document.addEventListener("DOMContentLoaded", () => {
    const tourneyContainer = document.getElementById('tournamentsList');
    if (!tourneyContainer) return;

    onSnapshot(collection(db, "tournaments"), (snapshot) => {
        tourneyContainer.innerHTML = "";

        if (snapshot.empty) {
            tourneyContainer.innerHTML = `<div style="color:var(--text-muted); text-align:center; grid-column: 1/-1;">No live or upcoming tournaments right now. Stay tuned!</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;

            tourneyContainer.innerHTML += `
                <div class="tourney-card">
                    <div class="tourney-banner" style="background-image: url('${data.banner}')">
                        <span class="badge ${data.status.toLowerCase()}">${data.status}</span>
                    </div>
                    <div class="tourney-body">
                        <h3>${data.name}</h3>
                        <p>Mode: <strong>${data.mode}</strong></p>
                        <div class="tourney-meta">
                            <span>Prize: <strong style="color:var(--green-glow);">₹${data.prize}</strong></span>
                            <span>Entry: <strong style="color:var(--accent-orange);">₹${data.entry}</strong></span>
                        </div>
                        <div class="slots-info">
                            <span>Slots Left: ${data.totalSlots - (data.joinedSlots || 0)}/${data.totalSlots}</span>
                        </div>
                        <button class="btn btn-primary" onclick="window.openRegisterModal('${id}', '${data.name}', ${data.entry}, '${data.mode}')">
                            Join Match
                        </button>
                    </div>
                </div>
            `;
        });
    });
});

// Modal & Registration Logic
let activeTourneyId = null;
let activeEntryFee = 0;

window.openRegisterModal = (tourneyId, tourneyName, entryFee, mode) => {
    if (!auth.currentUser) {
        alert("Pehle login karein match join karne ke liye!");
        return;
    }
    activeTourneyId = tourneyId;
    activeEntryFee = entryFee;

    const modal = document.getElementById('registerModal');
    if (modal) modal.style.display = 'flex';

    document.getElementById('modalTourneyTitle').innerText = tourneyName;
    
    // Dynamic fields based on mode (Solo/Duo/Squad)
    const container = document.getElementById('dynamicPlayersInputs');
    container.innerHTML = '';
    
    let count = 1;
    if (mode === 'DUO') count = 2;
    if (mode === 'SQUAD') count = 4;

    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="form-group" style="margin-bottom:10px;">
                <label>Player ${i} IGN & UID</label>
                <div style="display:flex; gap:6px;">
                    <input type="text" id="p-ign-${i}" placeholder="In-Game Name" required style="flex:1;">
                    <input type="text" id="p-uid-${i}" placeholder="Free Fire UID" required style="flex:1;">
                </div>
            </div>
        `;
    }
};

window.closeRegisterModal = () => {
    const modal = document.getElementById('registerModal');
    if (modal) modal.style.display = 'none';
};

window.submitRegistration = async () => {
    if (!auth.currentUser || !activeTourneyId) return;

    const userRef = doc(db, "users", auth.currentUser.uid);
    const tourneyRef = doc(db, "tournaments", activeTourneyId);

    // Collect player inputs
    const inputs = document.querySelectorAll('#dynamicPlayersInputs input');
    let players = [];
    let isValid = true;

    for (let i = 0; i < inputs.length; i += 2) {
        const ign = inputs[i].value.trim();
        const uid = inputs[i+1].value.trim();
        if (!ign || !uid) {
            isValid = false;
            break;
        }
        players.push({ ign, uid });
    }

    if (!isValid) {
        alert("Sabhi players ke IGN aur UID fill karna zaroori hai!");
        return;
    }

    try {
        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            const tourneySnap = await transaction.get(tourneyRef);

            if (!userSnap.exists() || !tourneySnap.exists()) {
                throw new Error("Match ya User data nahi mila!");
            }

            const currentBalance = userSnap.data().walletBalance || 0;
            if (currentBalance < activeEntryFee) {
                throw new Error("Wallet mein sufficient balance nahi hai! Pehle deposit karein.");
            }

            const tourneyData = tourneySnap.data();
            const joined = tourneyData.joinedSlots || 0;
            if (joined >= tourneyData.totalSlots) {
                throw new Error("Oops! Sare slots full ho chuke hain.");
            }

            // Deduct entry fee and update slots
            transaction.update(userRef, { walletBalance: currentBalance - activeEntryFee });
            transaction.update(tourneyRef, { joinedSlots: joined + 1 });

            // Create registration doc
            const regRef = doc(collection(db, "registrations"));
            transaction.set(regRef, {
                tournamentId: activeTourneyId,
                userId: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                players: players,
                createdAt: serverTimestamp()
            });
        });

        alert("🎉 Successfully Registered for the Tournament!");
        window.closeRegisterModal();
    } catch (e) {
        alert("Registration Failed: " + e.message);
    }
};

window.handleLogout = async () => {
    try {
        await signOut(auth);
        alert("Logged out successfully!");
        window.location.reload();
    } catch (e) {
        alert("Logout error: " + e.message);
    }
};
