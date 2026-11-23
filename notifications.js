// Firebase Cloud Messaging for Ghabaty.
// Set the Firebase Web Push certificate key from Firebase Console > Project settings > Cloud Messaging.
const FCM_CONFIG = {
  apiKey: "AIzaSyBx-gJ2J7OBvYznTSo9Nb0XJCGAdNTuAjfU",
  authDomain: "ghabaty-84b32.firebaseapp.com",
  projectId: "ghabaty-84b32",
  messagingSenderId: "872681239030",
  appId: "1:872681239030:web:ed56a9cfd6994b317a57d7"
};
const FCM_VAPID_KEY = "PASTE_FIREBASE_WEB_PUSH_CERTIFICATE_KEY_HERE";
const FCM_VERSION = "10.14.1";

let fcmReadyPromise;
async function initGhabatyMessaging() {
  if (fcmReadyPromise) return fcmReadyPromise;
  fcmReadyPromise = (async () => {
    if (!/^https:$/.test(location.protocol) && location.hostname !== 'localhost') {
      throw new Error('الإشعارات تحتاج موقع HTTPS');
    }
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
      throw new Error('المتصفح لا يدعم إشعارات الويب');
    }
    if (!FCM_VAPID_KEY || FCM_VAPID_KEY.startsWith('PASTE_')) {
      throw new Error('أضف مفتاح Web Push من Firebase داخل notifications.js أولًا');
    }
    const base = `https://www.gstatic.com/firebasejs/${FCM_VERSION}/`;
    const [appSdk, authSdk, msgSdk, fsSdk] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'),
      import(base + 'firebase-messaging.js'), import(base + 'firebase-firestore.js')
    ]);
    const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FCM_CONFIG);
    const auth = authSdk.getAuth(app);
    const user = auth.currentUser;
    if (!user) throw new Error('سجّل الدخول بحساب جوجل قبل تفعيل الإشعارات');
    if (!(await msgSdk.isSupported())) throw new Error('إشعارات Firebase غير مدعومة في هذا المتصفح');
    const registration = await navigator.serviceWorker.register('./fcm/firebase-messaging-sw.js', {scope: './fcm/'});
    const messaging = msgSdk.getMessaging(app);
    const token = await msgSdk.getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error('Firebase لم يُصدر رمز الإشعارات؛ راجع إعدادات Web Push');
    const tokenId = Array.from(new TextEncoder().encode(token)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 120);
    await fsSdk.setDoc(fsSdk.doc(fsSdk.getFirestore(app), 'users', user.uid, 'fcmTokens', tokenId), {
      token, platform: 'web', updatedAt: fsSdk.serverTimestamp(), userAgent: navigator.userAgent.slice(0, 180)
    });
    msgSdk.onMessage(messaging, payload => {
      const title = payload.notification?.title || payload.data?.title || 'غابتي 🌱';
      const body = payload.notification?.body || payload.data?.body || 'عندك تذكير جديد';
      // Foreground notifications are shown in-page; the app shell already handles visible state.
      const node = document.createElement('div');
      node.className = 'toast'; node.textContent = `${title} — ${body}`;
      document.querySelector('#toast')?.appendChild(node);
      setTimeout(() => node.remove(), 6000);
    });
    return 'تم تفعيل الإشعارات وحفظ رمز جهازك في حسابك ✔';
  })().catch(error => { fcmReadyPromise = null; throw error; });
  return fcmReadyPromise;
}
window.enableForestNotifications = initGhabatyMessaging;
