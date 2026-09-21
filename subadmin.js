// subadmin.js - Sub-Admin panel (subadmin.html)
import { db, auth, SUPER_ADMIN_EMAIL } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { setupAnnouncements, setupTournaments, setupResults } from "./admin-common.js";

// Hide the page until access is verified (nothing flashes for non-staff users)
document.documentElement.style.visibility = 'hidden';

let started = false;

function deny(message) {
    alert(message);
    window.location.href = 'index.html';
}

onAuthStateChanged(auth, async (user) => {
    if (!user || !user.email) return deny('Pehle login karein! (index.html par login karke wapas aayein)');

    const email = user.email.toLowerCase();
    try {
        const isSuper = email === SUPER_ADMIN_EMAIL.toLowerCase();
        const isSub = isSuper ? true : (await getDoc(doc(db, 'sub_admins', email))).exists();
        if (!isSub) return deny('Access Denied! Aap Sub-Admin nahi hain.');
    } catch (err) {
        console.error('Access check failed:', err);
        return deny('Access verify nahi ho paya. Dobara try karein.');
    }

    if (started) return;
    started = true;
    document.documentElement.style.visibility = 'visible';

    // Sub-admins can manage matches, room details, notices and review proofs.
    // Kick/refund and paying prizes stay with the Super Admin.
    setupAnnouncements();
    setupTournaments({ canKick: false, canRefund: false });
    setupResults({ canPay: false });
});
