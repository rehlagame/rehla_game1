// routes/promoRoutes.js

const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();
const { verifyFirebaseToken } = require('../middleware/authMiddleware');

function parseBool(val) {
    const s = String(val).toLowerCase();
    return (s === 'true' || s === '1' || s === 'on');
}

// ===== GET /api/promos =====
// جلب جميع أكواد الخصم
router.get('/', async (req, res, next) => {
    // هذا الاستعلام سليم ويجلب جميع الأعمدة اللازمة
    const sql = `
        SELECT code, type, value, description, is_active, expiry_date, max_uses, current_uses
        FROM promo_codes
        ORDER BY code
    `;
    try {
        const result = await pool.query(sql);
        res.json({ promoCodes: result.rows });
    } catch (err) {
        console.error('Error fetching promo codes:', err.stack);
        next(new Error('Database error fetching promo codes. Details: ' + err.message));
    }
});

// ===== POST /api/promos =====
// إضافة كود خصم جديد
router.post('/', async (req, res, next) => {
    let { code, type, value, description, expiry_date, max_uses } = req.body;

    if (!code || !type || value == null) {
        return res.status(400).json({ message: 'Missing required fields: code, type, value.' });
    }
    if (!['percentage','free_games'].includes(type)) {
        return res.status(400).json({ message: "Invalid type. Must be 'percentage' or 'free_games'." });
    }

    const codeUpper     = code.trim().toUpperCase();
    const valInt        = parseInt(value, 10);
    // current_uses يبدأ دائمًا من 0 عند الإنشاء، لا نحتاج لأخذه من الطلب
    const maxUsesInt    = (max_uses !== undefined && max_uses !== null) ? parseInt(max_uses, 10) : 0;

    if (isNaN(valInt) || valInt <= 0 || (type === 'percentage' && valInt > 100)) {
        return res.status(400).json({ message: 'Invalid value for discount.' });
    }
    if (isNaN(maxUsesInt) || maxUsesInt < 0) {
        return res.status(400).json({ message: 'Invalid value for max uses.' });
    }
    
    // ================== بداية التصحيح: إضافة current_uses إلى جملة INSERT ==================
    const sql = `
        INSERT INTO promo_codes
            (code, type, value, description, is_active, expiry_date, max_uses, current_uses)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `;
    // تم إضافة 0 كقيمة لـ current_uses
    const params = [codeUpper, type, valInt, description || null, true, expiry_date || null, maxUsesInt > 0 ? maxUsesInt : null, 0];
    // ================== نهاية التصحيح ==================

    try {
        const result = await pool.query(sql, params);
        return res.status(201).json({
            message: 'Promo code created successfully.',
            promo:   result.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ message: `Promo code '${codeUpper}' already exists.` });
        }
        console.error('Error inserting promo code:', err.stack);
        next(new Error('Database error creating promo code. Details: ' + err.message));
    }
});

// ===== PUT /api/promos/:code/status =====
router.put('/:code/status', async (req, res, next) => {
    const codeUpper  = req.params.code.toUpperCase();
    const activeBool = parseBool(req.body.is_active);

    const sql = `UPDATE promo_codes SET is_active = $1 WHERE code = $2 RETURNING *`;
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
    const codeUpper = req.params.code.toUpperCase();
    try {
        const result = await pool.query(`DELETE FROM promo_codes WHERE code = $1 RETURNING code`, [codeUpper]);
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
router.get('/validate/:code', verifyFirebaseToken, async (req, res, next) => {
    const promoCodeFromRequest = req.params.code.toUpperCase();
    const firebaseUid = req.user.uid;

    try {
        const promoResult = await pool.query(
            "SELECT * FROM promo_codes WHERE code = $1 AND is_active = TRUE",
            [promoCodeFromRequest]
        );
        if (promoResult.rows.length === 0) {
            return res.status(404).json({ message: "كود الخصم غير صالح أو منتهي الصلاحية." });
        }
        const promo = promoResult.rows[0];

        if (promo.expiry_date && new Date(promo.expiry_date) < new Date()) {
            return res.status(400).json({ message: "هذا الكود منتهي الصلاحية." });
        }
        if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
            return res.status(400).json({ message: "تم الوصول للحد الأقصى لاستخدام هذا الكود." });
        }

        const usageCheckResult = await pool.query(
            "SELECT 1 FROM promo_code_usage WHERE promo_code_used = $1 AND user_firebase_uid = $2",
            [promo.code, firebaseUid]
        );
        if (usageCheckResult.rows.length > 0) {
            return res.status(409).json({ message: "لقد استخدمت هذا الكود بالفعل." });
        }

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

module.exports = router;
