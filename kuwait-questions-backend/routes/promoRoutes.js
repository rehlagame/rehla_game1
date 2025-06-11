// routes/promoRoutes.js
const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();
const { verifyFirebaseToken } = require('../middleware/authMiddleware');

function parseBool(val) {
    const s = String(val).toLowerCase();
    return (s === 'true' || s === '1' || s === 'on');
}

router.get('/', async (req, res, next) => {
    try {
        const result = await pool.query("SELECT * FROM promo_codes ORDER BY created_at DESC");
        res.json({ promoCodes: result.rows });
    } catch (err) {
        next(err);
    }
});

router.post('/', async (req, res, next) => {
    let { code, type, value, description, is_active } = req.body;
    if (!code || !type || value == null) {
        return res.status(400).json({ message: 'Missing required fields: code, type, value.' });
    }
    const activeBool = (is_active === undefined) ? true : parseBool(is_active);
    try {
        const result = await pool.query(
            `INSERT INTO promo_codes (code, type, value, description, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [code.trim().toUpperCase(), type, parseInt(value, 10), description, activeBool]
        );
        res.status(201).json({ message: 'Promo code created successfully.', promo: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: `Promo code '${code.trim().toUpperCase()}' already exists.` });
        next(err);
    }
});

router.put('/:code/status', async (req, res, next) => {
    const codeUpper  = req.params.code.toUpperCase();
    const activeBool = parseBool(req.body.is_active);
    try {
        const result = await pool.query("UPDATE promo_codes SET is_active = $1 WHERE code = $2 RETURNING *", [activeBool, codeUpper]);
        if (result.rowCount === 0) return res.status(404).json({ message: `Promo code '${codeUpper}' not found.` });
        res.json({ message: `Promo code '${codeUpper}' status updated.`, promo: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

router.delete('/:code', async (req, res, next) => {
    const codeUpper = req.params.code.toUpperCase();
    try {
        const result = await pool.query("DELETE FROM promo_codes WHERE code = $1 RETURNING code", [codeUpper]);
        if (result.rowCount === 0) return res.status(404).json({ message: `Promo code '${codeUpper}' not found.` });
        res.json({ message: `Promo code '${codeUpper}' deleted successfully.` });
    } catch (err) {
        next(err);
    }
});

router.get('/validate/:code', verifyFirebaseToken, async (req, res, next) => {
    const promoCodeFromRequest = req.params.code.toUpperCase();
    try {
        const result = await pool.query("SELECT * FROM promo_codes WHERE code = $1 AND is_active = TRUE", [promoCodeFromRequest]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "كود الخصم غير صالح أو منتهي الصلاحية." });
        }
        const promo = result.rows[0];
        if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
            return res.status(403).json({ message: "عفواً، لقد تم استخدام هذا الكود لأقصى عدد من المرات." });
        }
        res.json({ code: promo.code, type: promo.type, value: promo.value });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
