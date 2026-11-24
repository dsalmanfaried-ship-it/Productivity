تحديث ربط تيليجرام (فوري) + زرار نسخ الرقم

الملفات:
1) worker.js          -> يتلصق في Cloudflare (مكان الكود القديم)
2) notifications.js   -> يترفع على GitHub جنب index.html
3) firestore-rules.txt -> يتنشر في Firebase Rules (لو لسه ما نشرتهوش)
4) send-reminders.mjs  -> كما هو (مفيش فيه تغيير مطلوب لو رفعته قبل كده)

الخطوة 1: Cloudflare
- https://dash.cloudflare.com > Workers & Pages > ghabaty-bot > Edit code
- امسح كل الكود والصق worker.js > Deploy
- افتح https://ghabaty-bot.dsalmanfaried.workers.dev/setup مرة واحدة

الخطوة 2: GitHub
- ارفع notifications.js مكان القديم > استنى النشر > حدّث الموقع تحديث كامل

الخطوة 3: Firebase (مرة واحدة)
- https://console.firebase.google.com/project/ghabaty-84b32/overview
- Firestore Database > Rules > الصق firestore-rules.txt > Publish

إزاي بيشتغل دلوقتي:
- حسابي > إعدادات الإشعارات > "افتح البوت واضغط Start"
- ارجع للموقع: بيتربط لوحده ويحفظ الإعدادات، من غير نسخ ولا لصق.
- لو حد كلّم البوت من برّه الموقع، البوت يرد برقمه، وفيه زرار "انسخ الرقم" بينسخ الرقم بس، والرقم نفسه لو دوست عليه بيتنسخ.

اختياري (أمان أكتر): في Cloudflare > ghabaty-bot > Settings > Variables and Secrets ضيف Secret اسمه WEBHOOK_SECRET
بأي كلمة طويلة عشوائية، وبعدها افتح /setup تاني. كده الـ Worker يرفض أي طلب مش جاي من تيليجرام.
لا تبعت توكن البوت ولا أي Secret لأي حد.

ملاحظة: send-reminders.mjs بيحاول يقرأ رسايل البوت، لكن لما الـ webhook شغال تيليجرام بيرد بخطأ 409،
والسكربت بيكتب تحذير وبيكمّل إرسال التذكيرات عادي. ده طبيعي ومش مشكلة.
