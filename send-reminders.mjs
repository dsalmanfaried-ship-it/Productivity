// يشتغل كل 5 دقائق من GitHub Actions: يقرأ مواعيد كل مستخدم من Firestore
// ويبعت تذكير على تيليجرام و Push المتصفح. الأسرار من GitHub Secrets فقط.
import admin from "firebase-admin";

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const FORCE = process.env.FORCE === "true";          // اختبار يدوي: يبعت فورًا
const WINDOW_MIN = Number(process.env.WINDOW_MIN || 14); // تحمّل تأخير GitHub

if (!SA) { console.error("FIREBASE_SERVICE_ACCOUNT secret is missing"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();

function nowIn(tz) {
  let zone = tz;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); } catch { zone = "Africa/Cairo"; }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, minutes: +g("hour") * 60 + +g("minute") };
}

async function sendTelegram(chatId, text) {
  if (!BOT || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!res.ok) console.warn("Telegram failed:", res.status, await res.text());
  return res.ok;
}

async function sendPush(userRef, title, body) {
  const snap = await userRef.collection("fcmTokens").get();
  const tokens = snap.docs.map(d => d.get("token") || d.id);
  if (!tokens.length) return false;
  const r = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title, body, url: "./", tag: "ghabaty-reminder" }, // data فقط عشان ميظهرش إشعارين
    webpush: { headers: { Urgency: "high", TTL: "3600" } }
  });
  const dead = [];
  r.responses.forEach((x, i) => {
    const c = x.error?.code;
    if (c === "messaging/registration-token-not-registered" || c === "messaging/invalid-registration-token")
      dead.push(tokens[i]);
  });
  await Promise.all(snap.docs.filter(d => dead.includes(d.get("token") || d.id)).map(d => d.ref.delete()));
  return r.successCount > 0;
}

const users = await db.collection("users").listDocuments();
let sent = 0;
for (const userRef of users) {
  const ref = userRef.collection("settings").doc("reminders");
  const snap = await ref.get();
  if (!snap.exists) continue;
  const cfg = snap.data();
  if (!cfg.enabled || !Array.isArray(cfg.times) || !cfg.times.length) continue;

  const now = nowIn(cfg.tz);
  const prev = cfg.sent || {};
  const keep = Object.fromEntries(Object.entries(prev).filter(([k]) => k.startsWith(now.date)));
  const title = "غابتي 🌳";
  const body = cfg.message || "حان وقت التركيز 🌳";

  const due = FORCE ? ["test"] : cfg.times.filter(t => {
    const [h, m] = t.split(":").map(Number);
    const diff = now.minutes - (h * 60 + m);
    return diff >= 0 && diff <= WINDOW_MIN && !keep[`${now.date}_${t}`];
  });
  if (!due.length) continue;

  const results = await Promise.allSettled([
    sendTelegram(cfg.chatId, `${title}\n${body}`),
    sendPush(userRef, title, body)
  ]);
  const ok = results.some(r => r.status === "fulfilled" && r.value === true);
  results.forEach(r => r.status === "rejected" && console.warn("send error:", r.reason?.message || r.reason));

  if (ok && !FORCE) {
    for (const t of due) keep[`${now.date}_${t}`] = true;
    await ref.set({ sent: keep }, { merge: true });
  }
  if (ok) sent++;
  console.log(`user ${userRef.id}: due=${due.join(",")} ok=${ok}`);
}
console.log(`done. users notified: ${sent}`);
