// App.js
import { db, storage, auth, googleProvider } from "./firebase-config.js";
import { 
    collection, 
    doc, 
    onSnapshot, 
    updateDoc, 
    addDoc, 
    increment, 
    serverTimestamp, 
    query, 
    where, 
    getDocs 
} from "firebase/firestore";
import { 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "firebase/storage";
import { 
    signInWithPopup, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "firebase/auth";
import { 
    getMessaging, 
    getToken, 
    onMessage 
} from "firebase/messaging";

// VAPID Public Key for Web Push Notifications
const VAPID_KEY = "BIDNlSGxv83fuswRfeB2o70KnMTPNUoZrD6pIIY_rs-fIokINzIEmFJxAWp2F0zborubs-TSMzTdnhyTYQMHvoE";

// Initialize Messaging
const messaging = getMessaging();

// State Global Variables
export let currentUser = null;
export let tournamentsData = [];
export let userJoinedMatches = new Set();
export let currentFcmToken = null;

// ==========================================
// 🔔 PUSH NOTIFICATION FUNCTIONS
// ==========================================

/**
 * Request Notification Permission and Fetch Token
 */
export async function requestNotificationPermission(userId = null) {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (token) {
                currentFcmToken = token;
                const targetUid = userId || currentUser?.uid;
                
                // Firestore me user Profile Update/Save karo
                if (targetUid) {
                    await updateDoc(doc(db, "users", targetUid), {
                        fcmToken: token,
                        updatedAt: serverTimestamp()
                    }).catch(async () => {
                        // Agar document exists na kare to create/merge handling
                        await addDoc(collection(db, "users"), {
                            uid: targetUid,
                            fcmToken: token,
                            updatedAt: serverTimestamp()
                        });
                    });
                }
                return { success: true, token };
            }
        }
        return { success: false, message: "Permission denied or token unavailable" };
    } catch (error) {
        console.error("FCM Token Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Foreground Push Message Listener
 */
onMessage(messaging, (payload) => {
    console.log("Foreground Push Message:", payload);
    const title = payload.notification?.title || "Booyah HUB Alert";
    const body = payload.notification?.body || "New tournament update!";
    
    // Web In-App Alert/Toast Trigger
    alert(`📢 ${title}\n${body}`);
});

// ==========================================
// 🔑 AUTHENTICATION FUNCTIONS
// ==========================================

/**
 * Google Sign-In Function
 */
export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        await requestNotificationPermission(result.user.uid);
        return { success: true, user: result.user };
    } catch (error) {
        console.error("Google Auth Error:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Register user with Email & Password
 */
export async function registerWithEmail(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await requestNotificationPermission(userCredential.user.uid);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Signup Error:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Login user with Email & Password
 */
export async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await requestNotificationPermission(userCredential.user.uid);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Login Error:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Logout Current User
 */
export async function logoutUser() {
    try {
        await signOut(auth);
        userJoinedMatches.clear();
        currentFcmToken = null;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Listen to Authentication state changes (Auto-session)
 */
export function listenToAuthState(onUserChanged) {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            await fetchUserRegistrations(user.uid);
            await requestNotificationPermission(user.uid);
        } else {
            userJoinedMatches.clear();
            currentFcmToken = null;
        }
        if (onUserChanged && typeof onUserChanged === 'function') {
            onUserChanged(user);
        }
    });
}

// ==========================================
// 🏆 TOURNAMENTS & REGISTRATION LOGIC
// ==========================================

/**
 * Fetch registrations for currently logged-in user
 */
export async function fetchUserRegistrations(userId) {
    try {
        const uid = userId || currentUser?.uid;
        if (!uid) return;

        const q = query(collection(db, "registrations"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);
        userJoinedMatches.clear();
        querySnapshot.forEach((docSnap) => {
            userJoinedMatches.add(docSnap.data().tournamentId);
        });
    } catch (error) {
        console.error("Error fetching registrations:", error);
    }
}

/**
 * Real-time listener for Active Tournaments List
 */
export function listenToTournaments(onDataUpdate) {
    return onSnapshot(collection(db, "tournaments"), (snapshot) => {
        tournamentsData = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            tournamentsData.push({ 
                id: docSnap.id, 
                ...data,
                isJoined: userJoinedMatches.has(docSnap.id)
            });
        });
        if (onDataUpdate && typeof onDataUpdate === 'function') {
            onDataUpdate(tournamentsData);
        }
    }, (error) => {
        console.error("Firestore Tournament Sync Error:", error);
    });
}

/**
 * Join Match Logic
 */
export async function joinTournament(tournamentId, playerNames = []) {
    if (!currentUser) {
        return { success: false, message: "User not logged in" };
    }

    try {
        // 1. Add record to 'registrations'
        await addDoc(collection(db, "registrations"), {
            tournamentId: tournamentId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            players: playerNames,
            joinedAt: serverTimestamp()
        });

        // 2. Increment joined slots count in 'tournaments' collection
        const tourneyRef = doc(db, "tournaments", tournamentId);
        await updateDoc(tourneyRef, {
            joinedSlots: increment(1)
        });

        userJoinedMatches.add(tournamentId);
        return { success: true };
    } catch (error) {
        console.error("Join Tournament Error:", error);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 📸 STORAGE (RESULT SCREENSHOT UPLOAD)
// ==========================================

/**
 * Upload Match Result Screenshot to Storage
 */
export async function uploadMatchResult(tournamentId, file) {
    if (!currentUser) return { success: false, message: "User not logged in" };
    if (!file) return { success: false, message: "No file selected" };

    const fileRef = ref(storage, `results/${tournamentId}_${currentUser.uid}_${Date.now()}`);

    try {
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        await addDoc(collection(db, "results"), {
            tournamentId: tournamentId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            screenshotUrl: downloadURL,
            uploadedAt: serverTimestamp()
        });

        return { success: true, url: downloadURL };
    } catch (error) {
        console.error("Storage Upload Error:", error);
        return { success: false, error: error.message };
    }
}
