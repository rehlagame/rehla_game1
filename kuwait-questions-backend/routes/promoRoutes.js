// routes/promoRoutes.js

const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();

// دالة مساعدة لتحويل body إلى boolean
function parseBool(val) {
    const s = String(val).toLowerCase();
    return (s === 'true' || s === '1' || s === 'on');
}

// ===== GET /api/promos =====
// جلب جميع أكواد الخصم، وإرجاعها تحت المفتاح promoCodes
router.get('/', async (req, res, next) => {
    const sql = `
        SELECT code, type, value, description, is_active
        FROM promo_codes
        ORDER BY code
    `;
    try {
        const result = await pool.query(sql);
        // نحتفظ بـ is_active كـ 0 أو 1 ليتوافق مع شروط الواجهة
        const promoCodes = result.rows.map(row => ({
            code:        row.code,
            type:        row.type,
            value:       row.value,
            description: row.description,
            is_active:   row.is_active  // integer 0 أو 1
        }));
        res.json({ promoCodes });
    } catch (err) {
        console.error('Error fetching promo codes:', err.stack);
        next(new Error('Database error fetching promo codes. Details: ' + err.message));
    }
});

// ===== POST /api/promos =====
// إضافة كود خصم جديد
router.post('/', async (req, res, next) => {
    console.log('--- ADD PROMO CODE ---', req.body);
    let { code, type, value, description, is_active } = req.body;

    // تحقق بسيط من الحقول
    if (!code || !type || value == null) {
        return res.status(400).json({ message: 'Missing required fields: code, type, value.' });
    }
    if (!['percentage','free_games'].includes(type)) {
        return res.status(400).json({ message: "Invalid type. Must be 'percentage' or 'free_games'." });
    }

    const codeUpper     = code.trim().toUpperCase();
    const valInt        = parseInt(value, 10);
    const activeFlag    = parseBool(is_active) ? 1 : 0;

    if (isNaN(valInt) || valInt <= 0 || (type==='percentage' && valInt>100)) {
        return res.status(400).json({ message: 'Invalid value for discount.' });
    }

    const sql = `
    INSERT INTO promo_codes
      (code, type, value, description, is_active)
    VALUES
      ($1, $2, $3, $4, $5)
    RETURNING code, type, value, description, is_active
  `;
    const params = [codeUpper, type, valInt, description || null, activeFlag];

    try {
        const result = await pool.query(sql, params);
        // نعيد الكود المُنشأ والـ status حتى يتمكن الواجهة من عرض رسالة نجاح صحيحة
        return res.status(201).json({
            message: 'Promo code created successfully.',
            code:    result.rows[0].code,
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
// تفعيل/تعطيل كود الخصم
router.put('/:code/status', async (req, res, next) => {
    const codeUpper  = req.params.code.toUpperCase();
    const activeFlag = parseBool(req.body.is_active) ? 1 : 0;

    const sql = `
    UPDATE promo_codes
      SET is_active = $1
    WHERE code = $2
    RETURNING code, type, value, description, is_active
  `;
    try {
        const result = await pool.query(sql, [activeFlag, codeUpper]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: `Promo code '${codeUpper}' not found.` });
        }
        res.json({
            message: `Promo code '${codeUpper}' ${activeFlag ? 'activated' : 'deactivated'}.`,
            promo:   result.rows[0]
        });
    } catch (err) {
        console.error(`Error updating promo code status for ${codeUpper}:`, err.stack);
        next(new Error('Database error updating promo code status. Details: ' + err.message));
    }
});

// ===== DELETE /api/promos/:code =====
// حذف كود خصم
router.delete('/:code', async (req, res, next) => {
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

module.exports = router;
