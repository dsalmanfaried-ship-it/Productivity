/* Firebase Cloud Messaging: background notifications.
   Wrapped so a temporary Firebase CDN failure does not disable the offline worker. */
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
  );

  firebase.initializeApp({
    apiKey: "AIzaSyBx-g2J7OBvYznTSo9Nb0XJJCGAdNTuAjfU",
    authDomain: "ghabaty-84b32.firebaseapp.com",
    projectId: "ghabaty-84b32",
    storageBucket: "ghabaty-84b32.firebasestorage.app",
    messagingSenderId: "872681239030",
    appId: "1:872681239030:web:ed56a9cfd6994b317a57d7"
  });

  const fcmMessaging = firebase.messaging();
  fcmMessaging.onBackgroundMessage(payload => {
    const title = payload?.notification?.title || payload?.data?.title || "غابتي 🌳";
    const options = {
      body: payload?.notification?.body || payload?.data?.body || "حان وقت التركيز!",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      data: { url: payload?.data?.url || "./" },
      tag: payload?.data?.tag || "productivity-reminder"
    };
    return self.registration.showNotification(title, options);
  });
} catch (error) {
  // Keep the original offline functionality alive even if FCM's CDN is unavailable.
  console.warn("[FCM] Firebase Messaging could not initialize in the service worker.", error);
}

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    if (clients.openWindow) return clients.openWindow(target);
  })());
});

/* غابتي – service worker: يخزّن هيكل التطبيق للعمل بدون إنترنت.
   ملفات الصوت بتتنزّل من جوه التطبيق (زرار "تنزيل للاستخدام بدون نت") وبتتخزن في IndexedDB. */
const CACHE = 'ghabaty-shell-v13';
const SHELL = ['./', 'index.html', '404.html', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'notifications.js'];

self.addEventListener('install', e => {
  // كل ملف لوحده: لو ملف ناقص من الموقع، التثبيت ميفشلش كله
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.mp3')) return; // الصوت بيتعامل معاه التطبيق نفسه
  // شبكة أولًا (عشان التحديثات توصل)، ولو مفيش نت يرجع للنسخة المخزنة
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
from pathlib import Path

src = Path("/mnt/data/sw.js")
content = src.read_text(encoding="utf-8")
old = "AIzaSyBx-g2J7OBvYznTSo9Nb0XJJCGAdNTuAjfU"
new = "AIzaSyBx-g2J7OBvYznTSo9Nb0XJCGAdNTuAjfU"

if content.count(old) != 1:
    raise ValueError("القيمة القديمة لم تظهر مرة واحدة بالضبط؛ لم أعدّل الملف.")

out = Path("/mnt/data/sw-fixed.js")
out.write_text(content.replace(old, new), encoding="utf-8")
print("تم إنشاء النسخة المصححة: sw-fixed.js")
print("التغيير الوحيد: توحيد apiKey مع القيمة الموجودة في index.html و notifications.js.")
