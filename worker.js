// Worker غابتي: ربط تيليجرام تلقائي فقط.
// إرسال التذكيرات بيتم من GitHub Actions (send-reminders.mjs)، فمفيش Cron هنا.
// اختياري: لو ضفت Secret اسمه WEBHOOK_SECRET في Cloudflare، الـ Worker بيرفض أي طلب مش جاي من تيليجرام.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "content-type": "application/json" } });
const tg = (env, m, b) =>
  fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${m}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b || {})
  });
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const u = new URL(req.url);

    // تيليجرام بيبعت هنا لما حد يكلّم البوت أو يضغط Start
    if (u.pathname === "/webhook") {
      if (env.WEBHOOK_SECRET && req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET)
        return json({ ok: false }, 401);
      let upd;
      try { upd = await req.json(); } catch (e) { return json({ ok: true }); }
      const m = upd && upd.message;
      if (m && m.chat && m.chat.type === "private" && typeof m.text === "string") {
        const id = String(m.chat.id);
        const [cmdRaw, argRaw] = m.text.trim().split(/\s+/, 2);
        const cmd = (cmdRaw || "").toLowerCase().replace(/@\w+$/, "");
        const token = argRaw || "";
        let text;
        if (cmd === "/stop") {
          text = "لإيقاف التذكيرات: افتح غابتي ← حسابي ← إعدادات الإشعارات وامسح رقم تيليجرام، واضغط حفظ.";
        } else if (cmd === "/start" && TOKEN_RE.test(token)) {
          await env.KV.put("link:" + token, id, { expirationTtl: 3600 });
          text = `تم ربط حسابك في غابتي ✅\nارجع للتطبيق، هيتربط لوحده.\n\nرقمك (Chat ID): <code>${id}</code>`;
        } else {
          text = `أهلاً بيك في غابتي 🌳\nرقمك (Chat ID): <code>${id}</code>\n\nدوس على الرقم أو على زرار النسخ تحت، والصقه في غابتي ← حسابي ← إعدادات الإشعارات ← رقم تيليجرام، وبعدين احفظ.`;
        }
        await tg(env, "sendMessage", {
          chat_id: id,
          text,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "📋 انسخ الرقم", copy_text: { text: id } }]] }
        });
      }
      return json({ ok: true });
    }

    // التطبيق بيسأل: الكود ده اتربط ولا لأ؟
    if (u.pathname === "/check") {
      const t = u.searchParams.get("token");
      const id = t && TOKEN_RE.test(t) ? await env.KV.get("link:" + t) : null;
      return json({ chat_id: id });
    }

    // يوزر البوت (عشان زرار "افتح البوت")
    if (u.pathname === "/info") {
      let name = await env.KV.get("bot-username");
      if (!name) {
        const r = await (await tg(env, "getMe")).json();
        if (r.ok) { name = r.result.username; await env.KV.put("bot-username", name, { expirationTtl: 86400 }); }
      }
      return json({ username: name || null });
    }

    // حالة الويب هوك (للفحص) — لو ضفت WEBHOOK_SECRET لازم تفتحها بـ ?key=السر
    if (u.pathname === "/status" || u.pathname === "/setup") {
      if (!env.BOT_TOKEN) return json({ ok: false, error: "BOT_TOKEN secret is missing in Cloudflare" }, 500);
      if (!env.KV) return json({ ok: false, error: "KV binding named KV is missing in Cloudflare" }, 500);
      if (env.WEBHOOK_SECRET && u.searchParams.get("key") !== env.WEBHOOK_SECRET) return json({ ok: false, error: "add ?key=WEBHOOK_SECRET" }, 401);
    }
    if (u.pathname === "/status") {
      const r = await (await tg(env, "getWebhookInfo")).json();
      const i = r.result || r;
      return json({ url: i.url, pending: i.pending_update_count, last_error: i.last_error_message, error_code: r.error_code, retry_after: r.parameters?.retry_after });
    }

    // ربط الويب هوك من جديد (افتحه مرة واحدة بس)
    if (u.pathname === "/setup") {
      const body = { url: u.origin + "/webhook", drop_pending_updates: true, allowed_updates: ["message"] };
      if (env.WEBHOOK_SECRET) body.secret_token = env.WEBHOOK_SECRET;
      const r = await (await tg(env, "setWebhook", body)).json();
      return json(r);
    }

    return json({ ok: true });
  }
};
