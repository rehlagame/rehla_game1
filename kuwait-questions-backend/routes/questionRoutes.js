// routes/questionRoutes.js

const express = require('express');
const pool = require('../database/database');
const upload = require('../middleware/multerConfig'); // يجب أن يستخدم memoryStorage الآن
const { v4: uuidv4 } = require('uuid');
const fs = require('fs'); // لا يزال مطلوبًا لبعض عمليات التحقق إذا لزم الأمر، ولكن ليس لحذف الملفات المرفوعة من multer
const path = require('path'); // لا يزال مطلوبًا لـ path.join إذا كنت تستخدمه لشيء آخر، ولكن ليس لـ public/uploads

// --- Firebase Admin SDK ---
// يفترض أن admin مُهيأ في server.js ومتاح عالميًا أو يتم تمريره
// إذا لم يكن كذلك، قم باستيراده وتهيئته هنا كما فعلنا في server.js (غير موصى به لتكرار التهيئة)
const admin = require('firebase-admin'); // تأكد من أن هذا يعمل بناءً على كيفية تهيئتك له

const router = express.Router();

// تم إزالة baseImageUrl لأنه لم يعد ضروريًا بهذه الطريقة
// const backendBaseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
// const baseImageUrl   = `${backendBaseUrl}/uploads/`;

// Helper: Safely parse JSON arrays
const safeJsonParse = (jsonString, defaultValue = []) => {
    try {
        if (!jsonString) return defaultValue;
        if (typeof jsonString === 'object' && jsonString !== null) {
            return Array.isArray(jsonString) ? jsonString : defaultValue;
        }
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : defaultValue;
    } catch {
        return defaultValue;
    }
};

// Helper: Delete image file from Firebase Storage
const deleteImageFromFirebase = async (firebaseUrl) => {
    if (!firebaseUrl) return;
    try {
        const bucket = admin.storage().bucket(); // احصل على الـ bucket الافتراضي
        // استخراج مسار الملف من الرابط
        // الرابط عادةً: https://firebasestorage.googleapis.com/v0/b/YOUR_BUCKET_NAME/o/question_images%2Ffilename.jpg?alt=media&token=...
        // أو gs://YOUR_BUCKET_NAME/question_images/filename.jpg
        let filePath;
        if (firebaseUrl.startsWith('gs://')) {
            filePath = firebaseUrl.substring(firebaseUrl.indexOf('/', 5) + 1);
        } else if (firebaseUrl.includes('/o/')) {
            filePath = decodeURIComponent(firebaseUrl.split('/o/')[1].split('?')[0]);
        } else {
            console.warn(`Could not parse Firebase URL to extract file path: ${firebaseUrl}`);
            return;
        }
        
        await bucket.file(filePath).delete();
        console.log(`Successfully deleted image ${filePath} from Firebase Storage.`);
    } catch (error) {
        // لا توقف العملية إذا فشل الحذف، فقط سجّل الخطأ
        if (error.code === 404) {
            console.log(`Firebase Storage: File to delete not found (${firebaseUrl}). It might have been already deleted.`);
        } else {
            console.error(`Failed to delete image from Firebase Storage (URL: ${firebaseUrl}):`, error.message);
        }
    }
};


// Helper: Format a DB row for the client
const formatQuestionRowForResponse = (dbRow) => {
    if (!dbRow) return null;
    return {
        q_id: dbRow.q_id,
        text: dbRow.text,
        options: safeJsonParse(dbRow.options_json, []),
        correctAnswer: dbRow.correctanswer, // لاحظ أن PostgreSQL يحول الأعمدة إلى lowercase
        difficulty: dbRow.difficulty,
        points: dbRow.points,
        landmark_name: dbRow.landmark_name,
        is_general: Boolean(dbRow.is_general),
        type: dbRow.type,
        image_filename: dbRow.image_filename, // يمكنك الإبقاء عليه كمرجع
        image_firebase_url: dbRow.image_firebase_url // هذا هو المهم الآن
    };
};

// ===== GET all questions =====
router.get('/', async (req, res, next) => {
    const sql = `
        SELECT q_id, text, options_json, correctanswer,
               difficulty, points, landmark_name,
               is_general, type, image_filename, image_firebase_url
        FROM questions
        ORDER BY q_id DESC
    `;
    try {
        const result = await pool.query(sql);
        const questions = result.rows.map(formatQuestionRowForResponse);
        res.json({ questions });
    } catch (err) {
        console.error("Error fetching questions:", err.stack);
        next(new Error('Failed to retrieve questions. Details: ' + err.message));
    }
});

// ===== GET a single question by ID =====
router.get('/:id', async (req, res, next) => {
    const { id } = req.params;
    const sql = `
        SELECT q_id, text, options_json, correctanswer,
               difficulty, points, landmark_name,
               is_general, type, image_filename, image_firebase_url
        FROM questions
        WHERE q_id = $1
    `;
    try {
        const result = await pool.query(sql, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: `Question with ID ${id} not found.` });
        }
        const question = formatQuestionRowForResponse(result.rows[0]);
        res.json({ question });
    } catch (err) {
        console.error(`Error fetching question ${id}:`, err.stack);
        next(new Error(`Failed to retrieve question ${id}. Details: ${err.message}`));
    }
});


