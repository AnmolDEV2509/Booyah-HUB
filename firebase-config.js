// firebase-config.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Firebase Configuration Details
const firebaseConfig = {
  apiKey: "AIzaSyBd53nUisAs6ZzxKpG0Z-CMeCpfMPqvFTc",
  authDomain: "booyah-hub-e041d.firebaseapp.com",
  projectId: "booyah-hub-e041d",
  storageBucket: "booyah-hub-e041d.firebasestorage.app",
  messagingSenderId: "1007690608229",
  appId: "1:1007690608229:web:7ce6b6d19a6200430ce08c"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
