// routes/gameDataRoutes.js
const express = require('express');
const pool    = require('../database/database'); // تأكد أن المسار إلى ملف قاعدة البيانات صحيح
const router  = express.Router();

// دالة مساعدة لتنسيق صف السؤال
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

// لم نعد بحاجة إلى baseImageUrl هنا لأننا سنعتمد كليًا على image_firebase_url
// const backendBaseUrlForImages = process.env.BACKEND_URL || `https://rehla-game-backend.onrender.com`;
// const baseImageUrl   = `${backendBaseUrlForImages}/uploads/`;

const formatQuestionRowForResponse = (dbRow) => {
    if (!dbRow) return null;
    return {
        id: dbRow.q_id,
        q_id: dbRow.q_id,
        text: dbRow.text,
        options: safeJsonParse(dbRow.options_json, []),
        correctAnswer: dbRow.correctanswer,
        difficulty: dbRow.difficulty,
        points: dbRow.points,
        landmark: dbRow.landmark_name,
        landmark_name: dbRow.landmark_name,
        isGeneral: Boolean(dbRow.is_general),
        is_general: Boolean(dbRow.is_general),
        type: dbRow.type,
        image_filename: dbRow.image_filename, // يبقى كمرجع إذا أردت
        image_firebase_url: dbRow.image_firebase_url
    };
};


// ===== GET /api/game/questions-data =====
router.get('/questions-data', async (req, res, next) => {
    console.log('[GameDataRoutes] Request received for /questions-data (Simplified General Qs)');
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. جلب جميع أسماء المعالم الفريدة (غير العامة)
            const landmarksResult = await client.query(
                "SELECT DISTINCT landmark_name FROM questions WHERE landmark_name IS NOT NULL AND landmark_name <> '' AND is_general = FALSE ORDER BY landmark_name"
            );
            const allLandmarks = landmarksResult.rows.map(row => row.landmark_name);
            console.log(`[GameDataRoutes] Fetched ${allLandmarks.length} unique landmarks.`);

            // 2. *** تعديل: جلب الأسئلة العامة التي هي "صعبة" تحت مسمى generalQs ***
            // هذا يفترض أن "سؤال عام" في admin.html ينتج عنه difficulty = 'hard'
            const generalQuestionsResult = await client.query(
                "SELECT * FROM questions WHERE is_general = TRUE AND difficulty = 'hard' ORDER BY RANDOM()"
            );
            const generalQs = generalQuestionsResult.rows.map(formatQuestionRowForResponse);
            console.log(`[GameDataRoutes] Fetched ${generalQs.length} general (hard) questions for 'generalQs'. Sample:`, generalQs.slice(0,1));

            // 3. جلب جميع الأسئلة العامة المتوسطة بشكل منفصل
            // هذا يفترض أن "سؤال عام متوسط" في admin.html ينتج عنه difficulty = 'medium'
            const generalMediumQuestionsResult = await client.query(
                "SELECT * FROM questions WHERE is_general = TRUE AND difficulty = 'medium' ORDER BY RANDOM()"
            );
            const generalMediumQs = generalMediumQuestionsResult.rows.map(formatQuestionRowForResponse);
            console.log(`[GameDataRoutes] Fetched ${generalMediumQs.length} general MEDIUM questions for 'generalMediumQs'. Sample:`, generalMediumQs.slice(0,1));

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

            await client.query('COMMIT');

            res.json({
                allLandmarks: allLandmarks,
                generalQs: generalQs,             // الأسئلة العامة (الصعبة)
                generalMediumQs: generalMediumQs, // الأسئلة العامة المتوسطة
                landmarkQs: landmarkQs
            });

        } catch (txError) {
            if (client) await client.query('ROLLBACK');
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
