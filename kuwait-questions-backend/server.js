// server.js
require('dotenv').config(); // تحميل متغيرات البيئة من ملف .env في بداية التطبيق

const express = require('express');
const cors = require('cors'); // لتمكين طلبات Cross-Origin Resource Sharing
const path = require('path'); // للتعامل مع مسارات الملفات
const fs = require('fs'); // للتعامل مع نظام الملفات (لقراءة ملف مفتاح خدمة Firebase)
const pool = require('./database/database'); // اتصال قاعدة البيانات PostgreSQL
const questionRoutes = require('./routes/questionRoutes'); // مسارات إدارة الأسئلة
const promoRoutes = require('./routes/promoRoutes'); // مسارات إدارة أكواد الخصم
const userRoutes = require('./routes/userRoutes'); // مسارات إدارة المستخدمين
const gameDataRoutes = require('./routes/gameDataRoutes'); // مسارات جلب بيانات اللعبة
const paymentRoutes = require('./routes/paymentRoutes'); // مسارات معالجة الدفع
const multer = require('multer'); // لمعالجة رفع الملفات (يُستخدم في questionRoutes)

// ================== تهيئة Firebase Admin SDK ==================
const admin = require('firebase-admin');
let serviceAccount;

// التحقق إذا كنا في بيئة الإنتاج وهناك متغير بيئة يحتوي على إعدادات Firebase
if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_CONFIG_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
        console.log("Firebase Admin SDK: جاري التهيئة باستخدام FIREBASE_CONFIG_JSON من متغيرات البيئة.");
    } catch (e) {
        console.error("خطأ فادح: تعذر تحليل FIREBASE_CONFIG_JSON.", e);
        process.exit(1); // إنهاء العملية إذا فشل التحليل
    }
} else {
    // إذا كنا في بيئة تطوير أو لم يتم توفير متغير البيئة، نحاول قراءة الملف المحلي
    try {
        const serviceAccountPath = path.join(__dirname, 'rehlaapp-9a985-firebase-adminsdk-fbsvc-01e9f23075.json');
        if (fs.existsSync(serviceAccountPath)) {
            serviceAccount = require(serviceAccountPath);
            console.log("Firebase Admin SDK: جاري التهيئة باستخدام ملف مفتاح الخدمة المحلي.");
        } else {
            throw new Error(`ملف مفتاح الخدمة المحلي غير موجود في المسار: ${serviceAccountPath}. \nتأكد من وجود الملف أو قم بتعيين FIREBASE_CONFIG_JSON لبيئة الإنتاج.`);
        }
    } catch (e) {
        console.error("خطأ فادح: تعذر تحميل ملف مفتاح خدمة Firebase.", e.message);
        process.exit(1);
    }
}

// تهيئة تطبيق Firebase Admin إذا تم تحميل بيانات حساب الخدمة بنجاح
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "rehlaapp-9a985.firebasestorage.app" // اسم Firebase Storage Bucket
        });
        console.log("تم تهيئة Firebase Admin SDK بنجاح.");
    } catch (initError) {
        console.error("خطأ فادح: فشلت تهيئة Firebase Admin SDK:", initError);
        process.exit(1);
    }
} else {
    console.error("خطأ فادح: كائن serviceAccount غير معرّف. لا يمكن تهيئة Firebase Admin SDK.");
    process.exit(1);
}
// =======================================================================

const app = express(); // إنشاء تطبيق Express
const PORT = parseInt(process.env.PORT, 10) || 3001; // المنفذ الذي سيعمل عليه الخادم

