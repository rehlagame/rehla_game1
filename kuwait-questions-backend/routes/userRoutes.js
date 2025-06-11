// routes/userRoutes.js
const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();
const { verifyFirebaseToken } = require('../middleware/authMiddleware');

// ... (جميع المسارات الأخرى تبقى كما هي)
router.post('/register-profile', async (req, res, next) => { /* ... */ });
router.get('/:firebaseUid/profile', verifyFirebaseToken, async (req, res, next) => { /* ... */ });
router.put('/:firebaseUid/profile', verifyFirebaseToken, async (req, res, next) => { /* ... */ });
router.post('/:firebaseUid/deduct-game', verifyFirebaseToken, async (req, res, next) => { /* ... */ });
router.delete('/:firebaseUid/delete-account', verifyFirebaseToken, async (req, res, next) => { /* ... */ });

// ===== POST /api/user/:firebaseUid/grant-free-games (الإصلاح الرئيسي هنا) =====
router.post('/:firebaseUid/grant-free-games', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { promoCode, gamesToGrant, source } = req.body;

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "Forbidden: You are not authorized to perform this action for this user." });
    }
    if (!promoCode || typeof promoCode !== 'string' || promoCode.trim() === '') {
        return res.status(400).json({ message: "Promo code is required and must be a valid string." });
    }
    if (typeof gamesToGrant !== 'number' || !Number.isInteger(gamesToGrant) || gamesToGrant <= 0) {
        return res.status(400).json({ message: "The number of games to grant is invalid." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const upperCasePromoCode = promoCode.toUpperCase();

        const promoResult = await client.query(
            `SELECT type, value FROM promo_codes WHERE code = $1 AND is_active = TRUE AND type = 'free_games' FOR UPDATE`,
            [upperCasePromoCode]
        );

        if (promoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "The provided free games promo code is invalid or inactive." });
        }

        const promoDetails = promoResult.rows[0];
        if (promoDetails.value !== gamesToGrant) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "The number of games to grant does not match the promo code's value." });
        }

        const updateUserBalanceSql = `UPDATE users SET games_balance = games_balance + $1 WHERE firebase_uid = $2 RETURNING games_balance;`;
        const updatedUser = await client.query(updateUserBalanceSql, [gamesToGrant, firebaseUid]);

        if (updatedUser.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "User not found." });
        }

        await client.query("UPDATE promo_codes SET current_uses = current_uses + 1 WHERE code = $1", [upperCasePromoCode]);
        await client.query('COMMIT');
        
        res.json({
            message: `Successfully added ${gamesToGrant} free games!`,
            newBalance: updatedUser.rows[0].games_balance
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error); // Pass the error to the global error handler
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
