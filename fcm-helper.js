// fcm-helper.js - Handles Push Notifications (OneSignal & FCM) for Room ID & Pass
import { db, messaging, getToken, VAPID_KEY } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const ONESIGNAL_APP_ID = "8350b43a-9eb2-475a-ba52-16429afead6f";

// OneSignal Web SDK Initialization
export function initOneSignal() {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
        await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: {
                enable: true,
            },
        });
    });
}

// Auto-run OneSignal script on load
if (typeof window !== 'undefined') {
    if (!document.getElementById('onesignal-sdk')) {
        const script = document.createElement('script');
        script.id = 'onesignal-sdk';
        script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
        script.defer = true;
        document.head.appendChild(script);
    }
    initOneSignal();
}

// Register FCM & OneSignal User Binding
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

            // Bind User ID to OneSignal External ID
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(function(OneSignal) {
                OneSignal.login(uid);
            });
        }
    } catch (err) {
        console.error('Notification Registration Error:', err);
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

        // Active In-Browser Notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`🎮 Room Details Published: ${tourney.title}`, {
                body: `Room ID: ${roomId} | Password: ${roomPass}\nJoin match now!`,
                icon: '/favicon.png'
            });
        }
    } catch (e) {
        console.error("Failed to notify room details:", e);
    }
}
