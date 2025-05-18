// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path'); // لا يزال مطلوبًا لـ path.join لملف المفتاح المحلي
const fs = require('fs'); // لا يزال مطلوبًا لـ fs.existsSync لملف المفتاح المحلي
const pool = require('./database/database'); // تم تغيير اسم الملف ليتوافق مع ما لديك
const questionRoutes = require('./routes/questionRoutes');
const promoRoutes = require('./routes/promoRoutes');
const userRoutes = require('./routes/userRoutes');
const gameDataRoutes = require('./routes/gameDataRoutes');
const multer = require('multer'); // multer يُستخدم في questionRoutes

// ================== Firebase Admin SDK Initialization ==================
const admin = require('firebase-admin');
let serviceAccount;

// تحميل المفتاح من ملف محلي (للتطوير) أو من متغير بيئة (لـ Render/الإنتاج)
if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_CONFIG_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
        console.log("Firebase Admin SDK: Initializing with FIREBASE_CONFIG_JSON from environment variables.");
    } catch (e) {
        console.error("FATAL ERROR: Could not parse FIREBASE_CONFIG_JSON.", e);
        process.exit(1);
    }
} else { // بيئة التطوير أو لم يتم توفير متغير البيئة
    try {
        // اسم ملف المفتاح الذي أرفقته. تأكد من أنه في جذر مجلد kuwait-questions-backend
        const serviceAccountPath = path.join(__dirname, 'rehlaapp-9a985-firebase-adminsdk-fbsvc-01e9f23075.json');
        if (fs.existsSync(serviceAccountPath)) {
            serviceAccount = require(serviceAccountPath);
            console.log("Firebase Admin SDK: Initializing with local service account key file.");
        } else {
            // هذا الخطأ سيظهر إذا كان الملف غير موجود محليًا ولم تكن في بيئة الإنتاج
            throw new Error(`Local service account key file not found at: ${serviceAccountPath}. \nEnsure the file exists or set FIREBASE_CONFIG_JSON for production.`);
        }
    } catch (e) {
        console.error("FATAL ERROR: Could not load Firebase service account key.", e.message);
        process.exit(1);
    }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "rehlaapp-9a985.appspot.com" // <--- اسم الـ Bucket الصحيح من Firebase Storage
        });
        console.log("Firebase Admin SDK initialized successfully.");
    } catch (initError) {
        console.error("FATAL ERROR: Firebase Admin SDK initialization failed:", initError);
        process.exit(1);
    }
} else {
    // يجب ألا نصل إلى هنا إذا كانت معالجة الأخطاء أعلاه تعمل بشكل صحيح
    console.error("FATAL ERROR: Firebase serviceAccount object is undefined. Cannot initialize Firebase Admin SDK.");
    process.exit(1);
}
// =======================================================================

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// --- Middleware ---
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'https://rehla-game1.vercel.app',
            'https://rehlagame.com',
            'https://www.rehlagame.com',
            'http://localhost:63342', // لـ WebStorm أو IDEs أخرى
            // يمكنك إضافة أي نطاقات localhost أخرى تستخدمها للتطوير
        ];
        // السماح بالطلبات التي ليس لها origin (مثل file:///) أو إذا كان Origin ضمن المصادر المسموح بها
        // أو إذا كنا في بيئة تطوير ونريد السماح بـ localhost
        if (!origin || origin === 'null' || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && origin && origin.startsWith('http://localhost:'))) {
            callback(null, true);
        } else {
            console.warn(`CORS: Origin ${origin} not allowed by CORS policy.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تم إزالة خدمة الملفات الساكنة من public/uploads لأن الصور ستُخدم من Firebase
// app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
// console.log('Serving static files for /uploads from:', path.join(__dirname, 'public/uploads'));

// --- Routes ---
app.use('/api/questions', questionRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/user', userRoutes);
app.use('/api/game', gameDataRoutes);

app.get('/', (req, res) => {
    res.send('Rehla Game API is running smoothly with Firebase Admin SDK integrated!');
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('Global Error Handler Triggered:');
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack || 'No stack available');
    // console.error('Request URL:', req.originalUrl); // يمكنك تفعيلها للتحقق من الأخطاء
    // console.error('Request Method:', req.method); // يمكنك تفعيلها للتحقق من الأخطاء

    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Multer error: ${err.message}` });
    }
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
        return res.status(err.statusCode).json({ message: err.message || 'An error occurred.' });
    }
    if (err.code === '23505' || (err.message && err.message.toLowerCase().includes('unique constraint failed'))) {
        return res.status(409).json({
            message: 'Conflict: A resource with this identifier already exists or a unique constraint was violated.',
        });
    }
    res.status(500).json({ message: 'An unexpected server error occurred. Please try again later.' });
});

// تم إزالة إنشاء مجلد public/uploads لأنه لم يعد ضروريًا
// const uploadsDir = path.join(__dirname, 'public/uploads');
// if (!fs.existsSync(uploadsDir)) {
//     fs.mkdirSync(uploadsDir, { recursive: true });
//     console.log(`Created uploads directory: ${uploadsDir}`);
// }

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server for Rehla Game is running on http://0.0.0.0:${PORT}`);
    console.log(`NODE_ENV is set to: ${process.env.NODE_ENV}`);
    console.log(`DATABASE_URL (first 20 chars): ${process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'Not Set'}`);
    if (admin.apps.length) { // تحقق من أن تطبيق Firebase Admin قد تم تهيئته
        console.log('Firebase Admin App Name:', admin.app().name);
    } else {
        console.error("Firebase Admin App was not initialized prior to server start!");
    }
});
