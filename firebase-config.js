// firebase-config.js
// Single source of truth for Firebase. Every page imports from here.
// (firebase-messaging-sw.js cannot import modules, so it keeps its own copy.)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// NOTE: a Firebase web apiKey is public by design. Real protection = Firestore/Storage rules.
const firebaseConfig = {
    apiKey: "AIzaSyBd53nUisAs6ZzxKpG0Z-CMeCpfMPqvFTc",
    authDomain: "booyah-hub-e041d.firebaseapp.com",
    projectId: "booyah-hub-e041d",
    storageBucket: "booyah-hub-e041d.firebasestorage.app",
    messagingSenderId: "1007690608229",
    appId: "1:1007690608229:web:7ce6b6d19a6200430ce08c"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Must match the email used in firestore.rules (isSuperAdmin)
export const SUPER_ADMIN_EMAIL = "admin2509@gmail.com";
