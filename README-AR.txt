تذكيرات غابتي عبر بوت تيليجرام

الملفات:
1) notifications.js  (جنب index.html)
2) send-reminders.mjs (مكان القديم في المستودع، نفس المسار)
3) firestore-rules.txt (انشرها في Firebase)

الخطوات:
1. اسم البوت (FORESTsolybot) متظبط جوه notifications.js في سطر BOT_USERNAME_RAW.
2. افتح Firebase Console > Firestore Database > Rules والصق محتوى firestore-rules.txt واضغط Publish.
   مهم: القواعد القديمة ماكانتش بتسمح بمسار users/{uid}/settings، فالحفظ كان بيفشل بـ permission-denied.
3. ارفع الملفين (notifications.js و send-reminders.mjs) على GitHub، وحدّث الموقع تحديث كامل.
4. اتأكد إن في GitHub Secrets: FIREBASE_SERVICE_ACCOUNT و TELEGRAM_BOT_TOKEN.

إزاي بيشتغل:
- المستخدم يفتح غابتي > حسابي > إعدادات الإشعارات > "افتح البوت واضغط Start".
  البوت بيربط حسابه تلقائي ويرد عليه برقمه، وبعدها بيبعتله التذكيرات في المواعيد اللي اختارها.
- أي حد يبعت رسالة للبوت من غير ربط، البوت يرد عليه برقمه (Chat ID) يلصقه في الإعدادات بنفسه.
- /stop في البوت بيوقف التذكيرات.
- البوت بيرد وبيبعت لما GitHub Actions يشتغل (كل 5 دقايق تقريبًا، وممكن يتأخر أكتر). عشان كده الرد مش فوري.
- لو البوت عليه webhook، امسحه (deleteWebhook) وإلا مش هيعرف يقرأ الرسائل.
- لا تبعت توكن البوت ولا مفتاح الخدمة لأي حد.

مفتاح VAPID في notifications.js سليم من ناحية الشكل (٦٥ بايت على منحنى P-256)، لكن مفيش طريقة أتأكد من الملفات إنه بتاع مشروعك.
لو فشل Push، قارنه بـ Firebase Console > Project settings > Cloud Messaging > Web Push certificates.
