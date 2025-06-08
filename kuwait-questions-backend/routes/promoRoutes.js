// routes/promoRoutes.js

const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();
// =================================================================================
// === بداية التعديل: استيراد middleware المصادقة ===
// =================================================================================
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
// =================================================================================
// === نهاية التعديل ===
// =================================================================================


// دالة مساعدة لتحويل body إلى boolean
function parseBool(val) {
    const s = String(val).toLowerCase();
    return (s === 'true' || s === '1' || s === 'on');
}

// ===== GET /api/promos =====
// جلب جميع أكواد الخصم، وإرجاعها تحت المفتاح promoCodes
// هذا المسار يمكن أن يبقى عامًا أو يمكن حمايته لاحقًا إذا أردت أن يكون للمسؤولين فقط
router.get('/', async (req, res, next) => {
    const sql = `
        SELECT code, type, value, description, is_active, expiry_date, max_uses, current_uses
        FROM promo_codes
        ORDER BY code
    `;
    try {
        const result = await pool.query(sql);
        // تم ترك التنسيق كما هو، لوحة التحكم قد تحتاج للتحديث لعرض الأعمدة الجديدة
        const promoCodes = result.rows.map(row => ({
            code:        row.code,
            type:        row.type,
            value:       row.value,
            description: row.description,
            is_active:   row.is_active
        }));
        res.json({ promoCodes });
    } catch (err) {
        console.error('Error fetching promo codes:', err.stack);
        next(new Error('Database error fetching promo codes. Details: ' + err.message));
    }
});

// ===== POST /api/promos =====
// إضافة كود خصم جديد (يفترض أن هذا المسار محمي بطريقة أخرى، ربما بكلمة سر للمسؤول)
router.post('/', async (req, res, next) => {
    console.log('--- ADD PROMO CODE ---', req.body);
    // إضافة المتغيرات الجديدة من الطلب
    let { code, type, value, description, is_active, expiry_date, max_uses } = req.body;

    if (!code || !type || value == null) {
        return res.status(400).json({ message: 'Missing required fields: code, type, value.' });
    }
    if (!['percentage','free_games'].includes(type)) {
        return res.status(400).json({ message: "Invalid type. Must be 'percentage' or 'free_games'." });
    }

    const codeUpper     = code.trim().toUpperCase();
    const valInt        = parseInt(value, 10);
    const activeBool    = parseBool(is_active);
    const maxUsesInt    = (max_uses !== undefined && max_uses !== null) ? parseInt(max_uses, 10) : 0;

    if (isNaN(valInt) || valInt <= 0 || (type === 'percentage' && valInt > 100)) {
        return res.status(400).json({ message: 'Invalid value for discount.' });
    }
    if (isNaN(maxUsesInt) || maxUsesInt < 0) {
        return res.status(400).json({ message: 'Invalid value for max uses.' });
    }

    const sql = `
        INSERT INTO promo_codes
            (code, type, value, description, is_active, expiry_date, max_uses)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7)
            RETURNING code, type, value, description, is_active, expiry_date, max_uses
    `;
    const params = [codeUpper, type, valInt, description || null, activeBool, expiry_date || null, maxUsesInt > 0 ? maxUsesInt : null];

    try {
        const result = await pool.query(sql, params);
        return res.status(201).json({
            message: 'Promo code created successfully.',
            code:    result.rows[0].code,
            promo:   result.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(409).json({ message: `Promo code '${codeUpper}' already exists.` });
        }
        console.error('Error inserting promo code:', err.stack);
        next(new Error('Database error creating promo code. Details: ' + err.message));
    }
});

// ===== PUT /api/promos/:code/status =====
router.put('/:code/status', async (req, res, next) => {
    // ... (هذا المسار يبقى كما هو، لا حاجة لتعديله)
    const codeUpper  = req.params.code.toUpperCase();
    const activeBool = parseBool(req.body.is_active);
    const sql = `
        UPDATE promo_codes
        SET is_active = $1
        WHERE code = $2
            RETURNING code, type, value, description, is_active
    `;
    try {
        const result = await pool.query(sql, [activeBool, codeUpper]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: `Promo code '${codeUpper}' not found.` });
        }
        res.json({
            message: `Promo code '${codeUpper}' ${activeBool ? 'activated' : 'deactivated'}.`,
            promo:   result.rows[0]
        });
    } catch (err) {
        console.error(`Error updating promo code status for ${codeUpper}:`, err.stack);
        next(new Error('Database error updating promo code status. Details: ' + err.message));
    }
});

