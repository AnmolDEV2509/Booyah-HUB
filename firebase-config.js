// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

// Tumhare project ki Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCDnwGV_rW7BFjivz_QJ7yCPej7ypdI36Y",
  authDomain: "booyahhub2509.firebaseapp.com",
  projectId: "booyahhub2509",
  storageBucket: "booyahhub2509.firebasestorage.app",
  messagingSenderId: "524409836628",
  appId: "1:524409836628:web:fa99832124c5d9862949c1"
};

// Firebase App Initialize karo
export const app = initializeApp(firebaseConfig);

// Services export karo
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const messaging = getMessaging(app);
