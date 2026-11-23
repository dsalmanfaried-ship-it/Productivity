// يشتغل كل 5 دقايق من GitHub Actions:
// 1) يربط تيليجرام تلقائيًا لما المستخدم يضغط Start من رابط التطبيق
// 2) يبعت التذكيرات (تيليجرام + Push المتصفح). الأسرار من GitHub Secrets فقط.
import admin from "firebase-admin";

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const FORCE = process.env.FORCE === "true";
const WINDOW_MIN = Number(process.env.WINDOW_MIN || 14);

if (!SA) { console.error("FIREBASE_SERVICE_ACCOUNT secret is missing"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();
const FV = admin.firestore.FieldValue;

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


async function tg(method, body) {
  if (!BOT) return { ok: false };
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {})
    });
    const json = await res.json();
    if (!json.ok) console.warn(`Telegram ${method} failed:`, json.description);
    return json;
  } catch (e) { console.warn(`Telegram ${method} error:`, e.message); return { ok: false }; }
}

async function sendPush(userRef, title, body) {
  const snap = await userRef.collection("fcmTokens").get();
  const tokens = snap.docs.map(d => d.get("token") || d.id);
  if (!tokens.length) return false;
  const r = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title, body, url: "./", tag: "ghabaty-reminder" },
    webpush: { headers: { Urgency: "high", TTL: "3600" } }
  });
  const dead = new Set();
  r.responses.forEach((x, i) => {
    const c = x.error?.code;
    if (c === "messaging/registration-token-not-registered" || c === "messaging/invalid-registration-token") dead.add(tokens[i]);
  });
  await Promise.all(snap.docs.filter(d => dead.has(d.get("token") || d.id)).map(d => d.ref.delete()));
  return r.successCount > 0;
}

// ---- تحميل إعدادات كل المستخدمين ----
const entries = [];
for (const userRef of await db.collection("users").listDocuments()) {
  const ref = userRef.collection("settings").doc("reminders");
  const snap = await ref.get();
  if (snap.exists) entries.push({ userRef, ref, cfg: snap.data() });
}

// ---- ربط تيليجرام تلقائيًا ----
if (BOT) {
  const me = await tg("getMe");
  const botName = me.result?.username;
  if (botName) {
    for (const e of entries) if (e.cfg.botUsername !== botName) {
      await e.ref.set({ botUsername: botName }, { merge: true });
      e.cfg.botUsername = botName;
    }
  }
  const upd = await tg("getUpdates", { timeout: 0, allowed_updates: ["message"] });
  let last = 0;
  for (const u of upd.result || []) {
    last = Math.max(last, u.update_id);
    const m = u.message;
    if (!m || m.chat?.type !== "private") continue;
    const text = m.text || "";
    if (!/^\/start/.test(text)) continue;
    const code = (text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9]{6,32})$/) || [])[1];
    const e = code && entries.find(x => x.cfg.linkCode === code && Date.now() - (x.cfg.linkAt || 0) < 24 * 3600 * 1000);
    if (e) {
      await e.ref.set({ chatId: String(m.chat.id), linkCode: FV.delete(), linkAt: FV.delete() }, { merge: true });
      e.cfg.chatId = String(m.chat.id);
      await tg("sendMessage", { chat_id: m.chat.id, text: "تم ربط غابتي بتيليجرام ✅ هتوصلك التذكيرات هنا." });
      console.log(`linked telegram for user ${e.userRef.id}`);
    } else {
      await tg("sendMessage", { chat_id: m.chat.id, text: "افتح غابتي: حسابي > إعدادات الإشعارات > ربط تيليجرام تلقائيًا، وبعدين اضغط الرابط اللي هيظهر." });
    }
  }
  if (last) await tg("getUpdates", { offset: last + 1, timeout: 0 });
}

// ---- إرسال التذكيرات ----
let sent = 0;
for (const { userRef, ref, cfg } of entries) {
  const times = todayTimes(cfg, userRef.id);
  if (!FORCE && (!cfg.enabled || !times.length)) continue;

  const now = nowIn(cfg.tz);
  const keep = Object.fromEntries(Object.entries(cfg.sent || {}).filter(([k]) => k.startsWith(now.date)));
  const due = FORCE ? ["test"] : times.filter(t => {
    const diff = now.minutes - toMin(t);
    return diff >= 0 && diff <= WINDOW_MIN && !keep[`${now.date}_${t}`];
  });
  if (!due.length) continue;

  const title = "غابتي 🌳";
  const body = pickMessage(cfg);
  const results = await Promise.allSettled([
    cfg.chatId ? tg("sendMessage", { chat_id: cfg.chatId, text: `${title}\n${body}` }).then(r => r.ok === true) : false,
    sendPush(userRef, title, body)
  ]);
  const ok = results.some(r => r.status === "fulfilled" && r.value === true);
  results.forEach(r => r.status === "rejected" && console.warn("send error:", r.reason?.message || r.reason));

  if (ok && !FORCE) {
    for (const t of due) keep[`${now.date}_${t}`] = true;
    await ref.set({ sent: keep }, { merge: true });
  }
  if (ok) sent++;
  console.log(`user ${userRef.id}: mode=${cfg.mode || "fixed"} today=${times.join(",")} due=${due.join(",")} ok=${ok}`);
}
console.log(`done. users notified: ${sent}`);
