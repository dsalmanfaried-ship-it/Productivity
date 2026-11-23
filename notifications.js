/* غابتي — الإشعارات: متصفح (محلي + Push) و تيليجرام (عن طريق GitHub Actions).
   لا يغيّر تسجيل الدخول ولا مزامنة الغابة ولا التصميم. */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, initializeFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
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
const DEFAULT_MESSAGE = "حان وقت التركيز 🌳 افتح غابتي وابدأ جلسة جديدة.";
const LS_KEY = "ghabaty-reminders";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Firestore يتجهّز وقت الاستخدام وبنفس إعدادات index.html.
function getDb() {
  try { return initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); }
  catch (e) { return getFirestore(app); }
}

let currentUser = null;
let messaging = null;
let messagingSupported = false;

function notifyUser(message) {
  if (typeof window.toast === "function") window.toast(message);
  else console.info("[Notifications]", message);
}

/* ---------------- إشعارات المتصفح المحلية ---------------- */
async function showLocal(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    notifyUser(title + ": " + body);
    return;
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body, icon: "./icon-192.png", badge: "./icon-192.png",
        lang: "ar", dir: "rtl", tag: "ghabaty-local", data: { url: "./" }
      });
      return;
    }
  } catch (e) { /* نكمل بالطريقة التالية */ }
  try { new Notification(title, { body, lang: "ar", dir: "rtl" }); }
  catch (e) { notifyUser(title + ": " + body); }
}

// أندرويد لا يدعم new Notification؛ نستبدل دالة التطبيق بنسخة تعمل عبر الـ Service Worker.
if (typeof window.notify === "function") {
  window.notify = (title, body) => {
    if ("Notification" in window && Notification.permission === "granted") showLocal(title, body);
    if (document.hidden) document.title = "🕌 " + title;
  };
}

/* ---------------- الإعدادات (مواعيد + رسالة + Chat ID) ---------------- */
const toLatinDigits = s => String(s || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

function parseTimes(text) {
  const out = new Set();
  for (const part of toLatinDigits(text).split(/[,،;\s]+/)) {
    const m = part.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) continue;
    out.add(String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0"));
  }
  return [...out].sort();
}

function readLocalCfg() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}
function writeLocalCfg(cfg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {}
}
const settingsRef = () => doc(getDb(), "users", currentUser.uid, "settings", "reminders");

// منبّه محلي: يشتغل طالما الموقع مفتوح (حتى في تبويب خلفي).
setInterval(() => {
  const cfg = readLocalCfg();
  if (!cfg.times?.length || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const key = now.toDateString() + "_" + hhmm;
  if (cfg.times.includes(hhmm) && cfg.lastLocal !== key) {
    cfg.lastLocal = key;
    writeLocalCfg(cfg);
    showLocal("غابتي 🌳", cfg.message || DEFAULT_MESSAGE);
  }
}, 20000);

/* ---------------- Firebase Messaging (Push والموقع مقفول) ---------------- */
async function prepareMessaging() {
  try {
    messagingSupported = await isSupported();
    if (messagingSupported) {
      messaging = getMessaging(app);
      onMessage(messaging, payload => {
        const title = payload?.notification?.title || payload?.data?.title || "غابتي 🌳";
        const body = payload?.notification?.body || payload?.data?.body || DEFAULT_MESSAGE;
        showLocal(title, body);
      });
    }
  } catch (error) {
    console.warn("[Notifications] FCM is unavailable in this browser.", error);
    messagingSupported = false;
  }
}
const messagingReady = prepareMessaging();

function explainError(error) {
  const code = String(error?.code || "");
  const raw = String(error?.message || "");
  if (code.includes("permission-blocked")) return "إذن الإشعارات متبلوك. فعّله من إعدادات الموقع ثم حدّث الصفحة.";
  if (code.includes("token-subscribe-failed") || /401|403|API key|registration/i.test(raw))
    return "فشل اشتراك Push [" + (code || "subscribe") + "]. لو بتستخدم Brave فعّل «Use Google services for push messaging» من brave://settings/privacy.";
  if (code.includes("failed-service-worker-registration") || code.includes("sw-registration"))
    return "فشل تسجيل sw.js. اتأكد إن الملف جنب index.html والموقع على https.";
  if (code.includes("unsupported-browser")) return "المتصفح ده مش بيدعم Push.";
  if (code.includes("permission-denied") || /Missing or insufficient permissions/i.test(raw))
    return "قواعد Firestore رفضت الحفظ. انشر القواعد الجديدة من firestore-rules.txt.";
  return (code ? "[" + code + "] " : "") + (raw || "حصلت مشكلة.");
}

async function obtainToken(registration) {
  const opts = { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration };
  try {
    return await getToken(messaging, opts);
  } catch (first) {
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      return await getToken(messaging, opts);
    }
    throw first;
  }
}

async function enablePush() {
  await messagingReady;
  if (!currentUser) throw new Error("سجّل الدخول بحساب جوجل أولًا.");
  if (!messagingSupported || !messaging) throw new Error("Push غير مدعوم في هذا المتصفح.");
  if (!("serviceWorker" in navigator)) throw new Error("المتصفح لا يدعم Service Worker.");
  const registration = await navigator.serviceWorker.register("./sw.js");
  await navigator.serviceWorker.ready;
  const token = await obtainToken(registration);
  if (!token) throw new Error("لم يتم إنشاء رمز الإشعارات.");
  await setDoc(doc(getDb(), "users", currentUser.uid, "fcmTokens", token),
    { token, platform: "web", updatedAt: serverTimestamp() }, { merge: true });
}

