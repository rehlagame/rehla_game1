// routes/userRoutes.js
const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();
const { verifyFirebaseToken } = require('../middleware/authMiddleware'); // استيراد middleware المصادقة

// ===== POST /api/user/register-profile =====
// لا تغييرات هنا، يبقى كما هو.
router.post('/register-profile', async (req, res, next) => {
    const { firebaseUid, email, displayName, firstName, lastName, phone, photoURL } = req.body;
    console.log('[API /register-profile] Received payload for UID:', firebaseUid, req.body);

    if (!firebaseUid || !email) {
        return res.status(400).json({ message: "Firebase UID and Email are required for profile registration." });
    }

    const initialGamesBalance = 1;

    const insertSql = `
        INSERT INTO users (firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (firebase_uid) DO UPDATE 
        SET email = EXCLUDED.email, 
            display_name = EXCLUDED.display_name,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            phone = EXCLUDED.phone,
            photo_url = EXCLUDED.photo_url,
            updated_at = CURRENT_TIMESTAMP
        RETURNING firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance;
    `;
    const params = [
        firebaseUid, email, displayName || null, firstName || null, lastName || null,
        phone || null, photoURL || null, initialGamesBalance
    ];

    try {
        const result = await pool.query(insertSql, params);
        if (result.rows.length > 0) {
            console.log('[API /register-profile] User profile created/updated successfully for UID:', firebaseUid, result.rows[0]);
            res.status(201).json(result.rows[0]);
        } else {
            console.warn('[API /register-profile] Insert/Update did not return rows, attempting to fetch user for UID:', firebaseUid);
            const existingUser = await pool.query("SELECT firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance FROM users WHERE firebase_uid = $1", [firebaseUid]);
            if (existingUser.rows.length > 0) {
                res.status(200).json(existingUser.rows[0]);
            } else {
                console.error('[API /register-profile] CRITICAL: Failed to create or find user profile after insert attempt for UID:', firebaseUid);
                res.status(500).json({ message: "Failed to ensure user profile existence after registration attempt." });
            }
        }
    } catch (error) {
        console.error("[API /register-profile] Error during profile registration for UID:", firebaseUid, error.stack);
        next(new Error("Failed to register user profile due to a server error."));
    }
});

// ===== GET /api/user/:firebaseUid/profile =====
// لا تغييرات هنا، يبقى كما هو.
router.get('/:firebaseUid/profile', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    console.log(`[API /profile] Request to fetch profile for UID: ${firebaseUid}`);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "Forbidden: You are not authorized to access this profile." });
    }

    try {
        const result = await pool.query(
            "SELECT firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance FROM users WHERE firebase_uid = $1",
            [firebaseUid]
        );
        if (result.rows.length === 0) {
            console.warn(`[API /profile] User profile not found for UID: ${firebaseUid}`);
            return res.status(404).json({ message: "User profile not found." });
        }
        console.log(`[API /profile] Profile data found for UID: ${firebaseUid}`, result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error("[API /profile] Error fetching user profile for UID:", firebaseUid, error.stack);
        next(new Error("Failed to fetch user profile due to a server error."));
    }
});

// ===== PUT /api/user/:firebaseUid/profile =====
// لا تغييرات هنا، يبقى كما هو.
router.put('/:firebaseUid/profile', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { firstName, lastName, displayName, phone, photoURL } = req.body;
    console.log(`[API PUT /profile] Request to update profile for UID: ${firebaseUid}`, req.body);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "Forbidden: You are not authorized to update this profile." });
    }

    const fieldsToUpdate = [];
    const values = [];
    let paramIndex = 1;

    if (firstName !== undefined) { fieldsToUpdate.push(`first_name = $${paramIndex++}`); values.push(firstName); }
    if (lastName !== undefined) { fieldsToUpdate.push(`last_name = $${paramIndex++}`); values.push(lastName); }
    if (displayName !== undefined) { fieldsToUpdate.push(`display_name = $${paramIndex++}`); values.push(displayName); }
    if (phone !== undefined) { fieldsToUpdate.push(`phone = $${paramIndex++}`); values.push(phone); }
    if (photoURL !== undefined) { fieldsToUpdate.push(`photo_url = $${paramIndex++}`); values.push(photoURL); }

    if (fieldsToUpdate.length === 0) {
        return res.status(400).json({ message: "No fields provided for update." });
    }

    fieldsToUpdate.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(firebaseUid);

    const updateSql = `
        UPDATE users
        SET ${fieldsToUpdate.join(', ')}
        WHERE firebase_uid = $${paramIndex}
        RETURNING firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance;
    `;

    try {
        const result = await pool.query(updateSql, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User profile not found for update." });
        }
        console.log(`[API PUT /profile] Profile updated successfully for UID: ${firebaseUid}`);
        res.json(result.rows[0]);
    } catch (error) {
        console.error("[API PUT /profile] Error updating user profile for UID:", firebaseUid, error.stack);
        next(new Error("Failed to update user profile due to a server error."));
    }
});

