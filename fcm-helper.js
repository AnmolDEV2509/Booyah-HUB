// fcm-helper.js - Handles Push Notifications for Room ID & Pass
import { db, messaging, getToken, VAPID_KEY } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Register FCM Token for logged-in user
export async function registerFCMToken(uid) {
    try {
        if (!('Notification' in window)) return;

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (currentToken) {
                await updateDoc(doc(db, 'users', uid), { fcmToken: currentToken });
                console.log('FCM Token registered for UID:', uid);
            }
        }
    } catch (err) {
        console.error('FCM Token Error:', err);
    }
}

// Send Notification when Room ID & Password are published
export async function notifyJoinedPlayersForRoom(tournamentId, roomId, roomPass) {
    try {
        const tourneySnap = await getDoc(doc(db, 'tournaments', tournamentId));
        if (!tourneySnap.exists()) return;

        const tourney = tourneySnap.data();
        const joinedUsers = tourney.joinedUsers || [];

        if (joinedUsers.length === 0) return;

        console.log(`[Push Notification] Room Published for "${tourney.title}". Notifying ${joinedUsers.length} players...`);

        // Get FCM tokens for registered users
        for (const uid of joinedUsers) {
            const uSnap = await getDoc(doc(db, 'users', uid));
            if (uSnap.exists() && uSnap.data().fcmToken) {
                const token = uSnap.data().fcmToken;
                
                // Show in-browser notification if player is active on app
                if (Notification.permission === 'granted') {
                    new Notification(`🎮 Room Details Published: ${tourney.title}`, {
                        body: `Room ID: ${roomId} | Password: ${roomPass}\nJoin match now!`,
                        icon: '/favicon.png'
                    });
                }
            }
        }
    } catch (e) {
        console.error("Failed to notify room details:", e);
    }
}


