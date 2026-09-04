import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, 
    setDoc, getDoc, serverTimestamp, query, where, getDocs, increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Configuration
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

// SUPER ADMIN CONFIGURATION
const SUPER_ADMIN_EMAIL = "admin2509@gmail.com"; // <-- Apni main Super Admin Login Email idhar dalein!

/* ==========================================================================
   STRICT SUPER ADMIN AUTH VERIFICATION
   ========================================================================== */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
            document.getElementById('roleBadge').innerHTML = `<i class="fa-solid fa-crown"></i> Super Admin Verified`;
            loadPaymentSettings();
            listenSubAdmins();
            listenDepositRequests();
        } else {
            alert("Access Denied! Yeh portal sirf Super Admin ke liye hai.");
            window.location.href = "subadmin.html";
        }
    } else {
        alert("Pehle login karein!");
        window.location.href = "index.html";
    }
});

/* ==========================================================================
   BANKING & UPI SETTINGS (SUPER ADMIN ONLY)
   ========================================================================== */
async function loadPaymentSettings() {
    try {
        const docRef = doc(db, "system_settings", "payment_info");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            document.getElementById('adminUpiId').value = data.upiId || '';
            document.getElementById('adminQrUrl').value = data.qrCodeUrl || '';
        }
    } catch (e) {
        console.error("Error loading payment settings: ", e);
    }
}

window.savePaymentSettings = async () => {
    const upiId = document.getElementById('adminUpiId').value.trim();
    const qrCodeUrl = document.getElementById('adminQrUrl').value.trim();

    if (!upiId) return alert("UPI ID enter karein!");

    try {
        await setDoc(doc(db, "system_settings", "payment_info"), {
            upiId: upiId,
            qrCodeUrl: qrCodeUrl,
            updatedAt: serverTimestamp()
        });
        alert("Banking UPI Details Updated Successfully!");
    } catch (e) {
        alert("Error updating UPI settings: " + e.message);
    }
};

/* ==========================================================================
   WALLET DEPOSIT APPROVALS (UTR MANAGEMENT)
   ========================================================================== */
function listenDepositRequests() {
    onSnapshot(collection(db, "deposit_requests"), (snapshot) => {
        const listEl = document.getElementById('adminDepositRequests');
        if (!listEl) return;
        
        let pendingHtml = '';
        let hasPending = false;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.status === 'PENDING') {
                hasPending = true;
                pendingHtml += `
                    <div class="deposit-item">
                        <div>
                            <strong>User:</strong> ${data.userEmail || data.userId}<br>
                            <strong>Amount:</strong> <span style="color:var(--green-glow);">₹${data.amount}</span><br>
                            <strong>UTR Ref:</strong> <span style="color:var(--accent-orange); font-family:monospace;">${data.utrNumber}</span>
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button class="btn btn-success" style="width:auto; padding:6px 10px;" onclick="window.approveDeposit('${docSnap.id}', '${data.userId}', ${data.amount})">Approve</button>
                            <button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="window.rejectDeposit('${docSnap.id}')">Reject</button>
                        </div>
                    </div>
                `;
            }
        });

        if (!hasPending) {
            listEl.innerHTML = `<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:10px;">No pending deposit requests. Sab clear hai!</div>`;
        } else {
            listEl.innerHTML = pendingHtml;
        }
    });
}

window.approveDeposit = async (requestId, userId, amount) => {
    if (!confirm(`Confirm approve ₹${amount} and add to player wallet?`)) return;

    try {
        // Player ke wallet mein balance atomically increment karo
        const userRef = doc(db, "users", userId);
        await setDoc(userRef, {
            walletBalance: increment(amount)
        }, { merge: true });

        // Request status APPROVED mark karo
        await updateDoc(doc(db, "deposit_requests", requestId), {
            status: "APPROVED"
        });

        alert("✅ Deposit Approved & User Wallet Updated Successfully!");
    } catch (e) {
        alert("Error approving deposit: " + e.message);
    }
};

window.rejectDeposit = async (requestId) => {
    if (!confirm("Kya aap is UTR request ko reject karna chahte hain?")) return;

    try {
        await updateDoc(doc(db, "deposit_requests", requestId), {
            status: "REJECTED"
        });
        alert("❌ Deposit Request Rejected!");
    } catch (e) {
        alert("Error rejecting request!");
    }
};

/* ==========================================================================
   SUB-ADMIN MANAGEMENT (SUPER ADMIN ONLY)
   ========================================================================== */
window.addSubAdmin = async () => {
    const email = document.getElementById('subAdminEmail').value.trim().toLowerCase();
    if (!email) return alert("Sub-Admin email type karein!");

    try {
        await setDoc(doc(db, "sub_admins", email), {
            email: email,
            addedBy: auth.currentUser ? auth.currentUser.email : 'SuperAdmin',
            createdAt: serverTimestamp()
        });
        document.getElementById('subAdminEmail').value = "";
        alert("Sub-Admin added successfully!");
    } catch (e) {
        alert("Error adding sub-admin: " + e.message);
    }
};

