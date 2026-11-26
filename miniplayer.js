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
let mode = null; // "doc" (نافذة PiP حقيقية) | "video" (PiP فيديو: موبايل/تابلت/سفاري) | "popup" (نافذة عادية) | "inline" (عايمة جوه الصفحة: تابلت/موبايل مش بيدعم PiP)
let panel = null;
let muted = false, lastSave = 0, bgIdx = 0;
try { bgIdx = Math.min(Math.max(+JSON.parse(localStorage.getItem(LS)).theme || 0, 0), BGS.length - 1); } catch (e) {}

const say = m => (typeof window.toast === "function" ? window.toast(m) : console.info("[Mini]", m));
const appReady = () => typeof S !== "undefined" && S && typeof fmt === "function" && typeof pauseRun === "function" && typeof resumeRun === "function";
const isOpen = () => mode !== null && (mode === "video" || !!(win && !win.closed));
// النافذة اللي جوه الصفحة مش بتحمي الشجرة (مفيش حاجة بتفضل ظاهرة لو سبت المتصفح)
const keepsAlive = () => isOpen() && mode !== "inline";
const isTouch = () => matchMedia("(pointer: coarse)").matches;
const SOUNDS = [["none", "🔕", "بدون"], ["quran", "📖", "البقرة"], ["rain", "🌧️", "مطر"], ["forest", "🐦", "غابة"]];
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
  if (!a.pausedAt && document.hidden && keepsAlive()) {
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
.stage{position:relative;width:min(56vw,calc(100vh - 310px),190px);aspect-ratio:1;flex:none}
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
.snd{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.snd button{border-radius:14px;padding:5px 0 3px;display:flex;flex-direction:column;align-items:center;font-size:11px;font-weight:700;line-height:1.5;border:2px solid transparent}
.snd button span{font-size:18px;line-height:1.3}
.snd button.on{border-color:#9be07a;background:rgba(155,224,122,.22)}
.vol{background:rgba(128,128,128,.18);border-radius:999px;padding:3px 5px 3px 12px}
button:active{transform:scale(.95)}
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
  <div class="row extra snd" id="snd" dir="rtl"></div>
  <div class="row extra vol" dir="rtl"><button class="icon" id="mute" title="كتم / تشغيل الصوت"></button><input type="range" id="vol" min="0" max="100" step="5" title="مستوى الصوت"></div>
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
  for (const b of ui.snd.children) b.classList.toggle("on", b.dataset.s === S.sound);
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
  SOUNDS.forEach(([v, icon, name]) => {
    const b = d.createElement("button");
    b.dataset.s = v;
    b.innerHTML = "<span>" + icon + "</span>" + name;
    b.onclick = () => setSound(v);
    ui.snd.append(b);
  });
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

const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
async function openVideo() {
  cv = document.createElement("canvas");
  cv.width = 480; cv.height = 270;
  vid = document.createElement("video");
  vid.muted = true; vid.playsInline = true; vid.setAttribute("playsinline", "");
  // لازم يفضل جوه الشاشة (شبه مخفي) عشان بعض متصفحات التابلت تحمّله
  vid.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none";
  document.body.append(vid);
  imgKey = ""; treeImg = null;
  core(); drawCanvas();
  vid.srcObject = cv.captureStream(5);
  // من غير رسم مستمر الفيديو ممكن يفضل «بيحمّل» ومايبدأش
  const feed = setInterval(drawCanvas, 100);
  try {
    await within(vid.play(), 2500);
    if (!vid.readyState) await within(new Promise(ok => vid.addEventListener("loadedmetadata", ok, { once: true })), 1500);
    await within(vid.requestPictureInPicture(), 2500);
  } catch (e) {
    vid.srcObject = null; vid.remove(); vid = null; cv = null;
    throw e;
  } finally { clearInterval(feed); }
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

// نافذة عايمة جوه الصفحة نفسها: بتشتغل على أي جهاز
async function openInline() {
  panel = document.createElement("div");
  panel.id = "miniPanel";
  panel.style.cssText = "position:fixed;left:12px;bottom:84px;z-index:50;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;background:#143d2c;border:1px solid #3d7a56;box-shadow:0 12px 34px rgba(0,0,0,.5)";
  const bar = document.createElement("div");
  bar.dir = "rtl";
  bar.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:move;touch-action:none;user-select:none;color:#fff;font-size:13px";
  const title = document.createElement("span");
  title.textContent = "⠿ غابتي";
  title.style.flex = "1";
  const hb = (text, label) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.setAttribute("aria-label", label); b.style.cssText = "width:34px;height:34px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:15px;cursor:pointer"; return b; };
  const size = hb("▁", "تصغير / تكبير"), x = hb("✕", "إغلاق النافذة");
  bar.append(title, size, x);
  const frame = document.createElement("iframe");
  frame.title = "غابتي المصغّرة";
  frame.style.cssText = "border:0;display:block";
  let small = false;
  const clamp = () => {
    const r = panel.getBoundingClientRect();
    panel.style.left = Math.max(0, Math.min(r.left, innerWidth - r.width)) + "px";
    panel.style.top = Math.max(0, Math.min(r.top, innerHeight - r.height)) + "px";
    panel.style.bottom = "auto";
  };
  const fit = () => {
    frame.style.width = small ? "260px" : "min(300px, 92vw)";
    frame.style.height = small ? "84px" : "min(500px, calc(100vh - 150px))";
  };
  size.onclick = () => { small = !small; size.textContent = small ? "▢" : "▁"; fit(); clamp(); };
  x.onclick = closeMini;
  bar.onpointerdown = e => {
    if (e.target.closest("button")) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    bar.setPointerCapture(e.pointerId);
    bar.onpointermove = m => { panel.style.left = m.clientX - dx + "px"; panel.style.top = m.clientY - dy + "px"; panel.style.bottom = "auto"; clamp(); };
    bar.onpointerup = bar.onpointercancel = () => { bar.onpointermove = null; };
  };
  fit();
  const loaded = new Promise(ok => frame.addEventListener("load", ok, { once: true }));
  frame.srcdoc = '<!doctype html><html lang="ar"><head></head><body></body></html>';
  panel.append(bar, frame);
  document.body.append(panel);
  await within(loaded, 3000);
  mode = "inline";
  buildDomWindow(frame.contentWindow);
  document.getElementById("miniModal")?.remove();
  try { closeSheet(); } catch (e) {}
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
  // على التابلت/الموبايل «النافذة المنبثقة» بتفتح تاب فاضي، فبنعرضها جوه الصفحة بدالها
  if (!isTouch()) tries.push(openPopup);
  tries.push(openInline);
  let err = null;
  for (const f of tries) {
    try { if (await f()) { refreshModal(); return; } } catch (e) { err = e; mode = null; win = null; panel?.remove(); panel = null; }
  }
  say("مقدرناش نفتح النافذة: " + (err?.message || err));
}

function onClosed() {
  if (!mode) return;
  stopTicker();
  panel?.remove(); panel = null;
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
    if (mode === "inline") onClosed();
    else if (mode === "video") document.exitPictureInPicture();
    else win?.close();
  } catch (e) {}
}

// طول ما النافذة مفتوحة، خروجك من التبويب ما يموّتش الشجرة
document.addEventListener("visibilitychange", e => {
  if (keepsAlive() && document.hidden && typeof S !== "undefined" && S.active && !S.active.pausedAt) e.stopImmediatePropagation();
}, true);
window.addEventListener("pagehide", () => { if (mode !== "video") closeMini(); });

/* ---------------- نافذة الإعدادات داخل التطبيق ---------------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const mbtn = (cls, text, fn) => { const b = el("button", cls, text); b.type = "button"; b.onclick = fn; return b; };
const card = title => { const c = el("section", "mm-card"); c.append(el("h3", "", title)); return c; };
const MODAL_CSS = `
#miniModal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;font-family:Cairo,system-ui,sans-serif}
#miniModalBox{background:#143f31;color:#f4f1e4;width:100%;max-width:460px;max-height:90vh;max-height:90dvh;overflow:auto;border-radius:26px 26px 0 0;padding:16px 16px calc(20px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;border:1px solid rgba(255,255,255,.1)}
@media (min-width:700px){#miniModal{align-items:center}#miniModalBox{border-radius:26px}}
#miniModal button{font:inherit;color:inherit;border:0;cursor:pointer}
#miniModal h2,#miniModal h3,#miniModal p{margin:0}
.mm-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mm-head h2{font-size:18px}
.mm-x{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1)}
.mm-note{font-size:13px;line-height:1.8;color:#a9cdbb}
.mm-main{padding:14px;border-radius:999px;font-weight:800;font-size:17px;background:#9be07a;color:#12351f!important;box-shadow:0 5px 0 #5da545}
.mm-soft{padding:11px;border-radius:999px;font-weight:700;background:rgba(255,255,255,.1)}
.mm-card{background:#1b5a45;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:12px;display:flex;flex-direction:column;gap:10px}
.mm-card h3{font-size:14px}
.mm-themes{display:grid;grid-template-columns:repeat(5,1fr);gap:10px 4px}
.mm-theme{background:none;padding:0;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10.5px!important;line-height:1.4}
.mm-theme i{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:13px;font-weight:800;border:2px solid rgba(255,255,255,.2)}
.mm-theme.on i{border-color:#9be07a;box-shadow:0 0 0 3px rgba(155,224,122,.4)}
.mm-line{display:flex;gap:8px;align-items:center}
.mm-line>*{flex:1}
.mm-snd{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.mm-snd button{padding:8px 0;border-radius:14px;background:rgba(0,0,0,.22);font-size:12px;border:2px solid transparent}
.mm-snd button.on{border-color:#9be07a;background:rgba(155,224,122,.18)}
.mm-snd span{display:block;font-size:20px}
#miniModal input[type=range]{accent-color:#9be07a;direction:ltr;min-width:0}
`;

// فيديو PiP (آيباد/سفاري): مفيش أزرار جوه النافذة، فالوقت والصوت من هنا
function videoControls() {
  const c = card("الوقت والصوت");
  c.id = "miniControls";
  const again = fn => () => { fn(); refreshModal(); };
  const time = el("div", "mm-line");
  time.append(mbtn("mm-soft", "−٥ دقايق", again(() => changeTime(-5))), mbtn("mm-soft", "+٥ دقايق", again(() => changeTime(5))));
  const snd = el("div", "mm-snd");
  SOUNDS.forEach(([v, icon, name]) => {
    const b = mbtn(S.sound === v ? "on" : "", "", again(() => setSound(v)));
    b.append(el("span", "", icon), name);
    snd.append(b);
  });
  const vl = el("div", "mm-line");
  const mu = mbtn("mm-x", muted ? "🔇" : "🔊", again(toggleMute));
  mu.style.flex = "none";
  const vol = el("input");
  vol.type = "range"; vol.min = 0; vol.max = 100; vol.step = 5; vol.value = Math.round((S.vol ?? 1) * 100);
  vol.oninput = () => setVolume(vol.value / 100);
  vl.append(mu, vol);
  c.append(time, snd, vl, el("small", "mm-note"));
  return c;
}
// ملاحظات الأوامر (زي «مينفعش تقلّل») تظهر في اللوحة
function refreshControls() {
  const n = document.querySelector("#miniControls small");
  if (n && n.textContent !== note) n.textContent = note;
}
function refreshModal() {
  const box = document.getElementById("miniModalBox");
  if (box) fillModal(box);
}

function fillModal(box) {
  const top = box.scrollTop;
  box.innerHTML = "";
  const head = el("div", "mm-head");
  head.append(el("h2", "", "🪟 غابتي المصغّرة"), mbtn("mm-x", "✕", () => document.getElementById("miniModal")?.remove()));
  box.append(head, el("p", "mm-note", "الشجرة والتايمر والتحكم في الوقت والصوت في نافذة صغيرة."));

  box.append(mbtn("mm-main", isOpen() ? "النافذة مفتوحة ✔" : "افتح النافذة", async () => { await openMini(); refreshModal(); }));
  if (!canDoc()) box.append(el("p", "mm-note", canVideo()
    ? "على الجهاز ده النافذة العايمة بتعرض الشجرة والتايمر وزرار إيقاف/تشغيل بس. باقي التحكم من هنا."
    : isTouch()
      ? "المتصفح ده مش بيسمح بنافذة فوق التطبيقات، فهتظهر جوه الصفحة. عشان تذاكر من فيديو استخدم تقسيم الشاشة، لأن الخروج من المتصفح بيموّت الشجرة."
      : "المتصفح ده مش بيدعم النافذة اللي فوق البرامج، فهتفتح نافذة عادية."));
  if (isOpen() && mode === "video") box.append(videoControls());
  if (isOpen()) box.append(mbtn("mm-soft", "إغلاق النافذة", () => { closeMini(); setTimeout(refreshModal, 100); }));

  const looks = card("شكل النافذة"), grid = el("div", "mm-themes");
  BGS.forEach(([name, bg, fg], i) => {
    const b = mbtn("mm-theme" + (i === bgIdx ? " on" : ""), "", () => {
      bgIdx = i;
      try { localStorage.setItem(LS, JSON.stringify({ theme: i })); } catch (e) {}
      paint();
      refreshModal();
    });
    const dot = el("i", "", i === 0 ? "🌳" : "25");
    dot.style.background = bg; dot.style.color = fg;
    b.append(dot, name);
    grid.append(b);
  });
  looks.append(grid);
  box.append(looks);
  box.scrollTop = top;
}

function openModal() {
  document.getElementById("miniModal")?.remove();
  if (!document.getElementById("miniModalCss")) {
    const st = el("style", "", MODAL_CSS);
    st.id = "miniModalCss";
    document.head.append(st);
  }
  const wrap = el("div"), box = el("div");
  wrap.id = "miniModal"; wrap.dir = "rtl"; box.id = "miniModalBox";
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
