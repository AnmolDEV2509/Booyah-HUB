// firebase-messaging-sw.js
// Service workers cannot import ES modules, so the config is repeated here (public values only).
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBd53nUisAs6ZzxKpG0Z-CMeCpfMPqvFTc",
    authDomain: "booyah-hub-e041d.firebaseapp.com",
    projectId: "booyah-hub-e041d",
    storageBucket: "booyah-hub-e041d.firebasestorage.app",
    messagingSenderId: "1007690608229",
    appId: "1:1007690608229:web:7ce6b6d19a6200430ce08c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {};
    self.registration.showNotification(n.title || 'Booyah HUB Alert!', {
        body: n.body || 'New notification from Booyah HUB',
        icon: '/favicon.png'
    });
});