function listenSubAdmins() {
    onSnapshot(collection(db, "sub_admins"), (snapshot) => {
        const list = document.getElementById('subAdminList');
        if (!list) return;
        list.innerHTML = "";

        if (snapshot.empty) {
            list.innerHTML = `<div style="font-size:11px; color:var(--text-muted);">No sub-admins added yet.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            list.innerHTML += `
                <div class="sub-admin-item">
                    <span>${data.email}</span>
                    <button class="btn btn-danger" style="width:auto; padding:2px 6px; font-size:10px;" onclick="window.removeSubAdmin('${docSnap.id}')"><i class="fa-solid fa-xmark"></i> Delete</button>
                </div>
            `;
        });
    });
}

window.removeSubAdmin = async (emailId) => {
    if (confirm(`Remove ${emailId} from sub-admins?`)) {
        try {
            await deleteDoc(doc(db, "sub_admins", emailId));
            alert("Sub-Admin removed!");
        } catch (e) {
            alert("Error removing sub-admin!");
        }
    }
};

/* ==========================================================================
   ANNOUNCEMENTS SECTION
   ========================================================================== */
window.postAnnouncement = async () => {
    const text = document.getElementById('announcementText').value.trim();
    if(!text) return alert("Announcement text enter karo!");

    try {
        await addDoc(collection(db, "announcements"), {
            text: text,
            createdAt: serverTimestamp()
        });
        document.getElementById('announcementText').value = "";
        alert("Announcement Added!");
    } catch(e) {
        alert("Error adding announcement: " + e.message);
    }
};

onSnapshot(collection(db, "announcements"), (snapshot) => {
    const container = document.getElementById('announcementsList');
    if(!container) return;
    container.innerHTML = "";

    if(snapshot.empty) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">No active announcements.</div>`;
        return;
    }

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        container.innerHTML += `
            <div class="announcement-item">
                <span>${data.text}</span>
                <button class="btn btn-danger" style="width:auto; padding:4px 8px; font-size:10px;" onclick="window.deleteAnnouncement('${id}')"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
        `;
    });
});

window.deleteAnnouncement = async (id) => {
    if(confirm("Announcement delete karna hai?")) {
        try {
            await deleteDoc(doc(db, "announcements", id));
        } catch(e) {
            alert("Delete failed!");
        }
    }
};

/* ==========================================================================
   TOURNAMENTS & MATCH CONTROL SECTION
   ========================================================================== */
window.createMatch = async () => {
    const title = document.getElementById('newTitle').value.trim();
    const mode = document.getElementById('newMode').value;
    const totalSlots = parseInt(document.getElementById('newSlots').value);
    const entry = parseInt(document.getElementById('newEntry').value);
    const prize = parseInt(document.getElementById('newPrize').value);
    const startTimeVal = document.getElementById('newStartTime').value;
    const banner = document.getElementById('newBanner').value.trim() || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop';

    if(!title || !startTimeVal) return alert("Please fill all required fields!");

    try {
        await addDoc(collection(db, "tournaments"), {
            name: title,
            mode: mode,
            totalSlots: totalSlots,
            joinedSlots: 0,
            entry: entry,
            prize: prize,
            startTime: new Date(startTimeVal).getTime(),
            banner: banner,
            status: 'UPCOMING',
            roomId: '',
            roomPass: '',
            createdBy: auth.currentUser ? auth.currentUser.email : 'SuperAdmin',
            createdAt: serverTimestamp()
        });

        alert("Tournament Published Successfully!");
        document.getElementById('newTitle').value = "";
    } catch(e) {
        alert("Failed to create tournament!");
    }
};

onSnapshot(collection(db, "tournaments"), (snapshot) => {
    const container = document.getElementById('adminTournamentsList');
    if(!container) return;
    container.innerHTML = "";

    if(snapshot.empty) {
        container.innerHTML = `<div style="color:var(--text-muted); text-align:center;">No tournaments found.</div>`;
        return;
    }

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;

        container.innerHTML += `
            <div class="tourney-item">
                <div class="tourney-header">
                    <div>
                        <strong style="font-size:15px;">${data.name}</strong>
                        <span style="font-size:11px; color:var(--accent-orange); margin-left:8px;">[${data.mode}]</span>
                    </div>
                    <select id="status-${id}" onchange="window.updateStatus('${id}')" style="background:#000; color:#fff; border:1px solid var(--border-color); padding:4px 8px; border-radius:4px; font-size:11px;">
                        <option value="UPCOMING" ${data.status === 'UPCOMING' ? 'selected' : ''}>UPCOMING</option>
                        <option value="LIVE" ${data.status === 'LIVE' ? 'selected' : ''}>LIVE</option>
                        <option value="COMPLETED" ${data.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
                    </select>
                </div>

                <div class="edit-grid">
                    <div class="form-group">
                        <label>Room ID</label>
                        <input type="text" id="room-${id}" value="${data.roomId || ''}" placeholder="Enter Room ID">
                    </div>
                    <div class="form-group">
                        <label>Room Password</label>
                        <input type="text" id="pass-${id}" value="${data.roomPass || ''}" placeholder="Enter Pass">
                    </div>
                    <div class="form-group">
                        <label>Prize Pool (₹)</label>
                        <input type="number" id="prize-${id}" value="${data.prize || 0}">
                    </div>
                    <div class="form-group">
                        <label>Entry Fee (₹)</label>
                        <input type="number" id="entry-${id}" value="${data.entry || 0}">
                    </div>
                </div>

                <div class="action-btns">
                    <button class="btn btn-primary" onclick="window.saveMatchDetails('${id}')"><i class="fa-solid fa-floppy-disk"></i> Save Edits</button>
                    <button class="btn btn-secondary" onclick="window.togglePlayers('${id}')"><i class="fa-solid fa-users"></i> View Players</button>
                    <button class="btn btn-danger" onclick="window.deleteMatch('${id}')"><i class="fa-solid fa-trash"></i> Delete</button>
                </div>

                <div id="players-box-${id}" class="players-container">Loading joined players...</div>
            </div>
        `;
    });
});

