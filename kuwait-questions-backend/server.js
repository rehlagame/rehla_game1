// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors'); // تأكد من وجود هذا السطر
const path = require('path');
const fs = require('fs');
const db = require('./database/database'); // يفترض أنه يتصل بـ PostgreSQL
// const setupMulter = require('./middleware/multerConfig'); // setupMulter ليس ضروريًا هنا إذا كان multer يُستخدم مباشرة في المسارات
const questionRoutes = require('./routes/questionRoutes');
const promoRoutes = require('./routes/promoRoutes');
const userRoutes = require('./routes/userRoutes'); // تم تضمين هذا بشكل صحيح
const multer = require('multer'); // multer يُستخدم في questionRoutes

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// --- Middleware ---

// تكوين CORS بشكل أكثر تحديدًا
const corsOptions = {
    origin: function (origin, callback) {
        // قائمة المصادر المسموح بها
        const allowedOrigins = [
            'https://rehla-game1.vercel.app', // <--- تأكد أن هذا هو نطاق Vercel الفعلي والصحيح الخاص بك!
            // إذا كنت لا تزال تختبر admin.html من file:///، أضف 'null'
            'null',
            // إذا كنت تشغل admin.html عبر خادم تطوير محلي (مثل Live Server في VS Code) أضف منفذه:
            // 'http://localhost:5500', // مثال إذا كان Live Server يعمل على 5500
            // 'http://127.0.0.1:5500'  // مثال آخر لـ Live Server
        ];

        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS: Origin ${origin} not allowed by CORS policy.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // تأكد من تضمين OPTIONS
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'], // أضف أي headers أخرى تستخدمها (Authorization مهم لـ Firebase token)
    credentials: true, // مهم إذا كنت ترسل cookies أو Authorization header
    optionsSuccessStatus: 200 // بعض المتصفحات القديمة (IE11) تتعثر على 204
};

app.use(cors(corsOptions));

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images (إذا كنت لا تزال تستخدمها لخادم Render المؤقت)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
console.log(
    'Serving static files for /uploads from:',
    path.join(__dirname, 'public/uploads')
);

// --- Routes ---
app.use('/api/questions', questionRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/user', userRoutes); // تم تسجيل مسارات المستخدمين هنا

// Simple root endpoint (جيد للاختبار السريع لمعرفة ما إذا كان الخادم يعمل)
app.get('/', (req, res) => {
    res.send('Rehla Game API is running smoothly on Render!');
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('Global Error Handler Triggered:');
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack || 'No stack available');
    console.error('Request URL:', req.originalUrl);
    console.error('Request Method:', req.method);

    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Multer error: ${err.message}` });
    }
    // إذا كان الخطأ يحتوي على statusCode، استخدمه
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
        return res.status(err.statusCode).json({ message: err.message || 'An error occurred.' });
    }
    // معالجة خطأ UNIQUE constraint بشكل أفضل
    if (err.code === '23505' || (err.message && err.message.toLowerCase().includes('unique constraint failed'))) {
        return res.status(409).json({ // 409 Conflict
            message: 'Conflict: A resource with this identifier already exists or a unique constraint was violated.',
            // error: err.message // يمكنك إزالة التفاصيل الدقيقة للخطأ في بيئة الإنتاج
        });
    }

    // خطأ عام للخادم
    res.status(500).json({ message: 'An unexpected server error occurred. Please try again later.' });
});

// Ensure uploads directory exists (فقط إذا كنت لا تزال تعتمد على تحميلات الخادم المؤقتة)
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory: ${uploadsDir}`);
}

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server for Rehla Game is running on http://0.0.0.0:${PORT}`);
    console.log(`NODE_ENV is set to: ${process.env.NODE_ENV}`);
    console.log(`DATABASE_URL (first 20 chars): ${process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0,20) + '...' : 'Not Set'}`);
});
