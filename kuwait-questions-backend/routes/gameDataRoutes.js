// routes/gameDataRoutes.js
const express = require('express');
const pool    = require('../database/database'); // تأكد أن المسار إلى ملف قاعدة البيانات صحيح
const router  = express.Router();

// دالة مساعدة لتنسيق صف السؤال (يمكنك نقلها إلى ملف helpers مشترك إذا أردت)
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

// --- Configuration for Image URLs (مهم إذا كنت لا تزال تستخدم image_filename) ---
// افترض أن BACKEND_URL معرف في .env ويتم استخدامه في مكان آخر إذا لزم الأمر
// أو يمكنك كتابته هنا مباشرة إذا كان ثابتًا لـ Render
const backendBaseUrlForImages = process.env.BACKEND_URL || `https://rehla-game-backend.onrender.com`; // <--- تأكد من هذا الرابط
const baseImageUrl   = `${backendBaseUrlForImages}/uploads/`;


const formatQuestionRowForResponse = (dbRow) => {
    if (!dbRow) return null;
    return {
        id: dbRow.q_id, // الواجهة الأمامية قد تتوقع 'id' بدلاً من 'q_id'
        q_id: dbRow.q_id,
        text: dbRow.text,
        options: safeJsonParse(dbRow.options_json, []),
        correctAnswer: dbRow.correctanswer,
        difficulty: dbRow.difficulty,
        points: dbRow.points,
        landmark: dbRow.landmark_name, // الواجهة الأمامية قد تتوقع 'landmark'
        landmark_name: dbRow.landmark_name,
        isGeneral: Boolean(dbRow.is_general), // الواجهة الأمامية قد تتوقع 'isGeneral'
        is_general: Boolean(dbRow.is_general),
        type: dbRow.type,
        image_filename: dbRow.image_filename,
        image_firebase_url: dbRow.image_firebase_url
            ? dbRow.image_firebase_url
            : (dbRow.image_filename ? `${baseImageUrl}${dbRow.image_filename}` : null)
    };
};


// ===== GET /api/game/questions-data =====
// هذا المسار يجمع كل بيانات اللعبة اللازمة للواجهة الأمامية
router.get('/questions-data', async (req, res, next) => {
    console.log('[GameDataRoutes] Request received for /questions-data');
    // (اختياري) يمكنك إضافة middleware للمصادقة هنا إذا أردت أن يكون هذا المسار محميًا
    // const user = req.user; // (يتطلب middleware مصادقة مثل verifyFirebaseToken)

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN'); // بدء معاملة (اختياري ولكن جيد للعمليات المتعددة)

            // 1. جلب جميع أسماء المعالم الفريدة (غير العامة)
            const landmarksResult = await client.query(
                "SELECT DISTINCT landmark_name FROM questions WHERE landmark_name IS NOT NULL AND landmark_name <> '' AND is_general = FALSE ORDER BY landmark_name"
            );
            const allLandmarks = landmarksResult.rows.map(row => row.landmark_name);
            console.log(`[GameDataRoutes] Fetched ${allLandmarks.length} unique landmarks.`);

            // 2. جلب جميع الأسئلة العامة
            const generalQuestionsResult = await client.query(
                "SELECT * FROM questions WHERE is_general = TRUE ORDER BY RANDOM()" // إضافة ORDER BY RANDOM() لتنويع الأسئلة العامة
            );
            const generalQs = generalQuestionsResult.rows.map(formatQuestionRowForResponse);
            console.log(`[GameDataRoutes] Fetched ${generalQs.length} general questions.`);

            // 3. جلب جميع الأسئلة المرتبطة بالمعالم وتنظيمها
            const landmarkQuestionsResult = await client.query(
                "SELECT * FROM questions WHERE is_general = FALSE AND landmark_name IS NOT NULL AND landmark_name <> ''"
            );
            const landmarkQs = {};
            landmarkQuestionsResult.rows.forEach(row => {
                const question = formatQuestionRowForResponse(row);
                if (question.landmark_name) { // تأكد أن landmark_name موجود
                    if (!landmarkQs[question.landmark_name]) {
                        landmarkQs[question.landmark_name] = [];
                    }
                    landmarkQs[question.landmark_name].push(question);
                }
            });
            console.log(`[GameDataRoutes] Processed landmark questions into ${Object.keys(landmarkQs).length} landmark categories.`);

            await client.query('COMMIT'); // إنهاء المعاملة بنجاح

            res.json({
                allLandmarks: allLandmarks,
                generalQs: generalQs,
                landmarkQs: landmarkQs
            });

        } catch (txError) {
            if (client) await client.query('ROLLBACK'); // التراجع عند حدوث خطأ في المعاملة
            console.error('[GameDataRoutes] Error during transaction for /questions-data:', txError.stack);
            next(new Error('Database transaction error while fetching game data.'));
        } finally {
            if (client) client.release();
        }
    } catch (err) {
        console.error('[GameDataRoutes] Error establishing connection for /questions-data:', err.stack);
        next(new Error('Failed to connect to database for game data.'));
    }
});

module.exports = router;