// ===== DELETE /api/promos/:code =====
router.delete('/:code', async (req, res, next) => {
    // ... (هذا المسار يبقى كما هو، لا حاجة لتعديله)
    const codeUpper = req.params.code.toUpperCase();
    try {
        const result = await pool.query(
            `DELETE FROM promo_codes WHERE code = $1 RETURNING code`,
            [codeUpper]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: `Promo code '${codeUpper}' not found.` });
        }
        res.json({ message: `Promo code '${codeUpper}' deleted successfully.`, code: result.rows[0].code });
    } catch (err) {
        console.error(`Error deleting promo code ${codeUpper}:`, err.stack);
        next(new Error('Database error deleting promo code. Details: ' + err.message));
    }
});


// ===== GET /api/promos/validate/:code =====
// للتحقق من صحة كود الخصم وإرجاع تفاصيله
// تم الآن حماية هذا المسار ويتطلب أن يكون المستخدم مسجلاً دخوله
// =================================================================================
// === بداية التعديل: تعديل مسار التحقق من الكود ===
// =================================================================================
router.get('/validate/:code', verifyFirebaseToken, async (req, res, next) => {
    const promoCodeFromRequest = req.params.code.toUpperCase();
    const firebaseUid = req.user.uid; // نحصل على هوية المستخدم من التوكن الذي تم التحقق منه

    try {
        // الخطوة 1: التحقق من وجود الكود وأنه فعال
        const promoResult = await pool.query(
            "SELECT code, type, value, is_active, expiry_date, max_uses, current_uses FROM promo_codes WHERE code = $1 AND is_active = TRUE",
            [promoCodeFromRequest]
        );

        if (promoResult.rows.length === 0) {
            return res.status(404).json({ message: "كود الخصم غير صالح أو منتهي الصلاحية." });
        }

        const promo = promoResult.rows[0];

        // يمكنك إضافة شروط التحقق من تاريخ الانتهاء وعدد الاستخدامات هنا إذا أردت
        if (promo.expiry_date && new Date(promo.expiry_date) < new Date()) {
            return res.status(400).json({ message: "هذا الكود منتهي الصلاحية." });
        }
        if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
            return res.status(400).json({ message: "تم الوصول للحد الأقصى لاستخدام هذا الكود." });
        }

        // الخطوة 2: التحقق مما إذا كان المستخدم قد استخدم هذا الكود من قبل
        const usageCheckResult = await pool.query(
            "SELECT 1 FROM promo_code_usage WHERE promo_code_used = $1 AND user_firebase_uid = $2",
            [promo.code, firebaseUid]
        );

        if (usageCheckResult.rows.length > 0) {
            // إذا وجدنا سجلًا، فهذا يعني أن المستخدم قد استخدم الكود بالفعل
            return res.status(409).json({ message: "لقد استخدمت هذا الكود بالفعل." }); // 409 Conflict
        }

        // إذا وصل الكود إلى هنا، فهو صالح ولم يستخدمه المستخدم من قبل
        res.json({
            code: promo.code,
            type: promo.type,
            value: promo.value
        });

    } catch (err) {
        console.error(`Error validating promo code ${promoCodeFromRequest} for user ${firebaseUid}:`, err.stack);
        next(new Error('حدث خطأ أثناء التحقق من كود الخصم.'));
    }
});
// =================================================================================
// === نهاية التعديل ===
// =================================================================================

module.exports = router;
