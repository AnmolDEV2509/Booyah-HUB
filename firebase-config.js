// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

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
const messaging = getMessaging(app);

// Web Push Certificate (VAPID Key)
const VAPID_KEY = "BFIY-KCyHZReYhosXBWX8OeEikGy3keiLrjyxAV7lHqDkbKHrl4ZQX79Zu_gk0iJLFD-AietGq8GfE0ibPrxMws";
const SUPER_ADMIN_EMAIL = "admin@booyahhub.com"; // Adjust as per your config

export { db, auth, messaging, getToken, onMessage, VAPID_KEY, SUPER_ADMIN_EMAIL };
