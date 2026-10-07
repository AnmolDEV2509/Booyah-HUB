// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase App in Service Worker
firebase.initializeApp({
    apiKey: "AIzaSyCDnwGV_rW7BFjivz_QJ7yCPej7ypdI36Y",
    authDomain: "booyahhub2509.firebaseapp.com",
    projectId: "booyahhub2509",
    storageBucket: "booyahhub2509.firebasestorage.app",
    messagingSenderId: "524409836628",
    appId: "1:524409836628:web:fa99832124c5d9862949c1"
});

const messaging = firebase.messaging();

// Background Notification Listener
messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification?.title || 'Booyah HUB Alert!';
    const notificationOptions = {
        body: payload.notification?.body || 'New room update available!',
        icon: '/favicon.png',
        badge: '/favicon.png',
        data: payload.data || {}
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