window.togglePlayers = async (tourneyId) => {
    const box = document.getElementById(`players-box-${tourneyId}`);
    if (box.style.display === "block") {
        box.style.display = "none";
        return;
    }

    box.style.display = "block";
    box.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">Fetching players...</span>`;

    try {
        const q = query(collection(db, "registrations"), where("tournamentId", "==", tourneyId));
        const snap = await getDocs(q);

        if (snap.empty) {
            box.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">No players registered yet.</span>`;
            return;
        }

        let html = `<div style="font-size:11px; font-weight:700; color:var(--accent-orange); margin-bottom:6px;">REGISTERED PLAYERS (${snap.size}):</div>`;
        snap.forEach((docSnap) => {
            const reg = docSnap.data();
            html += `<div class="player-row">`;
            html += `<strong>User:</strong> ${reg.userEmail || 'N/A'}<br>`;
            if(reg.players && Array.isArray(reg.players)) {
                reg.players.forEach((p, idx) => {
                    html += `&nbsp;&nbsp;• P${idx+1}: <strong>${p.ign}</strong> (UID: ${p.uid})<br>`;
                });
            }
            html += `</div>`;
        });
        box.innerHTML = html;
    } catch (err) {
        box.innerHTML = `<span style="font-size:11px; color:var(--accent-red);">Error loading players!</span>`;
    }
};

window.saveMatchDetails = async (id) => {
    const roomId = document.getElementById(`room-${id}`).value.trim();
    const roomPass = document.getElementById(`pass-${id}`).value.trim();
    const prize = parseInt(document.getElementById(`prize-${id}`).value);
    const entry = parseInt(document.getElementById(`entry-${id}`).value);

    try {
        await updateDoc(doc(db, "tournaments", id), {
            roomId: roomId, roomPass: roomPass, prize: prize, entry: entry
        });
        alert("Match Updated Successfully!");
    } catch(e) {
        alert("Error updating match: " + e.message);
    }
};

window.updateStatus = async (id) => {
    const status = document.getElementById(`status-${id}`).value;
    try {
        await updateDoc(doc(db, "tournaments", id), { status: status });
        alert(`Match Status changed to ${status}`);
    } catch(e) {
        alert("Error changing status: " + e.message);
    }
};

window.deleteMatch = async (id) => {
    if(confirm("Are you sure you want to delete this match permanently?")) {
        try {
            await deleteDoc(doc(db, "tournaments", id));
            alert("Tournament Deleted!");
        } catch(e) {
            alert("Error deleting match!");
        }
    }
};

/* ==========================================================================
   RESULTS & PROOFS REVIEW SECTION
   ========================================================================== */
onSnapshot(collection(db, "results"), (snapshot) => {
    const container = document.getElementById('resultsList');
    if(!container) return;
    container.innerHTML = "";

    if(snapshot.empty) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">No proof screenshots submitted yet.</div>`;
        return;
    }

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;

        container.innerHTML += `
            <div class="result-card">
                <div style="font-size:12px; font-weight:600;">User: ${data.userEmail}</div>
                <div style="font-size:10px; color:var(--text-muted);">Match ID: ${data.tournamentId}</div>
                <a href="${data.screenshotUrl}" target="_blank">
                    <img src="${data.screenshotUrl}" class="result-img" alt="Booyah Proof">
                </a>
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button class="btn btn-success" style="padding:6px;" onclick="window.deleteResultProof('${id}', 'Approved')"><i class="fa-solid fa-check"></i> Approve / Paid</button>
                    <button class="btn btn-danger" style="padding:6px;" onclick="window.deleteResultProof('${id}', 'Rejected')"><i class="fa-solid fa-xmark"></i> Reject</button>
                </div>
            </div>
        `;
    });
});

window.deleteResultProof = async (id, status) => {
    if(confirm(`Mark this proof as ${status}?`)) {
        try {
            await deleteDoc(doc(db, "results", id));
            alert(`Proof ${status}!`);
        } catch(e) {
            alert("Error processing proof!");
        }
    }
};
