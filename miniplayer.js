/* غابتي — النافذة الصغيرة (Picture-in-Picture).
   نسخة مصغّرة من شاشة التركيز: الشجرة والتايمر + تحكم في الوقت والصوت. بتفضل فوق أي نافذة تانية،
   وطول ما هي مفتوحة الشجرة مش بتموت لو خرجت من التبويب (مثلًا عشان تشغّل فيديو المذاكرة).
   بتستخدم دوال التطبيق نفسها. مستوى الصوت محتاج applyVol الموجودة في index.html. */

const LS = "ghabaty-mini";
// [الاسم، لون الخلفية، لون الأرقام]
const BGS = [
  ["شكل الموقع", "#0f3a2d", "#f4f1e4"],
  ["مخفي (أسود)", "#000000", "#4a4a4a"],
  ["مخفي (أبيض)", "#ffffff", "#c2c2c2"],
  ["أسود", "#000000", "#eaeaea"],
  ["رمادي غامق", "#1f1f1f", "#d6d6d6"],
  ["أخضر الغابة", "#0e2a1e", "#9be07a"],
  ["كحلي", "#0b1a33", "#8fb8ff"],
  ["بني", "#2a1a10", "#e6c9a8"],
  ["أبيض", "#ffffff", "#222222"],
  ["رمادي فاتح", "#d9d9d9", "#333333"]
];

let win = null, vid = null, cv = null, ticker = null;
let mode = null; // "doc" (نافذة PiP حقيقية) | "video" (PiP فيديو: موبايل/تابلت/سفاري) | "popup" (نافذة عادية)
let muted = false, lastSave = 0, bgIdx = 0;
try { bgIdx = Math.min(Math.max(+JSON.parse(localStorage.getItem(LS)).theme || 0, 0), BGS.length - 1); } catch (e) {}

const say = m => (typeof window.toast === "function" ? window.toast(m) : console.info("[Mini]", m));
const appReady = () => typeof S !== "undefined" && S && typeof fmt === "function" && typeof pauseRun === "function" && typeof resumeRun === "function";
const isOpen = () => mode !== null && (mode === "video" || !!(win && !win.closed));
const canDoc = () => !!window.documentPictureInPicture;
const canVideo = () => !!(document.pictureInPictureEnabled && HTMLCanvasElement.prototype.captureStream && HTMLVideoElement.prototype.requestPictureInPicture);

// كتم الصوت من غير ما نوقف AudioContext (عشان رنّة نهاية الجلسة تفضل شغالة)
function applyMute() {
  window.ghMuted = muted;
  try { applyVol(); } catch (e) { try { au.muted = muted; } catch (_) {} }
}

function paint() {
  if (mode === "video") { drawCanvas(); return; }
  if (!isOpen()) return;
  const [, bg, fg] = BGS[bgIdx];
  const b = win.document.body;
  b.classList.toggle("site", bgIdx === 0);
  b.style.setProperty("--bg", bg);
  b.style.setProperty("--ink", fg);
}

/* منطق مشترك: بيحسب الوقت ويحافظ على الشجرة لو التبويب مخفي */
const idleText = () => (S.mode === "down" ? fmt(S.dur * 60000) : "00:00");
let cur = { text: "--:--", paused: true, state: "idle", p: 1, species: "oak" };
function core() {
  if (!appReady()) return cur;
  const now = Date.now();
  const a = S.active;
  if (!a && S.rest) {
    if (document.hidden) restTick(); // تيك البريك بيتبطّأ في التبويب المخفي
    if (S.rest) {
      const el = now - S.rest.start;
      return (cur = { text: fmt(S.rest.dur - el), paused: false, state: "rest", p: el / S.rest.dur, species: S.species });
    }
  }
  if (!a) return (cur = { text: idleText(), paused: true, state: "idle", p: 1, species: S.species });
  const el = (a.pausedAt || now) - a.start;
  const remain = a.mode === "down" ? a.dur - el : el;
  if (!a.pausedAt && document.hidden) {
    // التبويب مخفي: تيك التطبيق واقف، فإحنا اللي بنكمّل الحساب ونمنع موت الشجرة
    try { clearTimeout(killT); } catch (e) {}
    delete a.leftAt;
    a.lastSeen = now;
    if (a.mode === "down" && el >= a.dur) { finish(true); return core(); }
    document.title = "🌱 " + fmt(remain);
    if (now - lastSave > 5000) { lastSave = now; try { qSave(); save(); } catch (e) {} }
  }
  return (cur = { text: fmt(remain), paused: !!a.pausedAt, state: "run", p: progress(a, el), species: a.species });
}

