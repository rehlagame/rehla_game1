// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./database/database');
const questionRoutes = require('./routes/questionRoutes');
const promoRoutes = require('./routes/promoRoutes');
const userRoutes = require('./routes/userRoutes');
const gameDataRoutes = require('./routes/gameDataRoutes');
const paymentRoutes = require('./routes/paymentRoutes'); // <-- إضافة استيراد مسارات الدفع
const { verifyFirebaseToken } = require('./middleware/authMiddleware'); // <-- إضافة استيراد middleware المصادقة
const multer = require('multer');

// ================== Firebase Admin SDK Initialization ==================
const admin = require('firebase-admin');
let serviceAccount;

if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_CONFIG_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
        console.log("Firebase Admin SDK: Initializing with FIREBASE_CONFIG_JSON from environment variables.");
    } catch (e) {
        console.error("FATAL ERROR: Could not parse FIREBASE_CONFIG_JSON.", e);
        process.exit(1);
    }
} else {
    try {
        const serviceAccountPath = path.join(__dirname, 'rehlaapp-9a985-firebase-adminsdk-fbsvc-01e9f23075.json');
        if (fs.existsSync(serviceAccountPath)) {
            serviceAccount = require(serviceAccountPath);
            console.log("Firebase Admin SDK: Initializing with local service account key file.");
        } else {
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
            storageBucket: "rehlaapp-9a985.firebasestorage.app"
        });
        console.log("Firebase Admin SDK initialized successfully.");
    } catch (initError) {
        console.error("FATAL ERROR: Firebase Admin SDK initialization failed:", initError);
        process.exit(1);
    }
} else {
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

// --- Routes ---
// المسارات العامة التي لا تتطلب مصادقة بالضرورة (مثل جلب الأسئلة العامة أو التحقق من كود خصم)
// يمكن تركها بدون verifyFirebaseToken إذا كان هذا هو السلوك المطلوب
app.use('/api/questions', questionRoutes); // بعض مسارات الأسئلة قد تحتاج حماية (مثل الإضافة والتعديل)
app.use('/api/promos', promoRoutes);     // بعض مسارات أكواد الخصم قد تحتاج حماية
app.use('/api/game', gameDataRoutes);    // هذا المسار لجلب بيانات اللعبة، قد يكون عامًا

// المسارات التي تتطلب مصادقة المستخدم بشكل مؤكد
// لاحظ أننا سنحتاج إلى تطبيق verifyFirebaseToken داخل userRoutes و paymentRoutes بشكل انتقائي
// أو تطبيقها هنا بشكل عام إذا كانت *كل* المسارات الفرعية تتطلبها.
// لتوفير مرونة، من الأفضل تطبيقها داخل ملفات المسارات نفسها.
app.use('/api/user', userRoutes);
app.use('/api/payment', paymentRoutes); // <-- إضافة استخدام مسار الدفع

app.get('/', (req, res) => {
    res.send('Rehla Game API is running smoothly with Firebase Admin SDK integrated!');
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('Global Error Handler Triggered:');
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack || 'No stack available');

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
    // معالجة أخطاء المصادقة من Firebase
    if (err.code && err.code.startsWith('auth/')) {
        return res.status(401).json({ message: `Authentication error: ${err.message}` });
    }

    res.status(500).json({ message: 'An unexpected server error occurred. Please try again later.' });
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server for Rehla Game is running on http://0.0.0.0:${PORT}`);
    console.log(`NODE_ENV is set to: ${process.env.NODE_ENV}`);
    console.log(`DATABASE_URL (first 20 chars): ${process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'Not Set'}`);
    if (admin.apps.length) {
        console.log('Firebase Admin App Name:', admin.app().name);
    } else {
        console.error("Firebase Admin App was not initialized prior to server start!");
    }
});