// --- Middleware (البرامج الوسيطة) ---
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'https://rehla-game1.vercel.app', // نطاق الواجهة الأمامية على Vercel
            'https://rehlagame.com',          // النطاق الرئيسي
            'https://www.rehlagame.com',      // النطاق الرئيسي مع www
            'http://localhost:63342',       // لـ WebStorm أو IDEs أخرى عند التطوير المحلي
            // يمكنك إضافة أي نطاقات localhost أخرى تستخدمها للتطوير
        ];
        if (!origin || origin === 'null' || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && origin && origin.startsWith('http://localhost:'))) {
            callback(null, true);
        } else {
            console.warn(`CORS: المصدر ${origin} غير مسموح به بواسطة سياسة CORS.`);
            callback(new Error('غير مسموح به بواسطة CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Tap-Signature'], // إضافة X-Tap-Signature
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// !!! --- تعديل مهم هنا --- !!!
// تهيئة express.json مع خيار verify للحصول على الجسم الخام لطلبات الـ webhook
// يجب وضع هذا قبل أي مسارات قد تحتاج للجسم الخام، وخاصة مسار الـ webhook
app.use(express.json({
    verify: (req, res, buf, encoding) => {
        // نجعل الجسم الخام متاحًا في req.rawBody فقط لمسار الـ webhook الخاص بـ Tap
        if (req.originalUrl && req.originalUrl.startsWith('/api/payment/webhook/tap')) {
            try {
                req.rawBody = buf; // buf is a Buffer
                // لا داعي لـ console.log هنا في كل مرة، يمكن إزالته أو وضعه ضمن شرط DEBUG
                // console.log('[Express JSON Verify] Raw body captured for Tap webhook path.');
            } catch (e) {
                console.error('[Express JSON Verify] Error capturing raw body for Tap webhook:', e);
            }
        }
    }
}));
// Middleware لتحليل أجسام الطلبات بصيغة URL-encoded
app.use(express.urlencoded({ extended: true }));


// --- Routes (المسارات) ---
app.use('/api/questions', questionRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/game', gameDataRoutes);
app.use('/api/user', userRoutes);
app.use('/api/payment', paymentRoutes); // مسار الدفع الآن سيستفيد من express.json المعدل

// مسار افتراضي للتحقق من أن الخادم يعمل
app.get('/', (req, res) => {
    res.send('واجهة برمجة تطبيقات لعبة رحلة تعمل بسلاسة مع دمج Firebase Admin SDK!');
});

// --- Global Error Handler (معالج الأخطاء العام) ---
app.use((err, req, res, next) => {
    console.error('تم تشغيل معالج الأخطاء العام:');
    console.error('رسالة الخطأ:', err.message);
    console.error('مسار الخطأ (Stack Trace):', err.stack || 'لا يوجد مسار خطأ متاح');

    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `خطأ Multer: ${err.message}` });
    }
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
        return res.status(err.statusCode).json({ message: err.message || 'حدث خطأ.' });
    }
    if (err.code === '23505' || (err.message && err.message.toLowerCase().includes('unique constraint'))) {
        return res.status(409).json({
            message: 'تعارض: مورد بهذا المعرف موجود بالفعل أو تم انتهاك قيد فريد.',
        });
    }
    if (err.code && err.code.startsWith('auth/')) {
        return res.status(401).json({ message: `خطأ في المصادقة: ${err.message}` });
    }
    res.status(500).json({ message: 'حدث خطأ غير متوقع في الخادم. يرجى المحاولة مرة أخرى لاحقًا.' });
});

// --- Start Server (بدء تشغيل الخادم) ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`خادم لعبة رحلة يعمل على http://0.0.0.0:${PORT}`);
    console.log(`NODE_ENV معين إلى: ${process.env.NODE_ENV}`);
    console.log(`DATABASE_URL (أول 20 حرفًا): ${process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'غير معين'}`);
    console.log(`TAP_SECRET_KEY ${process.env.TAP_SECRET_KEY && !process.env.TAP_SECRET_KEY.includes('DUMMY') ? 'معين (حقيقي)' : 'غير معين أو وهمي'}`);
    console.log(`TAP_API_BASE_URL: ${process.env.TAP_API_BASE_URL || 'يستخدم الرابط الافتراضي'}`);
    console.log(`TAP_WEBHOOK_SIGNATURE_KEY ${process.env.TAP_WEBHOOK_SIGNATURE_KEY && !process.env.TAP_WEBHOOK_SIGNATURE_KEY.includes('DUMMY') ? 'معين (حقيقي)' : 'غير معين أو وهمي!'}`);
    console.log(`APP_FRONTEND_URL: ${process.env.APP_FRONTEND_URL || 'غير معين'}`);
    console.log(`BACKEND_URL للـ webhooks: ${process.env.BACKEND_URL || 'غير معين (حاسم للـ webhooks!)'}`);

    if (admin.apps.length) {
        console.log('اسم تطبيق Firebase Admin:', admin.app().name);
    } else {
        console.error("تطبيق Firebase Admin لم يتم تهيئته قبل بدء الخادم!");
    }
});
