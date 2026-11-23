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
const LS_KEY = "ghabaty-reminders";
const PRESETS = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];

const MESSAGES = [
  "حان وقت التركيز 🌳 افتح غابتي وابدأ جلسة جديدة.",
  "شجرتك مستنياك 🌱 جلسة تركيز قصيرة بتفرق.",
  "ابدأ بـ 25 دقيقة بس، والباقي هيسهل 💪",
  "اقفل الموبايل وركّز على مهمة واحدة 🎯",
  "كل جلسة تركيز بتكبّر غابتك 🌳",
  "مذاكرتك النهاردة بتبني نجاحك بكرة 📚",
  "لو أجّلت دلوقتي هتتعب بعدين. ابدأ دلوقتي ⏳",
  "خطوة صغيرة كل يوم، كمّل يا بطل 🌟",
  "شجرة جديدة في انتظارك 🌲 ابدأ جلسة",
  "جلسة تركيز واحدة قبل ما يخلص يومك تكفي 🌙"
];
const pickMessage = cfg => (cfg.randomMsg !== false || !cfg.message)
  ? MESSAGES[Math.floor(Math.random() * MESSAGES.length)] : cfg.message;
const toMin = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
const fmtMin = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
function nowIn(tz) {
  let zone = tz || "Africa/Cairo";
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); } catch (e) { zone = "Africa/Cairo"; }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, minutes: +g("hour") * 60 + +g("minute") };
}
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function rng(seed) {
  let a = hashSeed(seed);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// نفس الدالة في الموقع وفي السكربت: مواعيد اليوم العشوائية ثابتة لنفس اليوم والمستخدم
function randomTimes(seed, count, startMin, endMin) {
  const r = rng(seed), slot = (endMin - startMin) / count, out = [];
  for (let i = 0; i < count; i++) {
    const a = startMin + Math.floor(slot * i), b = startMin + Math.floor(slot * (i + 1)) - 1;
    out.push(fmtMin(a + Math.floor(r() * Math.max(1, b - a + 1))));
  }
  return out;
}
function todayTimes(cfg, uid) {
  if (cfg.mode === "random") {
    const n = nowIn(cfg.tz);
    const count = Math.min(Math.max(+cfg.count || 3, 1), 8);
    return randomTimes(n.date + "|" + uid, count, toMin(cfg.winStart || "09:00"), toMin(cfg.winEnd || "22:00"));
  }
  return Array.isArray(cfg.times) ? cfg.times : [];
}


const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

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

/* ---------------- الإعدادات المحلية ---------------- */
const toLatinDigits = s => String(s || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
function readLocalCfg() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
function writeLocalCfg(cfg) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
const settingsRef = () => doc(getDb(), "users", currentUser.uid, "settings", "reminders");

// منبّه محلي: يشتغل والموقع مفتوح. بيتوقف لو Push مفعّل عشان ميتكررش الإشعار.
setInterval(() => {
  const cfg = readLocalCfg();
  if (!cfg.uid || cfg.pushOn || !("Notification" in window) || Notification.permission !== "granted") return;
  const times = todayTimes(cfg, cfg.uid);
  if (!times.length) return;
  const n = nowIn(cfg.tz);
  const hhmm = fmtMin(n.minutes);
  const key = n.date + "_" + hhmm;
  if (times.includes(hhmm) && cfg.lastLocal !== key) {
    writeLocalCfg({ ...cfg, lastLocal: key });
    showLocal("غابتي 🌳", pickMessage(cfg));
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
        const body = payload?.notification?.body || payload?.data?.body || MESSAGES[0];
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
  writeLocalCfg({ ...readLocalCfg(), pushOn: true });
}

/* ---------------- نافذة الإعدادات ---------------- */
function closeModal() {
  document.getElementById("ntfModal")?.remove();
}

async function openModal() {
  closeModal();
  if (!currentUser) { notifyUser("سجّل الدخول بحساب جوجل أولًا."); return; }

  let cfg = readLocalCfg();
  try {
    const snap = await getDoc(settingsRef());
    if (snap.exists()) cfg = { ...cfg, ...snap.data() };
  } catch (e) { console.warn("[Notifications] settings read failed", e); }

  const st = {
    mode: cfg.mode === "fixed" ? "fixed" : "random",
    count: Math.min(Math.max(+cfg.count || 3, 1), 5),
    winStart: cfg.winStart || "09:00",
    winEnd: cfg.winEnd || "22:00",
    times: new Set(Array.isArray(cfg.times) ? cfg.times : ["08:00", "20:00"]),
    randomMsg: cfg.randomMsg !== false,
    chatId: cfg.chatId || ""
  };

  const wrap = document.createElement("div");
  wrap.id = "ntfModal";
  wrap.dir = "rtl";
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit";
  const box = document.createElement("div");
  box.style.cssText = "background:#143d2c;color:#fff;border:1px solid #3d7a56;border-radius:18px;padding:18px;width:100%;max-width:420px;max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:10px";
  const field = "width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid #3d7a56;background:#0e2a1e;color:#fff;font:inherit";
  const btn = "padding:12px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer";
  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0") + ":00");
  const opts = sel => hours.map(h => `<option value="${h}"${h === sel ? " selected" : ""}>${h}</option>`).join("");

  box.innerHTML = `
    <h2 style="margin:0">🔔 إعدادات الإشعارات</h2>
    <div style="display:flex;gap:8px">
      <button id="mRandom" style="${btn};flex:1"></button>
      <button id="mFixed" style="${btn};flex:1"></button>
    </div>

    <div id="secRandom" style="display:flex;flex-direction:column;gap:8px">
      <div>عدد التذكيرات في اليوم</div>
      <div id="countChips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      <div style="display:flex;gap:8px">
        <label style="flex:1">من<select id="wS" style="${field}">${opts(st.winStart)}</select></label>
        <label style="flex:1">إلى<select id="wE" style="${field}">${opts(st.winEnd)}</select></label>
      </div>
      <small id="todayList" style="opacity:.85"></small>
    </div>

    <div id="secFixed" style="display:flex;flex-direction:column;gap:8px">
      <div>اختار المواعيد (اضغط للتفعيل)</div>
      <div id="timeChips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      <div style="display:flex;gap:8px">
        <input id="customTime" type="time" style="${field};flex:1">
        <button id="addTime" style="${btn};background:#2f6b4a;color:#fff">➕ إضافة</button>
      </div>
    </div>

    <label style="display:flex;gap:8px;align-items:center">
      <input id="randMsg" type="checkbox"> رسالة مختلفة كل مرة (عشوائي)
    </label>
    <input id="ntfMsg" style="${field}" placeholder="اكتب نص التذكير">

    <hr style="width:100%;border:0;border-top:1px solid #3d7a56">
    <label>رقم تيليجرام (Chat ID)
      <input id="ntfChat" inputmode="numeric" style="${field}" placeholder="مثال: 123456789">
    </label>
    <small style="opacity:.85">البوت بتاعك هيبعتلك على الرقم ده. افتح البوت مرة واحدة واضغط Start، وتعرف رقمك من @userinfobot.</small>

    <button id="ntfSave" style="${btn};background:#9be07a;color:#0e2a1e">💾 حفظ</button>
    <button id="ntfBrowser" style="${btn};background:#2f6b4a;color:#fff">🔔 تفعيل إشعارات المتصفح</button>
    <button id="ntfClose" style="${btn};background:transparent;color:#fff;border:1px solid #3d7a56">إغلاق</button>`;
  wrap.appendChild(box);
  wrap.addEventListener("click", e => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);

  const $ = id => box.querySelector(id);
  const chip = (label, on, attrs) =>
    `<button ${attrs} style="padding:8px 12px;border-radius:999px;font:inherit;cursor:pointer;border:1px solid #3d7a56;${on ? "background:#9be07a;color:#0e2a1e" : "background:transparent;color:#fff"}">${label}</button>`;

  function render() {
    $("#mRandom").textContent = "🎲 عشوائي تلقائي";
    $("#mFixed").textContent = "⏰ مواعيد محددة";
    $("#mRandom").style.background = st.mode === "random" ? "#9be07a" : "#2f6b4a";
    $("#mRandom").style.color = st.mode === "random" ? "#0e2a1e" : "#fff";
    $("#mFixed").style.background = st.mode === "fixed" ? "#9be07a" : "#2f6b4a";
    $("#mFixed").style.color = st.mode === "fixed" ? "#0e2a1e" : "#fff";
    $("#secRandom").style.display = st.mode === "random" ? "flex" : "none";
    $("#secFixed").style.display = st.mode === "fixed" ? "flex" : "none";

    $("#countChips").innerHTML = [1, 2, 3, 4, 5].map(n => chip(n, st.count === n, `data-n="${n}"`)).join("");
    const all = [...new Set([...PRESETS, ...st.times])].sort();
    $("#timeChips").innerHTML = all.map(t => chip(t, st.times.has(t), `data-t="${t}"`)).join("");

    const preview = todayTimes({ mode: "random", count: st.count, winStart: st.winStart, winEnd: st.winEnd, tz: cfg.tz || Intl.DateTimeFormat().resolvedOptions().timeZone }, currentUser.uid);
    $("#todayList").textContent = "مواعيد النهاردة: " + preview.join("، ") + " (بتتغير كل يوم)";

    $("#ntfMsg").style.display = st.randomMsg ? "none" : "block";
    $("#randMsg").checked = st.randomMsg;

    $("#ntfChat").value = st.chatId;
  }
  $("#ntfMsg").value = cfg.message || "";
  render();

  $("#mRandom").onclick = () => { st.mode = "random"; render(); };
  $("#mFixed").onclick = () => { st.mode = "fixed"; render(); };
  $("#wS").onchange = e => { st.winStart = e.target.value; render(); };
  $("#wE").onchange = e => { st.winEnd = e.target.value; render(); };
  $("#randMsg").onchange = e => { st.randomMsg = e.target.checked; render(); };
  $("#countChips").onclick = e => { const n = e.target.closest("[data-n]"); if (n) { st.count = +n.dataset.n; render(); } };
  $("#timeChips").onclick = e => {
    const t = e.target.closest("[data-t]")?.dataset.t;
    if (!t) return;
    st.times.has(t) ? st.times.delete(t) : st.times.add(t);
    render();
  };
  $("#addTime").onclick = () => {
    const v = $("#customTime").value;
    if (v) { st.times.add(v); $("#customTime").value = ""; render(); }
  };
  $("#ntfChat").oninput = e => { st.chatId = toLatinDigits(e.target.value).trim(); };
  $("#ntfClose").onclick = closeModal;

  $("#ntfSave").onclick = async ev => {
    const b = ev.currentTarget;
    if (st.chatId && !/^-?\d{5,20}$/.test(st.chatId)) { notifyUser("Chat ID لازم يكون أرقام فقط."); return; }
    if (st.mode === "random" && toMin(st.winEnd) - toMin(st.winStart) < st.count * 30) {
      notifyUser("الفترة قصيرة على العدد ده. وسّع الفترة أو قلّل عدد التذكيرات."); return;
    }
    const times = [...st.times].sort();
    if (st.mode === "fixed" && !times.length) { notifyUser("اختار موعد واحد على الأقل."); return; }
    const message = $("#ntfMsg").value.trim().slice(0, 300);
    if (!st.randomMsg && !message) { notifyUser("اكتب نص التذكير أو فعّل الرسالة العشوائية."); return; }
    b.disabled = true;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo";
      const data = {
        mode: st.mode, count: st.count, winStart: st.winStart, winEnd: st.winEnd,
        times, randomMsg: st.randomMsg, message, chatId: st.chatId, tz,
        enabled: true, updatedAt: serverTimestamp()
      };
      await setDoc(settingsRef(), data, { merge: true });
      writeLocalCfg({ ...readLocalCfg(), ...data, updatedAt: undefined, uid: currentUser.uid });
      notifyUser("اتحفظت الإعدادات ✔");
      closeModal();
    } catch (e) {
      console.error("[Notifications] save failed", e);
      notifyUser(explainError(e));
    }
    b.disabled = false;
  };

  $("#ntfBrowser").onclick = async ev => {
    const b = ev.currentTarget;
    const old = b.textContent;
    b.disabled = true;
    b.textContent = "⏳ جاري التفعيل...";
    try {
      if (!("Notification" in window)) throw new Error("المتصفح لا يدعم إشعارات الويب.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("إذن الإشعارات مرفوض. فعّله من إعدادات الموقع.");
      await showLocal("غابتي 🌳", "إشعارات المتصفح شغالة ✔");
      try {
        await enablePush();
        notifyUser("تم تفعيل Push ✔ هتوصلك التذكيرات حتى والموقع مقفول.");
        b.textContent = "✅ إشعارات المتصفح مفعّلة";
      } catch (e) {
        console.error("[Notifications] push failed", e);
        notifyUser("الإشعارات المحلية شغالة (والموقع مفتوح). Push: " + explainError(e));
        b.textContent = old;
      }
    } catch (e) {
      notifyUser(explainError(e));
      b.textContent = old;
    }
    b.disabled = false;
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
