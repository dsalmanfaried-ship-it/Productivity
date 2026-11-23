/* Productivity / غابتي — Web Push subscription.
   Adds notification opt-in only. Existing login, forest data and UI are not replaced. */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyBx-g2J7OBvYznTSo9Nb0XJCGAdNTuAjfU",
  authDomain: "ghabaty-84b32.firebaseapp.com",
  projectId: "ghabaty-84b32",
  storageBucket: "ghabaty-84b32.firebasestorage.app",
  messagingSenderId: "872681239030",
  appId: "1:872681239030:web:ed56a9cfd6994b317a57d7"
};
const VAPID_KEY = "BLBNmaVO2SvuuBrSiuO0BLpMkfbIiiwqw-6R7t9DPmArX0hWuSo38OfrvgNWxqDj70SnDwRxk7wINKrODmHl5PE";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let messaging = null;
let messagingSupported = false;
let ready = false;

function notifyUser(message) {
  if (typeof window.toast === "function") window.toast(message);
  else console.info("[Notifications]", message);
}

async function prepareMessaging() {
  try {
    messagingSupported = await isSupported();
    if (messagingSupported) {
      messaging = getMessaging(app);
      onMessage(messaging, payload => {
        const title = payload?.notification?.title || payload?.data?.title || "غابتي 🌳";
        const body = payload?.notification?.body || payload?.data?.body || "حان وقت التركيز!";
        notifyUser(`${title}: ${body}`);
      });
    }
  } catch (error) {
    console.warn("[Notifications] FCM is unavailable in this browser.", error);
    messagingSupported = false;
  }
  ready = true;
}

async function enableNotifications(button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "⏳ جاري تفعيل الإشعارات...";
  try {
    if (!currentUser) throw new Error("سجّل الدخول بحساب جوجل أولًا.");
    if (!("Notification" in window)) throw new Error("المتصفح لا يدعم إشعارات الويب.");
    if (!("serviceWorker" in navigator)) throw new Error("المتصفح لا يدعم Service Worker.");
    if (!messagingSupported || !messaging) throw new Error("إشعارات Firebase غير مدعومة في هذا المتصفح.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error(permission === "denied"
        ? "إذن الإشعارات مرفوض. فعّله من إعدادات الموقع في المتصفح."
        : "لم يتم السماح بالإشعارات.");
    }

    // Reuse the site's existing sw.js; do not register a second service worker.
    const registration = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) throw new Error("لم يتم إنشاء رمز الإشعارات. حاول مرة أخرى.");

    // A token is stored only inside the signed-in user's own Firestore subcollection.
    await setDoc(
      doc(db, "users", currentUser.uid, "fcmTokens", token),
      {
        token,
        platform: "web",
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    button.textContent = "✅ الإشعارات مفعّلة";
    button.disabled = false;
    notifyUser("تم تفعيل إشعارات المذاكرة بنجاح 🌳");
  } catch (error) {
    console.error("[Notifications] Enable failed:", error);
    notifyUser(error?.message || "حصلت مشكلة أثناء تفعيل الإشعارات.");
    button.disabled = false;
    button.textContent = originalText || "🔔 إعادة محاولة تفعيل الإشعارات";
  }
}

function addNotificationButton() {
  if (!currentUser) return;
  const accountBox = document.getElementById("acctBox");
  if (!accountBox || document.getElementById("enableFcmNotifications")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "enableFcmNotifications";
  button.className = "big ghost";
  button.textContent = "🔔 تفعيل إشعارات المذاكرة";
  button.addEventListener("click", () => enableNotifications(button));

  const closeButton = accountBox.querySelector('[data-act="close"]');
  if (closeButton) accountBox.insertBefore(button, closeButton);
  else accountBox.appendChild(button);
}

onAuthStateChanged(auth, user => {
  currentUser = user || null;
  if (!currentUser) {
    document.getElementById("enableFcmNotifications")?.remove();
  } else {
    addNotificationButton();
  }
});

const accountObserver = new MutationObserver(() => addNotificationButton());
accountObserver.observe(document.documentElement, { childList: true, subtree: true });

prepareMessaging();