/* ---------- الأوامر ---------- */
let note = "", noteT = null;
function tell(m) { note = m; clearTimeout(noteT); noteT = setTimeout(() => { note = ""; refresh(); }, 3500); }
// بيشغّل نفس أوامر أزرار الموقع (data-act)
function act(name, v) {
  note = "";
  const b = document.createElement("button");
  b.dataset.act = name;
  if (v !== undefined) b.dataset.v = v;
  b.style.display = "none";
  document.body.append(b);
  b.click();
  b.remove();
  refresh();
}
function togglePlay() {
  if (!appReady()) return;
  const a = S.active;
  if (!a) {
    if (!S.rest) { startRun(); if (!S.active) tell("الصلاة قريبة، مفيش وقت كفاية لجلسة 🕌"); }
  }
  else if (a.pausedAt) resumeRun();
  else pauseRun();
  setTimeout(refresh, 80);
}
function toggleMute() { muted = !muted; applyMute(); refresh(); }

// تغيير المدة: قبل الجلسة بتغيّر المدة المختارة، وأثناءها بتزوّد/تنقّص الجلسة الحالية
function changeTime(delta) {
  if (!appReady()) return;
  const a = S.active;
  if (a) {
    if (a.mode !== "down") return;
    const el = (a.pausedAt || Date.now()) - a.start;
    const next = Math.min(180 * 60000, a.dur + delta * 60000);
    if (delta < 0 && (next < 5 * 60000 || next <= el + 60000)) { tell("مينفعش تقلّل أكتر من كده"); refresh(); return; }
    a.dur = next;
    lastSec = -1;
  } else {
    if (S.autoDur || S.mode !== "down") return;
    S.dur = Math.min(180, Math.max(5, S.dur + delta));
  }
  save(); render();
  if (S.active) tick();
  refresh();
}
function setMode(m) { if (!S.active) { S.mode = m; save(); render(); refresh(); } }
function setSound(kind) {
  S.sound = kind;
  save();
  if (S.active && !S.active.pausedAt) startSound(kind);
  if (!S.active) render();
  refresh();
}
function setVolume(v) {
  S.vol = v;
  if (muted && v > 0) muted = false;
  applyMute();
  save();
  refresh();
}

