const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();
const { verifyFirebaseToken } = require('../middleware/authMiddleware');

function parseBool(val) {
    const s = String(val || '').toLowerCase();
    return (s === 'true' || s === '1' || s === 'on');
}

// ===== GET /api/promos =====
router.get('/', async (req, res, next) => {
    const sql = `
        SELECT code, type, value, description, is_active, created_at
        FROM promo_codes
        ORDER BY code
    `;
    try {
        const result = await pool.query(sql);
        res.json({ promoCodes: result.rows });
    } catch (err) {
        console.error('Error fetching promo codes:', err.stack);
        next(err);
    }
});

// ===== POST /api/promos =====
router.post('/', async (req, res, next) => {
    let { code, type, value, description } = req.body;

    if (!code || !type || value == null) {
        return res.status(400).json({ message: 'Missing required fields: code, type, value.' });
    }

    const codeUpper = code.trim().toUpperCase();
    const valInt = parseInt(value, 10);

    if (isNaN(valInt) || valInt <= 0) {
        return res.status(400).json({ message: 'Invalid value for discount.' });
    }

    const sql = `
        INSERT INTO promo_codes (code, type, value, description, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
    `;
    const params = [
        codeUpper,
        type,
        valInt,
        description || null,
        true
    ];

    try {
        const result = await pool.query(sql, params);
        res.status(201).json({
            message: 'Promo code created successfully.',
            promo: result.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ message: `Promo code '${codeUpper}' already exists.` });
        }
        console.error('Error inserting promo code:', err.stack);
        next(err);
    }
});

// ===== PUT /api/promos/:code/status =====
router.put('/:code/status', async (req, res, next) => {
    const codeUpper = req.params.code.toUpperCase();
    const activeBool = parseBool(req.body.is_active);
    try {
        const result = await pool.query(`UPDATE promo_codes SET is_active = $1 WHERE code = $2 RETURNING *`, [activeBool, codeUpper]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: `Promo code '${codeUpper}' not found.` });
        }
        res.json({
            message: `Promo code '${codeUpper}' ${activeBool ? 'activated' : 'deactivated'}.`,
            promo: result.rows[0]
        });
    } catch (err) {
        console.error(`Error updating promo code status for ${codeUpper}:`, err.stack);
        next(err);
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
        next(err);
    }
});

// ===== GET /api/promos/validate/:code =====
router.get('/validate/:code', verifyFirebaseToken, async (req, res, next) => {
    const promoCodeFromRequest = req.params.code.toUpperCase();
    const firebaseUid = req.user.uid;

    try {
        const promoResult = await pool.query(
            "SELECT code, type, value, is_active, created_at FROM promo_codes WHERE code = $1 AND is_active = TRUE",
            [promoCodeFromRequest]
        );
        if (promoResult.rows.length === 0) {
            return res.status(404).json({ message: "كود الخصم غير صالح أو منتهي الصلاحية." });
        }
        const promo = promoResult.rows[0];

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
        next(err);
    }
});

module.exports = router;
