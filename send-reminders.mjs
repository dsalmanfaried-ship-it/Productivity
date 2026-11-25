// يشتغل كل 5 دقايق من GitHub Actions:
// يبعت التذكيرات (تيليجرام على الرقم اللي المستخدم كتبه + Push المتصفح).
// الأسرار من GitHub Secrets فقط.
import admin from "firebase-admin";

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const FORCE = process.env.FORCE === "true";
const WINDOW_MIN = Number(process.env.WINDOW_MIN || 14);

if (!SA) { console.error("FIREBASE_SERVICE_ACCOUNT secret is missing"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();

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
const fmt12 = t => { const m = toMin(t), h = Math.floor(m / 60) % 24; return ((h % 12) || 12) + ":" + String(m % 60).padStart(2, "0") + " " + (h >= 12 ? "م" : "ص"); };
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


// ---- إحصائيات المذاكرة (نفس حساب الموقع) ----
const fmtDur = m => {
  m = Math.max(0, Math.round(m));
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} س ${r} د` : `${h} س`) : `${r} د`;
};
function dayOf(ms, tz) {
  let zone = tz || "Africa/Cairo";
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); } catch (e) { zone = "Africa/Cairo"; }
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const g = t => p.find(x => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function todayMinutes(sessions, tz) {
  const today = dayOf(Date.now(), tz);
  let mins = 0;
  for (const s of Array.isArray(sessions) ? sessions : [])
    if (s && s.start && s.ok && dayOf(s.start, tz) === today) mins += +s.mins || 0;
  return mins;
}
// الجلسات متخزنة في users/{uid}.data كـ JSON (نفس مزامنة الغابة)
async function goalLine(userRef, cfg) {
  const goal = Math.max(0, +cfg.goalMin || 0);
  if (!goal) return "";
  try {
    const snap = await userRef.get();
    const raw = snap.exists ? snap.get("data") : null;
    const sessions = raw ? (JSON.parse(raw).sessions || []) : [];
    const done = todayMinutes(sessions, cfg.tz);
    const pct = Math.min(100, Math.round(done / goal * 100));
    const bar = "🟩".repeat(Math.round(pct / 10)) + "⬜".repeat(10 - Math.round(pct / 10));
    return done >= goal
      ? `\n🎯 ذاكرت ${fmtDur(done)} من ${fmtDur(goal)} (${pct}%)\n🎉 حققت هدفك النهاردة، برافو!`
      : `\n🎯 ذاكرت ${fmtDur(done)} من ${fmtDur(goal)}\n${bar} ${pct}%\n⏳ فاضل: ${fmtDur(goal - done)}`;
  } catch (e) { console.warn("goal stats error:", e.message); return ""; }
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

// ---- ردود البوت: أي حد يكلّم البوت يستلم رقمه (Chat ID)، و/start CODE بيربط حسابه تلقائي، و/stop بيوقف التذكيرات ----
// <handleUpdates>
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const LINK_RE = /^[A-Za-z0-9_-]{12,64}$/;
async function handleUpdates(updates, entries, send, del) {
  const replied = new Set();
  for (const u of updates) {
    const m = u && u.message;
    if (!m || !m.chat || m.chat.type !== "private" || typeof m.text !== "string") continue;
    const id = String(m.chat.id);
    const [cmdRaw, argRaw] = m.text.trim().split(/\s+/, 2);
    const cmd = (cmdRaw || "").toLowerCase().replace(/@\w+$/, "");
    const arg = argRaw || "";
    const mine = entries.filter(e => String(e.cfg.chatId || "") === id);
    let text;

    if (cmd === "/stop") {
      for (const e of mine) { await e.ref.set({ chatId: del() }, { merge: true }); delete e.cfg.chatId; }
      text = mine.length
        ? "تمام ✅ وقّفت التذكيرات على التليجرام. تقدر ترجّعها في أي وقت من غابتي ← حسابي ← إعدادات الإشعارات."
        : "مفيش تذكيرات شغالة على الحساب ده.";
    } else if (cmd === "/start" && LINK_RE.test(arg) && entries.some(e => e.cfg.linkCode === arg)) {
      const e = entries.find(x => x.cfg.linkCode === arg);
      await e.ref.set({ chatId: id, linkCode: del() }, { merge: true });
      e.cfg.chatId = id; delete e.cfg.linkCode;
      text = "اتربط حسابك في غابتي ✅\nهتوصلك التذكيرات هنا في المواعيد اللي اخترتها.\n\nرقمك (Chat ID): <code>" + esc(id) + "</code>\nلإيقاف التذكيرات ابعت /stop";
    } else if (mine.length) {
      text = "حسابك مربوط بغابتي ✅ هتوصلك التذكيرات هنا.\nرقمك (Chat ID): <code>" + esc(id) + "</code>\nلإيقاف التذكيرات ابعت /stop";
    } else {
      text = "أهلاً بيك في غابتي 🌳\nرقمك (Chat ID): <code>" + esc(id) + "</code>\n\nانسخ الرقم (دوس عليه) والصقه في غابتي ← حسابي ← إعدادات الإشعارات ← رقم تيليجرام، واضغط حفظ. بعدها التذكيرات هتوصلك هنا في المواعيد اللي تختارها.";
    }
    if (replied.has(id)) continue;
    replied.add(id);
    await send({ chat_id: id, text, parse_mode: "HTML" });
  }
}
// </handleUpdates>

async function pollTelegram(entries) {
  if (!BOT) return;
  const wh = await tg("getWebhookInfo");
  if (wh.ok && wh.result && wh.result.url) { console.log("telegram: webhook شغال (الـ Worker بيرد على الرسايل)، تخطّيت getUpdates."); return; }
  const r = await tg("getUpdates", { timeout: 0, limit: 100, allowed_updates: ["message"] });
  if (!r.ok) {
    if (r.error_code === 409) console.warn("Telegram: البوت عليه webhook شغال. امسحه بـ deleteWebhook عشان البوت يرد.");
    return;
  }
  const updates = r.result || [];
  if (!updates.length) return;
  try {
    await handleUpdates(updates, entries, b => tg("sendMessage", b), () => admin.firestore.FieldValue.delete());
  } catch (e) { console.warn("telegram updates error:", e.message); }
  // تأكيد استلام التحديثات عشان ما تتكررش
  await tg("getUpdates", { offset: Math.max(...updates.map(x => x.update_id)) + 1, limit: 1, timeout: 0 });
  console.log(`telegram: handled ${updates.length} update(s)`);
}

// ---- تحميل إعدادات كل المستخدمين ----
const entries = [];
for (const userRef of await db.collection("users").listDocuments()) {
  const ref = userRef.collection("settings").doc("reminders");
  const snap = await ref.get();
  if (snap.exists) entries.push({ userRef, ref, cfg: snap.data() });
}

await pollTelegram(entries);

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
  const body = pickMessage(cfg) + await goalLine(userRef, cfg);
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
  console.log(`user ${userRef.id}: mode=${cfg.mode || "fixed"} today=${times.map(fmt12).join("، ")} due=${due.map(t => t === "test" ? t : fmt12(t)).join("، ")} ok=${ok}`);
}
console.log(`done. users notified: ${sent}`);
