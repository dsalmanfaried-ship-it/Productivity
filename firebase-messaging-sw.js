/* Firebase Cloud Messaging worker. Separate /fcm/ scope so it does not replace the app's offline worker. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyBx-gJ2J7OBvYznTSo9Nb0XJCGAdNTuAjfU',
  authDomain: 'ghabaty-84b32.firebaseapp.com',
  projectId: 'ghabaty-84b32',
  messagingSenderId: '872681239030',
  appId: '1:872681239030:web:ed56a9cfd6994b317a57d7'
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || payload.data?.title || 'غابتي 🌱';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'عندك تذكير جديد',
    icon: '../icon-192.png', badge: '../icon-192.png', dir: 'rtl', lang: 'ar',
    data: { url: '../' }
  };
  return self.registration.showNotification(title, options);
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('../', self.location.href).href;
  event.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const client of list) if ('focus' in client) return client.focus();
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
