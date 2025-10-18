// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA1G2P-4qJu3b_nkE0hESs8d-WzokG_O9M",
  authDomain: "campus-14547.firebaseapp.com",
  projectId: "campus-14547",
  messagingSenderId: "1006561956661",
  appId: "1:1006561956661:web:ada5dd1edfe29eb1f2727c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification.title || "Campus Pulse";
  const options = {
    body: payload.notification.body,
    icon: "/logo192.png"
  };
  self.registration.showNotification(title, options);
});
