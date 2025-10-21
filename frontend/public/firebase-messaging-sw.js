//October 19, 2025
//Pulse

// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "insert key",
  authDomain: "insert domain",
  projectId: "campus-14547",
  messagingSenderId: "insert ID",
  appId: "you know the app id goes here"
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