/* ---------- الرسم: نافذة PiP / Popup (نسخة مصغّرة من الموقع) ---------- */
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{--bg:#0f3a2d;--ink:#f4f1e4;background:var(--bg);color:var(--ink);font-family:Cairo,system-ui,sans-serif;overflow:auto;user-select:none}
body.site{background:radial-gradient(500px 300px at 50% -10%,#1f7a5a 0%,#0f3a2d 65%) fixed #0f3a2d}
.wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:8px 10px}
[hidden]{display:none!important}
button,select{font:inherit;color:inherit;border:0;cursor:pointer;background:rgba(128,128,128,.25);border-radius:999px}
button:disabled{opacity:.35;cursor:default}
.stage{position:relative;width:min(56vw,calc(100vh - 290px),190px);aspect-ratio:1;flex:none}
.stage svg{width:100%;height:100%}
.ring{position:absolute;inset:0;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:6;stroke:rgba(128,128,128,.25)}
.ring .p{stroke:#9be07a;stroke-linecap:round;stroke-dasharray:578}
.rest .ring .p{stroke:#ffd45e}
.tree{position:absolute;inset:12% 12% 8%;display:flex;align-items:center;justify-content:center;font-size:20vmin}
.timerow{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;direction:ltr}
.time{font-size:38px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.adj{width:36px;height:36px;font-weight:800;font-size:13px;flex:none}
.sub{font-size:12px;opacity:.8;text-align:center;min-height:18px}
.row{display:flex;gap:6px;align-items:center;justify-content:center;width:100%;max-width:280px}
.row button{padding:7px 10px;font-size:13px;font-weight:700}
.seg button{flex:1}
.seg button.on,.main{background:#9be07a;color:#12351f}
.main{flex:1;font-weight:800}
select{flex:1;min-width:0;padding:6px 10px;font-size:13px}
option{background:#143f31;color:#fff}
input[type=range]{flex:1;min-width:0;accent-color:#9be07a;direction:ltr}
.icon{width:34px;height:34px;flex:none;padding:0!important}
.mini{display:none}
/* لو صغّرت النافذة: تايمر + زرين بس */
@media (max-height:360px){.stage{display:none}}
@media (max-height:230px){.sub,.seg,.breaks,.extra{display:none!important}}
@media (max-height:130px){.wrap{flex-direction:row;padding:0 8px}.row,.timerow .adj,.sub{display:none!important}.timerow{flex:1;width:auto}.time{font-size:26px}.mini{display:block}}
`;
const HTML = `<div class="wrap">
  <div class="stage"><svg class="ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92"/><circle class="p" id="ring" cx="100" cy="100" r="92"/></svg><div class="tree" id="tree"></div></div>
  <div class="timerow"><button class="adj" id="less" title="نقّص ٥ دقايق">−5</button><div class="time" id="time"></div><button class="adj" id="more" title="زوّد ٥ دقايق">+5</button></div>
  <div class="sub" id="sub" dir="rtl"></div>
  <div class="row seg" id="seg" dir="rtl"><button id="down">⏳ مؤقت</button><button id="up">⏱️ ستوب ووتش</button></div>
  <div class="row" id="acts" dir="rtl"><button class="main" id="play"></button><button id="done">خلصت ✔</button><button id="give">استسلم 🥀</button><button id="brk">☕ بريك</button><button id="endr">إنهاء البريك</button></div>
  <div class="row breaks" id="breaks" dir="rtl"></div>
  <div class="row extra" id="yasin" dir="rtl"><button id="yt">🎧 يس ⏯</button><button id="yn">⏭ شيخ تاني</button></div>
  <div class="row extra" id="snd" dir="rtl"><select id="sound" title="صوت الخلفية"><option value="none">بدون صوت</option><option value="quran">سورة البقرة 📖</option><option value="rain">مطر 🌧️</option><option value="forest">غابة 🐦</option></select></div>
  <div class="row extra" dir="rtl"><button class="icon" id="mute" title="كتم / تشغيل الصوت"></button><input type="range" id="vol" min="0" max="100" step="5" title="مستوى الصوت"></div>
  <button class="icon mini" id="mute2" title="كتم / تشغيل الصوت"></button><button class="icon mini" id="play2" title="إيقاف / تشغيل"></button>
</div>`;

let ui = null, treeKey = "", giveArmed = 0, showBreaks = false;
const set = (el, prop, v) => { if (el[prop] !== v) el[prop] = v; };
const treeKeyOf = st => st.state === "rest" ? "rest" : st.species + "|" + (st.p < 0.1 ? 0 : Math.round(st.p * 50));

function refreshDom() {
  if (!ui || !appReady()) return;
  const st = core(), a = S.active, run = st.state === "run", rest = st.state === "rest", idle = st.state === "idle";
  const timer = a ? a.mode === "down" : S.mode === "down";
  set(ui.time, "textContent", st.text);
  ui.root.classList.toggle("rest", rest);
  ui.ring.style.strokeDashoffset = idle ? 578 : rest ? 578 * st.p : 578 * (1 - st.p);
  const key = treeKeyOf(st);
  if (key !== treeKey) { treeKey = key; ui.tree.innerHTML = rest ? "☕" : treeSVG(st.species, st.p, false, "0 0 200 190"); }

  const canAdj = !rest && timer && (run || !S.autoDur);
  for (const b of [ui.less, ui.more]) { b.style.visibility = canAdj ? "visible" : "hidden"; }
  const sub = note || (rest ? "بريك المذاكرة" : run ? (st.paused ? "الجلسة واقفة (أقصى حد ٣٠ دقيقة)" : tagOf(a.tag).name) : (timer && S.autoDur ? "المدة لحد الصلاة −٥ دقايق" : tagOf(S.tag).name));
  set(ui.sub, "textContent", sub);

  ui.seg.hidden = !idle;
  ui.down.classList.toggle("on", S.mode === "down");
  ui.up.classList.toggle("on", S.mode === "up");
  ui.play.hidden = rest;
  const label = idle ? "ازرع 🌱" : st.paused ? "استئناف ▶" : "إيقاف ⏸";
  set(ui.play, "textContent", label);
  set(ui.play2, "textContent", st.paused ? "▶" : "⏸");
  ui.play2.hidden = rest;
  ui.done.hidden = !(run && a.mode === "up" && !st.paused);
  ui.give.hidden = !run;
  set(ui.give, "textContent", Date.now() < giveArmed ? "متأكد؟ 🥀" : "استسلم 🥀");
  ui.brk.hidden = !idle;
  ui.endr.hidden = !rest;
  ui.breaks.hidden = !(idle && showBreaks);
  ui.yasin.hidden = !(rest && S.yasin.on);
  ui.snd.hidden = rest;
  if (ui.doc.activeElement !== ui.sound) set(ui.sound, "value", S.sound);
  if (ui.doc.activeElement !== ui.vol) set(ui.vol, "value", String(Math.round((muted ? 0 : S.vol ?? 1) * 100)));
  set(ui.mute, "textContent", muted ? "🔇" : "🔊");
  set(ui.mute2, "textContent", muted ? "🔇" : "🔊");
}

/* ---------- الرسم: PiP فيديو (كانفس) ---------- */
let treeImg = null, imgKey = "";
function drawCanvas() {
  if (!cv) return;
  const W = cv.width, H = cv.height, c = cv.getContext("2d");
  const [, bg, fg] = BGS[bgIdx];
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.fillStyle = fg; c.textAlign = "center"; c.textBaseline = "middle"; c.direction = "ltr";
  const withTree = bgIdx === 0 && appReady();
  if (withTree) {
    const key = treeKeyOf(cur);
    if (key !== imgKey) {
      imgKey = key; treeImg = null;
      if (cur.state !== "rest") {
        const img = new Image();
        img.onload = () => { if (imgKey === key) { treeImg = img; drawCanvas(); } };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(treeSVG(cur.species, cur.p, false, "0 0 200 190").replace("<svg ", '<svg width="200" height="190" '));
      }
    }
    if (cur.state === "rest") { c.font = "90px system-ui,sans-serif"; c.fillText("☕", 110, H / 2); }
    else if (treeImg) c.drawImage(treeImg, 20, 50, 180, 171);
    c.lineWidth = 8; c.lineCap = "round";
    c.strokeStyle = "rgba(128,128,128,.3)";
    c.beginPath(); c.arc(110, H / 2, 100, 0, Math.PI * 2); c.stroke();
    if (cur.state !== "idle" && cur.p > 0) {
      c.strokeStyle = cur.state === "rest" ? "#ffd45e" : "#9be07a";
      c.beginPath(); c.arc(110, H / 2, 100, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cur.p)); c.stroke();
    }
    c.fillStyle = fg;
  }
  const x = withTree ? 345 : W / 2;
  c.font = `700 ${withTree ? (cur.text.length > 5 ? 58 : 78) : 120}px system-ui,sans-serif`;
  c.fillText(cur.text, x, H / 2 - 10);
  c.font = "34px system-ui,sans-serif";
  c.fillText((cur.state === "run" && cur.paused ? "⏸ " : "") + (muted ? "🔇" : ""), x, H - 48);
}
function refreshVideo() {
  core();
  drawCanvas();
  try { navigator.mediaSession.playbackState = cur.paused ? "paused" : "playing"; } catch (e) {}
}

function refresh() { if (mode === "video") { refreshVideo(); refreshControls(); } else refreshDom(); }

/* مؤقت مش بيتبطّأ لما التبويب يتخفي (Worker) */
function startTicker(fn) {
  stopTicker();
  let usedInterval = null;
  const fallback = () => { if (!usedInterval) usedInterval = setInterval(fn, 500); };
  try {
    const u = URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),500)"], { type: "text/javascript" }));
    const w = new Worker(u);
    w.onmessage = fn;
    w.onerror = fallback;
    ticker = { stop() { try { w.terminate(); URL.revokeObjectURL(u); } catch (e) {} if (usedInterval) clearInterval(usedInterval); } };
  } catch (e) {
    fallback();
    ticker = { stop() { clearInterval(usedInterval); } };
  }
}
function stopTicker() { try { ticker?.stop(); } catch (e) {} ticker = null; }

/* ---------- فتح النوافذ ---------- */
function buildDomWindow(w) {
  win = w;
  const d = w.document;
  d.title = "غابتي";
  d.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap">';
  const style = d.createElement("style");
  style.textContent = CSS;
  d.head.append(style);
  d.body.innerHTML = HTML;
  ui = { doc: d, root: d.body.firstElementChild };
  d.querySelectorAll("[id]").forEach(e => (ui[e.id] = e));
  treeKey = ""; showBreaks = false; giveArmed = 0;
  ui.less.onclick = () => changeTime(-5);
  ui.more.onclick = () => changeTime(5);
  ui.down.onclick = () => setMode("down");
  ui.up.onclick = () => setMode("up");
  ui.play.onclick = ui.play2.onclick = togglePlay;
  ui.mute.onclick = ui.mute2.onclick = toggleMute;
  ui.done.onclick = () => { finish(true); refresh(); };
  ui.give.onclick = () => {
    note = "";
    if (Date.now() < giveArmed) { giveArmed = 0; finish(false); } else giveArmed = Date.now() + 3000;
    refresh();
  };
  ui.brk.onclick = () => { showBreaks = !showBreaks; refresh(); };
  [5, 10, 15, 20].forEach(m => {
    const b = d.createElement("button");
    b.textContent = m + " د";
    b.onclick = () => { showBreaks = false; act("rest", m); };
    ui.breaks.append(b);
  });
  ui.endr.onclick = () => act("endRest");
  ui.yt.onclick = () => act("ytoggle");
  ui.yn.onclick = () => act("ynext");
  ui.sound.onchange = () => { setSound(ui.sound.value); ui.sound.blur(); };
  ui.vol.oninput = () => setVolume(ui.vol.value / 100);
  ui.vol.onchange = () => ui.vol.blur();
  paint();
  startTicker(refreshDom);
  refreshDom();
  w.addEventListener("pagehide", onClosed);
}

async function openDoc() {
  const w = await window.documentPictureInPicture.requestWindow({ width: 300, height: 500 });
  mode = "doc";
  buildDomWindow(w);
  return true;
}

async function openVideo() {
  cv = document.createElement("canvas");
  cv.width = 480; cv.height = 270;
  vid = document.createElement("video");
  vid.muted = true; vid.playsInline = true; vid.setAttribute("playsinline", "");
  vid.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.append(vid);
  imgKey = ""; treeImg = null;
  core(); drawCanvas();
  vid.srcObject = cv.captureStream(5);
  try {
    await vid.play();
    await vid.requestPictureInPicture();
  } catch (e) {
    vid.srcObject = null; vid.remove(); vid = null; cv = null;
    throw e;
  }
  mode = "video";
  vid.addEventListener("leavepictureinpicture", onClosed, { once: true });
  try {
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({ title: "غابتي", artist: "التايمر" });
    ms.setActionHandler("play", () => { if (!S.active || S.active.pausedAt) togglePlay(); });
    ms.setActionHandler("pause", () => { if (S.active && !S.active.pausedAt) togglePlay(); });
  } catch (e) {}
  startTicker(refreshVideo);
  refreshVideo();
  return true;
}

function openPopup() {
  const w = window.open("", "ghabatyMini", "popup=yes,width=300,height=500,left=40,top=40");
  if (!w) throw new Error("popup-blocked");
  mode = "popup";
  buildDomWindow(w);
  return true;
}

async function openMini() {
  if (isOpen()) { try { mode === "video" ? null : win.focus(); } catch (e) {} return; }
  if (!appReady()) { say("التطبيق لسه بيحمّل، جرّب تاني بعد ثانية."); return; }
  // نجهّز الصوت من ضغطة المستخدم هنا، عشان تغيير الصوت من النافذة الصغيرة يشتغل
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) {}
  const tries = [];
  if (canDoc()) tries.push(openDoc);
  if (canVideo()) tries.push(openVideo);
  tries.push(openPopup);
  let err = null;
  for (const f of tries) {
    try { if (await f()) { refreshModal(); return; } } catch (e) { err = e; mode = null; win = null; }
  }
  say(err && err.message === "popup-blocked"
    ? "المتصفح منع النافذة. اسمح بالنوافذ المنبثقة للموقع وجرّب تاني."
    : "المتصفح منع فتح النافذة: " + (err?.message || err));
}

function onClosed() {
  stopTicker();
  if (mode === "video") {
    try { vid.srcObject = null; vid.remove(); } catch (e) {}
    try { navigator.mediaSession.setActionHandler("play", null); navigator.mediaSession.setActionHandler("pause", null); navigator.mediaSession.playbackState = "none"; } catch (e) {}
    vid = null; cv = null;
  }
  win = null; mode = null; ui = null;
  muted = false;
  applyMute();
  // رجوع للقواعد العادية: لو إنت برّه التبويب، مهلة الشجرة بتبدأ من دلوقتي
  if (document.hidden && typeof S !== "undefined" && S.active && !S.active.pausedAt)
    document.dispatchEvent(new Event("visibilitychange"));
  refreshModal();
}

function closeMini() {
  try {
    if (mode === "video") document.exitPictureInPicture();
    else win?.close();
  } catch (e) {}
}

// طول ما النافذة مفتوحة، خروجك من التبويب ما يموّتش الشجرة
document.addEventListener("visibilitychange", e => {
  if (isOpen() && document.hidden && typeof S !== "undefined" && S.active && !S.active.pausedAt) e.stopImmediatePropagation();
}, true);
window.addEventListener("pagehide", () => { if (mode !== "video") closeMini(); });

/* ---------------- نافذة الإعدادات داخل التطبيق ---------------- */
// الموبايل/سفاري: الوقت والصوت بيتحكم فيهم من هنا
function videoControls(mk, btn) {
  const wrap = mk("div", "display:flex;flex-direction:column;gap:8px");
  wrap.id = "miniControls";
  const line = () => mk("div", "display:flex;gap:8px;align-items:center");
  const b = (text, fn) => { const e = mk("button", btn + ";background:#2f6b4a;color:#fff;flex:1", text); e.onclick = () => { fn(); refreshModal(); }; return e; };
  const time = line();
  time.append(b("−٥ دقايق", () => changeTime(-5)), b("+٥ دقايق", () => changeTime(5)));
  const snd = mk("select", "width:100%");
  [["none", "بدون صوت"], ["quran", "سورة البقرة 📖"], ["rain", "مطر 🌧️"], ["forest", "غابة 🐦"]].forEach(([v, n]) => {
    const o = mk("option", "", n); o.value = v; snd.append(o);
  });
  snd.value = S.sound;
  snd.onchange = () => setSound(snd.value);
  const vol = mk("input", "flex:1;direction:ltr");
  vol.type = "range"; vol.min = 0; vol.max = 100; vol.step = 5; vol.value = Math.round((S.vol ?? 1) * 100);
  vol.oninput = () => setVolume(vol.value / 100);
  const mu = b(muted ? "🔇" : "🔊", toggleMute);
  mu.style.flex = "none";
  const v = line();
  v.append(mu, vol);
  wrap.append(time, snd, v);
  return wrap;
}
// ملاحظات الأوامر (زي «مينفعش تقلّل») تظهر في اللوحة
function refreshControls() {
  const wrap = document.getElementById("miniControls");
  if (!wrap) return;
  let n = wrap.querySelector("small");
  if (!n) { n = document.createElement("small"); wrap.append(n); }
  if (n.textContent !== note) n.textContent = note;
}
function refreshModal() {
  const box = document.getElementById("miniModalBox");
  if (box) fillModal(box);
}

function fillModal(box) {
  box.innerHTML = "";
  const mk = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; };
  const btn = "padding:12px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer";

  box.append(mk("h2", "margin:0", "🪟 غابتي المصغّرة"));
  box.append(mk("div", "line-height:1.7;opacity:.9",
    "نسخة صغيرة من الموقع (الشجرة والتايمر والتحكم في الوقت والصوت) فوق أي برنامج تاني، فتقدر تشغّل فيديو المذاكرة والشجرة تفضل عايشة. لو صغّرتها خالص بيفضل التايمر وزرين."));
  if (!canDoc() && canVideo()) box.append(mk("div", "color:#9be07a;line-height:1.7",
    "هتظهر نافذة عايمة (صورة داخل صورة) فيها الشجرة والتايمر، وزرار الإيقاف/التشغيل بتاعها بيتحكم في الجلسة. المتصفح ده مبيسمحش بأزرار تانية جواها، فالوقت والصوت من هنا."));
  else if (!canDoc()) box.append(mk("div", "color:#f2c94c;line-height:1.7",
    "متصفحك مش بيدعم النافذة العايمة فوق التطبيقات (جرّب Chrome أو Edge أو Safari حديث). هتفتح نافذة عادية صغيرة بدالها، ومش هتفضل فوق باقي البرامج."));

  box.append(mk("div", "", "اختار الشكل:"));
  const grid = mk("div", "display:grid;grid-template-columns:repeat(3,1fr);gap:8px");
  BGS.forEach(([name, bg, fg], i) => {
    const b = mk("button", `padding:10px 4px;border-radius:10px;cursor:pointer;font:inherit;font-weight:700;background:${bg};color:${fg};border:2px solid ${i === bgIdx ? "#9be07a" : "#3d7a56"}`);
    b.append(mk("div", "font-size:16px;direction:ltr", "25:00"), mk("div", "font-size:11px;font-weight:400;margin-top:2px", name));
    b.onclick = () => {
      bgIdx = i;
      try { localStorage.setItem(LS, JSON.stringify({ theme: i })); } catch (e) {}
      paint();
      fillModal(box);
    };
    grid.append(b);
  });
  box.append(grid);
  box.append(mk("small", "opacity:.8;line-height:1.6",
    "نافذة المتصفح نفسها مش ممكن تبقى شفافة، لكن «مخفي» بيخلّي الأرقام باهتة جدًا على خلفية سادة. اسحب النافذة لأي ركن، وتقدر تصغّرها."));

  const open = mk("button", btn + ";background:#9be07a;color:#0e2a1e", isOpen() ? "النافذة مفتوحة ✔ (اضغط لإحضارها)" : "🪟 افتح النافذة");
  open.onclick = async () => { await openMini(); fillModal(box); };
  box.append(open);
  if (isOpen() && mode === "video") box.append(videoControls(mk, btn));
  if (isOpen()) {
    const close = mk("button", btn + ";background:#2f6b4a;color:#fff", "إغلاق النافذة الصغيرة");
    close.onclick = () => { closeMini(); setTimeout(() => fillModal(box), 100); };
    box.append(close);
  }
  const x = mk("button", btn + ";background:transparent;color:#fff;border:1px solid #3d7a56", "إغلاق");
  x.onclick = () => document.getElementById("miniModal")?.remove();
  box.append(x);
}

function openModal() {
  document.getElementById("miniModal")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "miniModal";
  wrap.dir = "rtl";
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit";
  const box = document.createElement("div");
  box.id = "miniModalBox";
  box.style.cssText = "background:#143d2c;color:#fff;border:1px solid #3d7a56;border-radius:18px;padding:18px;width:100%;max-width:420px;max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:10px";
  wrap.append(box);
  wrap.addEventListener("click", e => { if (e.target === wrap) wrap.remove(); });
  document.body.append(wrap);
  fillModal(box);
}

/* ---------------- زر داخل «حسابي» ---------------- */
function addButton() {
  const accountBox = document.getElementById("acctBox");
  if (!accountBox || document.getElementById("openMiniPlayer")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.id = "openMiniPlayer";
  b.className = "big ghost";
  b.textContent = "🪟 غابتي المصغّرة";
  b.addEventListener("click", openModal);
  const closeButton = accountBox.querySelector('[data-act="close"]');
  if (closeButton) accountBox.insertBefore(b, closeButton);
  else accountBox.appendChild(b);
}
new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
addButton();
