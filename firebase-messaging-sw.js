/* Background push. Separate from sw.js on purpose: the SDK registers this one
   under its own scope (/firebase-cloud-messaging-push-scope), so the two
   workers never collide — sw.js stays the do-nothing worker that only makes
   the site installable.

   No message handler here. The relay sends a `notification` payload, which the
   SDK's default handler displays on its own; a custom onBackgroundMessage
   would only draw the same notification twice. Uses the compat build because
   importScripts can't load ES modules. */
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAro7bw59yU4JiP_0RusBSb9y4KzAUbyWA",
  authDomain: "ollyo-foosball.firebaseapp.com",
  databaseURL: "https://ollyo-foosball-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ollyo-foosball",
  storageBucket: "ollyo-foosball.firebasestorage.app",
  messagingSenderId: "796892845246",
  appId: "1:796892845246:web:64464f2e8591eeee1abaef"
});

firebase.messaging();
