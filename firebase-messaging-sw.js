importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBd53nUisAs6ZzxKpG0Z-CMeCpfMPqvFTc",
  authDomain: "booyah-hub-e041d.firebaseapp.com",
  projectId: "booyah-hub-e041d",
  storageBucket: "booyah-hub-e041d.firebasestorage.app",
  messagingSenderId: "1007690608229",
  appId: "1:1007690608229:web:7ce6b6d19a6200430ce08c"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title || 'Booyah HUB Alert!';
  const notificationOptions = {
    body: payload.notification.body || 'New notification from Booyah HUB',
    icon: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
