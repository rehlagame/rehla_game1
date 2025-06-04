// routes/gameDataRoutes.js
const express = require('express');
const pool    = require('../database/database'); // تأكد أن المسار إلى ملف قاعدة البيانات صحيح
const router  = express.Router();

// دالة مساعدة لتنسيق صف السؤال (يمكنك نقلها إلى ملف helpers مشترك إذا أردت)
const safeJsonParse = (jsonString, defaultValue = []) => {
    try {
        if (!jsonString) return defaultValue;
        // إذا كان الكائن المُمرر هو بالفعل كائن JavaScript (وليس سلسلة JSON)
        // وهو ما قد يحدث إذا قام pool.query بتحويل JSONB إلى كائن تلقائيًا.
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
const backendBaseUrlForImages = process.env.BACKEND_URL || `https://rehla-game-backend.onrender.com`;
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
        is_general: Boolean(dbRow.is_general), // إبقاء is_general للاستخدام الداخلي إذا لزم الأمر
        type: dbRow.type,
        image_filename: dbRow.image_filename,
        image_firebase_url: dbRow.image_firebase_url
        // لا نعتمد على image_filename لإنشاء رابط firebase بعد الآن
        // image_firebase_url يجب أن يكون هو المصدر الوحيد لرابط firebase
        // هذا السطر كان للـ fallback, ولكن مع Firebase يجب أن يكون الرابط كاملًا
        // ? dbRow.image_firebase_url
        // : (dbRow.image_filename ? `${baseImageUrl}${dbRow.image_filename}` : null)
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
            await client.query('BEGIN'); // بدء معاملة

            // 1. جلب جميع أسماء المعالم الفريدة (غير العامة)
            const landmarksResult = await client.query(
                "SELECT DISTINCT landmark_name FROM questions WHERE landmark_name IS NOT NULL AND landmark_name <> '' AND is_general = FALSE ORDER BY landmark_name"
            );
            const allLandmarks = landmarksResult.rows.map(row => row.landmark_name);
            console.log(`[GameDataRoutes] Fetched ${allLandmarks.length} unique landmarks.`);

            // 2. جلب جميع الأسئلة العامة الصعبة
            // (التي تم إدخالها كـ "سؤال عام" في admin.html، والتي يجب أن تكون difficulty='hard' و points=600)
            const generalHardQuestionsResult = await client.query(
                "SELECT * FROM questions WHERE is_general = TRUE AND difficulty = 'hard' ORDER BY RANDOM()"
            );
            const generalHardQs = generalHardQuestionsResult.rows.map(formatQuestionRowForResponse);
            console.log(`[GameDataRoutes] Fetched ${generalHardQs.length} general HARD questions.`);

            // 3. جلب جميع الأسئلة العامة المتوسطة
            // (التي تم إدخالها كـ "سؤال عام متوسط" في admin.html، والتي يجب أن تكون difficulty='medium' و points=300)
            const generalMediumQuestionsResult = await client.query(
                "SELECT * FROM questions WHERE is_general = TRUE AND difficulty = 'medium' ORDER BY RANDOM()"
            );
            const generalMediumQs = generalMediumQuestionsResult.rows.map(formatQuestionRowForResponse);
            console.log(`[GameDataRoutes] Fetched ${generalMediumQs.length} general MEDIUM questions.`);

            // 4. جلب جميع الأسئلة المرتبطة بالمعالم وتنظيمها (غير العامة)
            const landmarkQuestionsResult = await client.query(
                "SELECT * FROM questions WHERE is_general = FALSE AND landmark_name IS NOT NULL AND landmark_name <> ''"
            );
            const landmarkQs = {};
            landmarkQuestionsResult.rows.forEach(row => {
                const question = formatQuestionRowForResponse(row);
                if (question.landmark_name) {
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
                generalHardQs: generalHardQs,     // أسئلة عامة صعبة
                generalMediumQs: generalMediumQs, // أسئلة عامة متوسطة
                landmarkQs: landmarkQs            // أسئلة خاصة بالمعالم
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