// ===== POST create a new question =====
router.post('/', upload.single('image'), async (req, res, next) => {
    const {
        text, options, correctAnswer,
        difficulty, points, landmark_name,
        type = 'mcq'
    } = req.body;
    const isGeneralBool = String(req.body.is_general).toLowerCase() === 'true';
    // PostgreSQL يتوقع boolean لـ is_general، لذا التحويل إلى 1/0 لم يعد ضروريًا

    if (!text || !correctAnswer || !difficulty || options === undefined || points === undefined) {
        // لا حاجة لـ deleteImageFile هنا لأننا نستخدم memoryStorage
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    const q_id = `q_${uuidv4()}`;
    let image_firebase_url = null;
    let firebaseBlobName = null; // لتخزين اسم الملف في Firebase للرجوع إليه عند الخطأ

    if (req.file && req.file.buffer) {
        try {
            const bucket = admin.storage().bucket(); // اسم الـ Bucket الافتراضي
            // اسم ملف فريد في Firebase Storage
            firebaseBlobName = `question_images/${q_id}_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const blob = bucket.file(firebaseBlobName);
            const blobStream = blob.createWriteStream({
                metadata: { contentType: req.file.mimetype }
            });

            await new Promise((resolve, reject) => {
                blobStream.on('error', (err) => {
                    console.error('Firebase Storage stream error:', err);
                    reject(err);
                });
                blobStream.on('finish', async () => {
                    try {
                        await blob.makePublic(); // جعل الملف عامًا
                        image_firebase_url = blob.publicUrl(); // الحصول على الرابط العام
                        console.log(`File ${blob.name} uploaded to Firebase. URL: ${image_firebase_url}`);
                        resolve();
                    } catch (publicErr) {
                        console.error('Error making file public or getting URL:', publicErr);
                        reject(publicErr);
                    }
                });
                blobStream.end(req.file.buffer); // إرسال الـ buffer إلى الـ stream
            });
        } catch (uploadError) {
            console.error('Error uploading to Firebase Storage:', uploadError);
            // لا توقف العملية هنا، سنحاول حفظ السؤال بدون صورة إذا فشل الرفع
            // ولكن يمكنك اختيار إرجاع خطأ هنا إذا كان رفع الصورة إلزاميًا
            // return next(new Error('Failed to upload image to Firebase Storage.'));
            image_firebase_url = null; // تأكد من أنه null إذا فشل الرفع
            firebaseBlobName = null;
        }
    }

    const optsArr = safeJsonParse(options, null);
    if (optsArr === null) {
        if (firebaseBlobName) await deleteImageFromFirebase(image_firebase_url); // حذف إذا تم الرفع ثم فشل تحليل الخيارات
        return res.status(400).json({ message: 'Invalid options format.' });
    }
    const pointsInt = parseInt(points, 10);
    if (isNaN(pointsInt)) {
        if (firebaseBlobName) await deleteImageFromFirebase(image_firebase_url);
        return res.status(400).json({ message: 'Points must be a number.' });
    }

    const sql = `
    INSERT INTO questions (
      q_id, text, options_json, correctanswer,
      difficulty, points, landmark_name,
      is_general, type, image_filename, image_firebase_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;
    const params = [
        q_id,
        text,
        JSON.stringify(optsArr),
        correctAnswer,
        difficulty,
        pointsInt,
        (landmark_name && !isGeneralBool && landmark_name !== 'سؤال عام') ? landmark_name : null,
        isGeneralBool, // استخدم boolean مباشرة
        type,
        req.file ? req.file.originalname : null, // اسم الملف الأصلي كمرجع
        image_firebase_url // رابط Firebase
    ];

    try {
        const result = await pool.query(sql, params);
        res.status(201).json({
            message: 'Question added successfully',
            question: formatQuestionRowForResponse(result.rows[0])
        });
    } catch (err) {
        console.error('Error inserting question into DB:', err.stack);
        // إذا فشل الإدخال في قاعدة البيانات بعد رفع الصورة، قم بحذف الصورة من Firebase
        if (firebaseBlobName) {
            await deleteImageFromFirebase(image_firebase_url);
        }
        next(new Error('Failed to add question to DB. Details: ' + err.message));
    }
});

// ===== PUT update an existing question =====
router.put('/:id', upload.single('image'), async (req, res, next) => {
    const { id } = req.params;
    const {
        text, options, correctAnswer,
        difficulty, points, landmark_name,
        type = 'mcq', remove_image // remove_image سيأتي من checkbox
    } = req.body;
    const isGeneralBool = String(req.body.is_general).toLowerCase() === 'true';
    const newImageUploaded = req.file; // هل تم رفع ملف جديد؟ (يحتوي على buffer)
    const shouldRemoveExistingImage = String(remove_image).toLowerCase() === 'true';

    if (!text || !correctAnswer || !difficulty || options === undefined || points === undefined) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    let firebaseBlobName = null; // لتخزين اسم الملف الجديد في Firebase

    try {
        const currentQuestionResult = await pool.query(
            "SELECT image_filename, image_firebase_url FROM questions WHERE q_id = $1",
            [id]
        );
        if (currentQuestionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Question not found.' });
        }
        const currentData = currentQuestionResult.rows[0];
        let final_image_firebase_url = currentData.image_firebase_url;
        let final_image_filename_ref = currentData.image_filename; // اسم الملف الأصلي كمرجع

        // 1. إذا تم رفع صورة جديدة
        if (newImageUploaded && newImageUploaded.buffer) {
            const bucket = admin.storage().bucket();
            firebaseBlobName = `question_images/${id}_${Date.now()}_${newImageUploaded.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const blob = bucket.file(firebaseBlobName);
            const blobStream = blob.createWriteStream({ metadata: { contentType: newImageUploaded.mimetype } });

            await new Promise((resolve, reject) => {
                blobStream.on('error', reject).on('finish', async () => {
                    try {
                        await blob.makePublic();
                        final_image_firebase_url = blob.publicUrl();
                        final_image_filename_ref = newImageUploaded.originalname; // تحديث اسم الملف المرجعي
                        console.log(`New image uploaded for ${id}. URL: ${final_image_firebase_url}`);
                        // حذف الصورة القديمة من Firebase إذا كانت موجودة
                        if (currentData.image_firebase_url && currentData.image_firebase_url !== final_image_firebase_url) {
                            await deleteImageFromFirebase(currentData.image_firebase_url);
                        }
                        resolve();
                    } catch (publicErr) { reject(publicErr); }
                });
                blobStream.end(newImageUploaded.buffer);
            });
        }
        // 2. إذا طُلب إزالة الصورة الحالية ولم يتم رفع صورة جديدة
        else if (shouldRemoveExistingImage && final_image_firebase_url) {
            await deleteImageFromFirebase(final_image_firebase_url);
            final_image_firebase_url = null;
            final_image_filename_ref = null;
        }

        const optsArr = safeJsonParse(options, null);
        if (optsArr === null) {
            if (firebaseBlobName) await deleteImageFromFirebase(final_image_firebase_url); // إذا رفعنا صورة جديدة ثم فشل هنا
            return res.status(400).json({ message: 'Invalid options format.' });
        }
        const pointsInt = parseInt(points, 10);
        if (isNaN(pointsInt)) {
            if (firebaseBlobName) await deleteImageFromFirebase(final_image_firebase_url);
            return res.status(400).json({ message: 'Points must be a number.' });
        }

        const sql = `
            UPDATE questions SET
                text = $1, options_json = $2, correctanswer = $3, difficulty = $4,
                points = $5, landmark_name = $6, is_general = $7, type = $8,
                image_filename = $9, image_firebase_url = $10
            WHERE q_id = $11
            RETURNING *
        `;
        const params = [
            text, JSON.stringify(optsArr), correctAnswer, difficulty, pointsInt,
            (landmark_name && !isGeneralBool && landmark_name !== 'سؤال عام') ? landmark_name : null,
            isGeneralBool, type,
            final_image_filename_ref,
            final_image_firebase_url,
            id
        ];

        const updateRes = await pool.query(sql, params);
        if (updateRes.rowCount === 0) { // يجب ألا يحدث هذا
             if (firebaseBlobName) await deleteImageFromFirebase(final_image_firebase_url);
            return res.status(404).json({ message: 'Question not found during update process.' });
        }

        res.json({
            message: 'Question updated successfully',
            question: formatQuestionRowForResponse(updateRes.rows[0])
        });

    } catch (err) {
        console.error(`Error updating question ${id}:`, err.stack);
        // إذا حدث خطأ بعد رفع صورة جديدة إلى Firebase، حاول حذفها
        if (firebaseBlobName && final_image_firebase_url) { // تأكد أن final_image_firebase_url قد تم تعيينه
             await deleteImageFromFirebase(final_image_firebase_url);
        }
        next(new Error(`Failed to update question. Details: ${err.message}`));
    }
});


// ===== DELETE a question =====
router.delete('/:id', async (req, res, next) => {
    const { id } = req.params;
    try {
        const selectResult = await pool.query("SELECT image_firebase_url FROM questions WHERE q_id = $1", [id]);
        if (selectResult.rows.length === 0) {
            return res.status(404).json({ message: 'Question not found.' });
        }
        const firebaseImageUrl = selectResult.rows[0].image_firebase_url;

        const deleteDbResult = await pool.query("DELETE FROM questions WHERE q_id = $1 RETURNING q_id", [id]);
        if (deleteDbResult.rowCount === 0) {
            // نظريًا، يجب ألا نصل إلى هنا إذا كان selectResult قد وجد الصف
            return res.status(404).json({ message: 'Question not found during delete from DB.' });
        }

        if (firebaseImageUrl) {
            await deleteImageFromFirebase(firebaseImageUrl);
        }

        res.json({ message: `Question ${id} and associated image (if any) deleted successfully.` });
    } catch (err) {
        console.error(`Error deleting question ${id}:`, err.stack);
        next(new Error(`Failed to delete question. Details: ${err.message}`));
    }
});

module.exports = router;
