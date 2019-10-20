importScripts("https://www.gstatic.com/firebasejs/4.8.1/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/4.8.1/firebase-messaging.js");

const firebaseConfig = {
  apiKey: "AIzaSyAPj6p8DQLx9er2mSUHgHQb1aZK2HmDxAw",
  authDomain: "diary-5ef53.firebaseapp.com",
  databaseURL: "https://diary-5ef53.firebaseio.com",
  projectId: "diary-5ef53",
  storageBucket: "diary-5ef53.appspot.com",
  messagingSenderId: "223437832654",
  appId: "1:223437832654:web:289e30e4892bcd45c72b9f"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.setBackgroundMessageHandler(function(payload) {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );

  const notificationTitle = "Your friendly journaling reminder";
  const notificationOptions = {
    body: "If you can, take some time to journal.",
    icon: "/icon-512.png"
  };

  if ("actions" in Notification.prototype) {
    notificationOptions.actions = [{ action: "write", title: "Write" }];
  }

  return self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});

self.addEventListener(
  "notificationclick",
  function(event) {
    event.notification.close();

    if (event.action === "write") {
      clients.openWindow("/entries/new");
    }
  },
  false
);
