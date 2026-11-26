/* غابتي — نافذة التايمر الصغيرة (Picture-in-Picture).
   تايمر + زرين بس: (كتم/تشغيل الصوت) و (إيقاف/تشغيل). بتفضل فوق أي نافذة تانية،
   وطول ما هي مفتوحة الشجرة مش بتموت لو خرجت من التبويب (مثلًا عشان تشغّل فيديو المذاكرة).
   بتستخدم دوال التطبيق نفسها (pauseRun / resumeRun / startRun) من غير ما تغيّر index.html. */

const LS = "ghabaty-mini";
// [الاسم، لون الخلفية، لون الأرقام]
const BGS = [
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

let win = null, muted = false, lastSave = 0, bgIdx = 0;
try { bgIdx = Math.min(Math.max(+JSON.parse(localStorage.getItem(LS)).bg || 0, 0), BGS.length - 1); } catch (e) {}

const say = m => (typeof window.toast === "function" ? window.toast(m) : console.info("[Mini]", m));
const appReady = () => typeof S !== "undefined" && S && typeof fmt === "function" && typeof pauseRun === "function" && typeof resumeRun === "function";
const isOpen = () => !!(win && !win.closed);

const ICON = {
  on: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  off: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
};

// كتم الصوت: الأصوات المولّدة (مطر/غابة) عن طريق AudioContext، والقرآن عن طريق عنصر الصوت au.
function applyMute() {
  try { if (typeof au !== "undefined") au.muted = muted; } catch (e) {}
  try {
    if (typeof AC !== "undefined" && AC) {
      if (muted && AC.state === "running") AC.suspend();
      else if (!muted && AC.state === "suspended") AC.resume();
    }
  } catch (e) {}
}

function paint() {
  if (!isOpen()) return;
  const [, bg, fg] = BGS[bgIdx];
  const d = win.document;
  d.documentElement.style.background = bg;
  d.body.style.background = bg;
  d.body.style.color = fg;
}

async function openMini() {
  if (isOpen()) { try { win.focus(); } catch (e) {} return; }
  if (!appReady()) { say("التطبيق لسه بيحمّل، جرّب تاني بعد ثانية."); return; }
  const W = 190, H = 60;
  let w = null;
  try {
    if (window.documentPictureInPicture) w = await window.documentPictureInPicture.requestWindow({ width: W, height: H });
    else w = window.open("", "ghabatyMini", `popup=yes,width=${W},height=${H},left=40,top=40`);
  } catch (e) { say("المتصفح منع فتح النافذة: " + (e?.message || e)); return; }
  if (!w) { say("المتصفح منع النافذة. اسمح بالنوافذ المنبثقة للموقع وجرّب تاني."); return; }
  win = w;

  const d = w.document;
  d.title = "غابتي";
  d.documentElement.style.height = "100%";
  Object.assign(d.body.style, {
    margin: "0", height: "100%", overflow: "hidden", boxSizing: "border-box", padding: "0 8px",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", userSelect: "none"
  });
  const mk = (tag, css) => { const e = d.createElement(tag); e.style.cssText = css; return e; };
  const btnCss = "width:34px;height:34px;border-radius:50%;border:0;background:rgba(128,128,128,.28);color:inherit;line-height:0;cursor:pointer;padding:0;flex:none;display:flex;align-items:center;justify-content:center";
  const t = mk("div", "font:700 26px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;direction:ltr;flex:1;text-align:center;white-space:nowrap");
  const mBtn = mk("button", btnCss);
  const pBtn = mk("button", btnCss);
  mBtn.title = "كتم / تشغيل الصوت";
  pBtn.title = "إيقاف / تشغيل";
  d.body.append(t, mBtn, pBtn);
  paint();

  const update = () => {
    if (!appReady()) return;
    const a = S.active;
    mBtn.innerHTML = muted ? ICON.off : ICON.on;
    if (!a) { t.textContent = "--:--"; pBtn.innerHTML = ICON.play; return; }
    const now = Date.now();
    const el = (a.pausedAt || now) - a.start;
    const remain = a.mode === "down" ? a.dur - el : el;
    t.textContent = fmt(remain);
    pBtn.innerHTML = a.pausedAt ? ICON.play : ICON.pause;
    if (!a.pausedAt && document.hidden) {
      // التبويب مخفي: تيك التطبيق واقف، فإحنا اللي بنكمّل الحساب ونمنع موت الشجرة
      try { clearTimeout(killT); } catch (e) {}
      delete a.leftAt;
      a.lastSeen = now;
      if (a.mode === "down" && el >= a.dur) { finish(true); return; }
      document.title = "🌱 " + fmt(remain);
      if (now - lastSave > 5000) { lastSave = now; try { save(); } catch (e) {} }
    }
    if (muted) applyMute();
  };

  mBtn.onclick = () => { muted = !muted; applyMute(); update(); };
  pBtn.onclick = () => {
    if (!appReady()) return;
    const a = S.active;
    if (!a) { if (!S.rest && typeof startRun === "function") startRun(); }
    else if (a.pausedAt) resumeRun();
    else pauseRun();
    setTimeout(() => { if (muted) applyMute(); update(); }, 80);
  };

  w.setInterval(update, 500); // مؤقت النافذة نفسها مش بيتبطّأ زي مؤقت التبويب المخفي
  update();

  w.addEventListener("pagehide", () => {
    win = null;
    muted = false;
    applyMute();
    // رجوع للقواعد العادية: لو إنت برّه التبويب، مهلة الشجرة بتبدأ من دلوقتي
    if (document.hidden && typeof S !== "undefined" && S.active && !S.active.pausedAt)
      document.dispatchEvent(new Event("visibilitychange"));
    refreshModal();
  });
  refreshModal();
}

function closeMini() { try { win?.close(); } catch (e) {} }

// طول ما النافذة مفتوحة، خروجك من التبويب ما يموّتش الشجرة
document.addEventListener("visibilitychange", e => {
  if (isOpen() && document.hidden && typeof S !== "undefined" && S.active && !S.active.pausedAt) e.stopImmediatePropagation();
}, true);
window.addEventListener("pagehide", closeMini);

/* ---------------- نافذة الإعدادات داخل التطبيق ---------------- */
function refreshModal() {
  const box = document.getElementById("miniModalBox");
  if (box) fillModal(box);
}

function fillModal(box) {
  const supported = !!window.documentPictureInPicture;
  box.innerHTML = "";
  const mk = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; };
  const btn = "padding:12px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer";

  box.append(mk("h2", "margin:0", "🪟 نافذة التايمر الصغيرة"));
  box.append(mk("div", "line-height:1.7;opacity:.9",
    "تايمر + زرين بس (صوت / إيقاف) في نافذة صغيرة فوق أي برنامج تاني، فتقدر تشغّل فيديو المذاكرة والشجرة تفضل عايشة."));
  if (!supported) box.append(mk("div", "color:#f2c94c;line-height:1.7",
    "متصفحك مالوش نافذة عايمة دايمًا فوق (محتاج Chrome أو Edge أو Brave حديث على الكمبيوتر). هتفتح نافذة عادية صغيرة بدالها، وتقدر تسيبها جنب الفيديو."));

  box.append(mk("div", "", "اختار الخلفية:"));
  const grid = mk("div", "display:grid;grid-template-columns:repeat(3,1fr);gap:8px");
  BGS.forEach(([name, bg, fg], i) => {
    const b = mk("button", `padding:10px 4px;border-radius:10px;cursor:pointer;font:inherit;font-weight:700;background:${bg};color:${fg};border:2px solid ${i === bgIdx ? "#9be07a" : "#3d7a56"}`);
    b.append(mk("div", "font-size:16px;direction:ltr", "25:00"), mk("div", "font-size:11px;font-weight:400;margin-top:2px", name));
    b.onclick = () => {
      bgIdx = i;
      try { localStorage.setItem(LS, JSON.stringify({ bg: i })); } catch (e) {}
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
  b.textContent = "🪟 نافذة التايمر الصغيرة";
  b.addEventListener("click", openModal);
  const closeButton = accountBox.querySelector('[data-act="close"]');
  if (closeButton) accountBox.insertBefore(b, closeButton);
  else accountBox.appendChild(b);
}
new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
addButton();
