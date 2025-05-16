// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors'); // تأكد من وجود هذا السطر
const path = require('path');
const fs = require('fs');
const db = require('./database/database');
// const setupMulter = require('./middleware/multerConfig'); // setupMulter غير مستخدم مباشرة هنا
const questionRoutes = require('./routes/questionRoutes');
const promoRoutes = require('./routes/promoRoutes');
const multer = require('multer');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;
const userRoutes = require('./routes/userRoutes'); // افترض أنك أنشأت هذا الملف
app.use('/api/user', userRoutes); // <--- تسجيل المسارات الجديدة
// --- Middleware ---

// Enable CORS for all origins
app.use(cors()); // <--- تم التعديل هنا (إزالة الخيارات مؤقتًا)

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
console.log(
    'Serving static files for /uploads from:',
    path.join(__dirname, 'public/uploads')
);

// --- Routes ---

app.use('/api/questions', questionRoutes);
app.use('/api/promos', promoRoutes);

// Simple root endpoint
app.get('/', (req, res) => {
    res.send('Kuwait Questions API is running!');
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err.stack || err);

    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Multer error: ${err.message}` });
    }
    if (err.statusCode) {
        return res.status(err.statusCode).json({ message: err.message });
    }
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({
            message: 'Conflict: Resource already exists or constraint violated.',
            error: err.message,
        });
    }

    res.status(500).json({ message: 'An unexpected server error occurred.' });
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory: ${uploadsDir}`);
}

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
