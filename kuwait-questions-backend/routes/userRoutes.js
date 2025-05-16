// routes/userRoutes.js
const express = require('express');
const pool    = require('../database/database'); // تأكد أن المسار إلى ملف قاعدة البيانات صحيح
const router  = express.Router();

// (اختياري ولكن موصى به) Middleware للتحقق من Firebase Token
// const { verifyFirebaseToken } = require('../middleware/authMiddleware'); // قم بإنشاء هذا الملف إذا أردت حماية المسارات

// ===== POST /api/user/register-profile =====
// يتم استدعاؤه عند إنشاء حساب مستخدم جديد في الواجهة الأمامية
router.post('/register-profile', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid, email, displayName, firstName, lastName, phone, photoURL } = req.body;
    console.log('[API /register-profile] Received payload for UID:', firebaseUid, req.body);

    // (اختياري) إذا كنت تستخدم middleware للتحقق من التوكن، يمكنك التحقق هنا
    // if (req.user?.uid !== firebaseUid) {
    //     return res.status(403).json({ message: "Unauthorized to register this profile." });
    // }

    if (!firebaseUid || !email) {
        return res.status(400).json({ message: "Firebase UID and Email are required for profile registration." });
    }

    const initialGamesBalance = 5; // رصيد ألعاب ابتدائي عند التسجيل (يمكنك تغييره)

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
            -- لا تقم بتحديث games_balance هنا عند التعارض، إلا إذا كان هذا مقصودًا
        RETURNING firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance;
    `;
    // ON CONFLICT (firebase_uid) DO UPDATE ... : هذا سيقوم بتحديث بيانات المستخدم إذا كان موجودًا بالفعل،
    // بدلاً من مجرد DO NOTHING. هذا قد يكون مفيدًا إذا تغيرت بيانات المستخدم في Firebase.
    // إذا كنت تفضل عدم التحديث عند التعارض، استخدم DO NOTHING.

    const params = [
        firebaseUid,
        email,
        displayName || null,
        firstName || null,
        lastName || null,
        phone || null,
        photoURL || null,
        initialGamesBalance
    ];

    try {
        const result = await pool.query(insertSql, params);
        if (result.rows.length > 0) {
            console.log('[API /register-profile] User profile created/updated successfully for UID:', firebaseUid, result.rows[0]);
            res.status(201).json(result.rows[0]);
        } else {
            // هذه الحالة يجب ألا تحدث مع RETURNING * و ON CONFLICT ... DO UPDATE/NOTHING
            // ولكن كإجراء احتياطي، حاول جلب المستخدم
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
// لجلب بيانات ملف المستخدم (بما في ذلك رصيد الألعاب)
router.get('/:firebaseUid/profile', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid } = req.params;
    console.log(`[API /profile] Request to fetch profile for UID: ${firebaseUid}`);

    // if (req.user?.uid !== firebaseUid) {
    //     return res.status(403).json({ message: "Unauthorized to access this profile." });
    // }

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
// لتحديث بيانات ملف المستخدم (مثل الاسم، الهاتف، صورة الملف الشخصي)
router.put('/:firebaseUid/profile', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { firstName, lastName, displayName, phone, photoURL } = req.body; // تأكد من أن الواجهة الأمامية ترسل photo_url وليس photoURL
    console.log(`[API PUT /profile] Request to update profile for UID: ${firebaseUid}`, req.body);

    // if (req.user?.uid !== firebaseUid) {
    //     return res.status(403).json({ message: "Unauthorized to update this profile." });
    // }

    // بناء جملة SQL ديناميكيًا لتحديث الحقول المقدمة فقط
    const fieldsToUpdate = [];
    const values = [];
    let paramIndex = 1;

    if (firstName !== undefined) { fieldsToUpdate.push(`first_name = $${paramIndex++}`); values.push(firstName); }
    if (lastName !== undefined) { fieldsToUpdate.push(`last_name = $${paramIndex++}`); values.push(lastName); }
    if (displayName !== undefined) { fieldsToUpdate.push(`display_name = $${paramIndex++}`); values.push(displayName); }
    if (phone !== undefined) { fieldsToUpdate.push(`phone = $${paramIndex++}`); values.push(phone); }
    if (photoURL !== undefined) { fieldsToUpdate.push(`photo_url = $${paramIndex++}`); values.push(photoURL); } // الخادم يتوقع photo_url

    if (fieldsToUpdate.length === 0) {
        return res.status(400).json({ message: "No fields provided for update." });
    }

    fieldsToUpdate.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(firebaseUid); // آخر قيمة لـ WHERE clause

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


// ===== POST /api/user/:firebaseUid/grant-free-games =====
// لمنح ألعاب مجانية للمستخدم (عادةً من خلال كود خصم)
router.post('/:firebaseUid/grant-free-games', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { promoCode, gamesToGrant, source } = req.body;
    console.log(`[API /grant-free-games] Request for UID: ${firebaseUid}`, req.body);

    // if (req.user?.uid !== firebaseUid) {
    //     return res.status(403).json({ message: "Unauthorized action." });
    // }

    if (!promoCode || typeof gamesToGrant !== 'number' || gamesToGrant <= 0) {
        return res.status(400).json({ message: "بيانات منح الألعاب المجانية غير كاملة أو غير صالحة." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const promoResult = await client.query(
            "SELECT type, value FROM promo_codes WHERE code = $1 AND is_active = TRUE AND type = 'free_games'",
            [promoCode.toUpperCase()]
        );

        if (promoResult.rows.length === 0 || promoResult.rows[0].value !== gamesToGrant) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "كود الألعاب المجانية المقدم غير صالح أو لا يتطابق مع العرض." });
        }

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

        // (مهم) يجب إضافة منطق لمنع استخدام نفس الكود المجاني عدة مرات هنا

        await client.query('COMMIT');
        console.log(`[API /grant-free-games] Granted ${gamesToGrant} games to UID: ${firebaseUid}. New balance: ${updatedUser.rows[0].games_balance}`);
        res.json({
            message: `تم إضافة ${gamesToGrant} ألعاب مجانية بنجاح!`,
            newBalance: updatedUser.rows[0].games_balance,
            source: source || "Promo Code Redemption"
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("[API /grant-free-games] Error for UID:", firebaseUid, error.stack);
        next(new Error("فشل في منح الألعاب المجانية. يرجى المحاولة مرة أخرى لاحقًا."));
    } finally {
        if (client) client.release();
    }
});


// ===== POST /api/user/:firebaseUid/deduct-game =====
// هذا هو المسار الجديد لخصم لعبة واحدة عند بدء اللعب
router.post('/:firebaseUid/deduct-game', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid } = req.params;
    console.log(`[API /deduct-game] Request to deduct game for UID: ${firebaseUid}`);

    // if (req.user?.uid !== firebaseUid) {
    //     return res.status(403).json({ message: "Unauthorized action." });
    // }

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


// (اختياري) مسار لحذف حساب المستخدم من قاعدة البيانات (يتم استدعاؤه من main.js)
router.delete('/:firebaseUid/delete-account', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid } = req.params;
    console.log(`[API /delete-account] Request to delete account for UID: ${firebaseUid}`);

    // if (req.user?.uid !== firebaseUid) {
    //     return res.status(403).json({ message: "Unauthorized to delete this account." });
    // }

    try {
        // يمكنك هنا حذف أي بيانات مرتبطة بالمستخدم من جداول أخرى إذا لزم الأمر
        // قبل حذف المستخدم نفسه، باستخدام معاملات (transactions).

        const result = await pool.query("DELETE FROM users WHERE firebase_uid = $1 RETURNING firebase_uid", [firebaseUid]);
        if (result.rowCount === 0) {
            // حتى لو لم يتم العثور على المستخدم، اعتبرها عملية "ناجحة" من وجهة نظر الحذف
            // لأن الهدف هو ألا يكون المستخدم موجودًا.
            console.warn(`[API /delete-account] User not found for deletion, UID: ${firebaseUid}, but proceeding as success.`);
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