// =================================================================================
// === بداية التعديل: تعديل مسار منح الألعاب المجانية ===
// =================================================================================
router.post('/:firebaseUid/grant-free-games', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { promoCode, gamesToGrant, source } = req.body;
    console.log(`[API /grant-free-games] Request for UID: ${firebaseUid}`, req.body);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "Forbidden: You are not authorized to perform this action for this user." });
    }

    if (!promoCode || typeof gamesToGrant !== 'number' || gamesToGrant <= 0) {
        return res.status(400).json({ message: "بيانات منح الألعاب المجانية غير كاملة أو غير صالحة." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // بدء المعاملة

        // 1. تحقق من صحة الكود وأنه لا يزال فعالاً
        const promoResult = await client.query(
            "SELECT type, value FROM promo_codes WHERE code = $1 AND is_active = TRUE AND type = 'free_games'",
            [promoCode.toUpperCase()]
        );

        if (promoResult.rows.length === 0 || promoResult.rows[0].value !== gamesToGrant) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "كود الألعاب المجانية المقدم غير صالح أو لا يتطابق مع العرض." });
        }
        
        // 2. تحقق مما إذا كان المستخدم قد استخدم هذا الكود من قبل
        const usageCheckResult = await client.query(
            "SELECT 1 FROM promo_code_usage WHERE promo_code_used = $1 AND user_firebase_uid = $2",
            [promoCode.toUpperCase(), firebaseUid]
        );

        if (usageCheckResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: "لقد استخدمت هذا الكود بالفعل." });
        }

        // 3. قم بتحديث رصيد المستخدم
        const updateUserBalanceSql = `
            UPDATE users
            SET games_balance = games_balance + $1, updated_at = CURRENT_TIMESTAMP
            WHERE firebase_uid = $2
            RETURNING games_balance;
        `;
        const updatedUser = await client.query(updateUserBalanceSql, [gamesToGrant, firebaseUid]);

        if (updatedUser.rowCount === 0) {
            await client.query('ROLLBACK');
            console.error(`[API /grant-free-games] User with firebase_uid ${firebaseUid} not found in users table.`);
            return res.status(404).json({ message: "المستخدم غير موجود في قاعدة البيانات لتحديث الرصيد." });
        }

        // 4. سجل استخدام الكود لمنع استخدامه مرة أخرى
        await client.query(
            "INSERT INTO promo_code_usage (promo_code_used, user_firebase_uid) VALUES ($1, $2)",
            [promoCode.toUpperCase(), firebaseUid]
        );
        console.log(`[API /grant-free-games] Logged usage for code ${promoCode.toUpperCase()} by user ${firebaseUid}`);

        await client.query('COMMIT'); // تأكيد جميع العمليات
        
        console.log(`[API /grant-free-games] Granted ${gamesToGrant} games to UID: ${firebaseUid}. New balance: ${updatedUser.rows[0].games_balance}`);
        res.json({
            message: `تم إضافة ${gamesToGrant} ألعاب مجانية بنجاح!`,
            newBalance: updatedUser.rows[0].games_balance,
            source: source || "Promo Code Redemption"
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK'); // تراجع عن العمليات في حالة حدوث أي خطأ
        
        // إذا كان الخطأ بسبب القيد الفريد (محاولة سريعة لاستخدام الكود مرتين)
        if (error.code === '23505') { 
            return res.status(409).json({ message: 'لقد استخدمت هذا الكود بالفعل.' });
        }
        
        console.error("[API /grant-free-games] Error for UID:", firebaseUid, error.stack);
        next(new Error("فشل في منح الألعاب المجانية. يرجى المحاولة مرة أخرى لاحقًا."));
    } finally {
        if (client) client.release();
    }
});
// =================================================================================
// === نهاية التعديل ===
// =================================================================================


// ===== POST /api/user/:firebaseUid/deduct-game =====
// لا تغييرات هنا، يبقى كما هو.
router.post('/:firebaseUid/deduct-game', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    console.log(`[API /deduct-game] Request to deduct game for UID: ${firebaseUid}`);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "Forbidden: You are not authorized to perform this action for this user." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            "SELECT games_balance FROM users WHERE firebase_uid = $1 FOR UPDATE",
            [firebaseUid]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "المستخدم غير موجود." });
        }

        const currentBalance = parseInt(userResult.rows[0].games_balance, 10);

        if (isNaN(currentBalance) || currentBalance <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "لا يوجد رصيد ألعاب كافٍ للخصم." });
        }

        const newBalance = currentBalance - 1;
        const updateResult = await client.query(
            "UPDATE users SET games_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = $2 RETURNING games_balance",
            [newBalance, firebaseUid]
        );

        await client.query('COMMIT');
        console.log(`[API /deduct-game] Game deducted for UID: ${firebaseUid}. Old: ${currentBalance}, New: ${newBalance}`);
        res.json({
            message: "تم خصم لعبة بنجاح من الخادم.",
            newBalance: updateResult.rows[0].games_balance,
            gamesDeducted: 1
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("[API /deduct-game] Error for UID:", firebaseUid, error.stack);
        next(new Error("فشل في خصم اللعبة من الخادم."));
    } finally {
        if (client) client.release();
    }
});

// ===== DELETE /api/user/:firebaseUid/delete-account =====
// لا تغييرات هنا، يبقى كما هو.
router.delete('/:firebaseUid/delete-account', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    console.log(`[API /delete-account] Request to delete account for UID: ${firebaseUid}`);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "Forbidden: You are not authorized to delete this account." });
    }

    try {
        const result = await pool.query("DELETE FROM users WHERE firebase_uid = $1 RETURNING firebase_uid", [firebaseUid]);
        if (result.rowCount === 0) {
            console.warn(`[API /delete-account] User not found for deletion, UID: ${firebaseUid}, but proceeding as success from client's perspective.`);
            return res.status(200).json({ message: "User data (if any) cleared from backend." });
        }
        console.log(`[API /delete-account] User data deleted successfully from backend for UID: ${firebaseUid}`);
        res.status(200).json({ message: "User data deleted successfully from backend." });
    } catch (error) {
        console.error("[API /delete-account] Error deleting user data for UID:", firebaseUid, error.stack);
        next(new Error("Failed to delete user data from backend."));
    }
});

module.exports = router;