/* ---------------- نافذة الإعدادات ---------------- */
function closeModal() { document.getElementById("ntfModal")?.remove(); }

async function openModal() {
  closeModal();
  if (!currentUser) { notifyUser("سجّل الدخول بحساب جوجل أولًا."); return; }

  let cfg = readLocalCfg();
  try {
    const snap = await getDoc(settingsRef());
    if (snap.exists()) cfg = { ...cfg, ...snap.data() };
  } catch (e) { console.warn("[Notifications] settings read failed", e); }

  const wrap = document.createElement("div");
  wrap.id = "ntfModal";
  wrap.dir = "rtl";
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit";
  const box = document.createElement("div");
  box.style.cssText = "background:#143d2c;color:#fff;border:1px solid #3d7a56;border-radius:18px;padding:18px;width:100%;max-width:420px;max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:10px";
  const fieldCss = "width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid #3d7a56;background:#0e2a1e;color:#fff;font:inherit";
  const btnCss = "padding:12px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer";

  box.innerHTML = `
    <h2 style="margin:0">🔔 إعدادات الإشعارات</h2>
    <label>مواعيد التذكير (24 ساعة، مفصولة بفاصلة)
      <input id="ntfTimes" style="${fieldCss}" placeholder="08:00, 20:00"></label>
    <label>نص التذكير
      <input id="ntfMsg" style="${fieldCss}"></label>
    <label>Telegram Chat ID (اختياري)
      <input id="ntfChat" inputmode="numeric" style="${fieldCss}" placeholder="مثال: 123456789"></label>
    <small style="opacity:.8">احصل على Chat ID بإرسال أي رسالة للبوت @userinfobot. وابعت /start لبوتك أولًا.</small>
    <button id="ntfSave" style="${btnCss};background:#9be07a;color:#0e2a1e">💾 حفظ</button>
    <button id="ntfBrowser" style="${btnCss};background:#2f6b4a;color:#fff">🔔 تفعيل إشعارات المتصفح</button>
    <button id="ntfClose" style="${btnCss};background:transparent;color:#fff;border:1px solid #3d7a56">إغلاق</button>`;
  wrap.appendChild(box);
  wrap.addEventListener("click", e => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);

  const $ = id => box.querySelector(id);
  $("#ntfTimes").value = (cfg.times || []).join(", ");
  $("#ntfMsg").value = cfg.message || DEFAULT_MESSAGE;
  $("#ntfChat").value = cfg.chatId || "";

  $("#ntfClose").onclick = closeModal;

  $("#ntfSave").onclick = async ev => {
    const btn = ev.currentTarget;
    const times = parseTimes($("#ntfTimes").value);
    const chatId = toLatinDigits($("#ntfChat").value).trim();
    if (chatId && !/^-?\d{5,20}$/.test(chatId)) { notifyUser("Chat ID لازم يكون أرقام فقط."); return; }
    const message = $("#ntfMsg").value.trim().slice(0, 300) || DEFAULT_MESSAGE;
    btn.disabled = true;
    try {
      const data = {
        times, message, chatId,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo",
        enabled: times.length > 0,
        updatedAt: serverTimestamp()
      };
      await setDoc(settingsRef(), data, { merge: true });
      writeLocalCfg({ ...readLocalCfg(), times, message, chatId });
      notifyUser(times.length ? "اتحفظت الإعدادات ✔ (" + times.join("، ") + ")" : "اتحفظت. مفيش مواعيد، فالتذكير متوقف.");
      closeModal();
    } catch (e) {
      console.error("[Notifications] save failed", e);
      notifyUser(explainError(e));
    }
    btn.disabled = false;
  };

  $("#ntfBrowser").onclick = async ev => {
    const btn = ev.currentTarget;
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳ جاري التفعيل...";
    try {
      if (!("Notification" in window)) throw new Error("المتصفح لا يدعم إشعارات الويب.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("إذن الإشعارات مرفوض. فعّله من إعدادات الموقع.");
      await showLocal("غابتي 🌳", "إشعارات المتصفح شغالة ✔");
      try {
        await enablePush();
        notifyUser("تم تفعيل Push ✔ هتوصلك التذكيرات حتى والموقع مقفول.");
        btn.textContent = "✅ إشعارات المتصفح مفعّلة";
      } catch (e) {
        console.error("[Notifications] push failed", e);
        notifyUser("الإشعارات المحلية شغالة (والموقع مفتوح). Push: " + explainError(e));
        btn.textContent = old;
      }
    } catch (e) {
      notifyUser(explainError(e));
      btn.textContent = old;
    }
    btn.disabled = false;
  };
}

/* ---------------- زر داخل «حسابي» ---------------- */
function addButton() {
  if (!currentUser) return;
  const accountBox = document.getElementById("acctBox");
  if (!accountBox || document.getElementById("openNtfSettings")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = "openNtfSettings";
  button.className = "big ghost";
  button.textContent = "🔔 إعدادات الإشعارات";
  button.addEventListener("click", openModal);
  const closeButton = accountBox.querySelector('[data-act="close"]');
  if (closeButton) accountBox.insertBefore(button, closeButton);
  else accountBox.appendChild(button);
}

onAuthStateChanged(auth, user => {
  currentUser = user || null;
  if (!currentUser) {
    document.getElementById("openNtfSettings")?.remove();
    closeModal();
  } else addButton();
});

new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
