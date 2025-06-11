// routes/userRoutes.js
const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();
const { verifyFirebaseToken } = require('../middleware/authMiddleware'); // استيراد middleware المصادقة

// ===== POST /api/user/register-profile =====
// ... (هذا الجزء سليم ولا يحتاج تعديل)
router.post('/register-profile', async (req, res, next) => {
    const { firebaseUid, email, displayName, firstName, lastName, phone, photoURL } = req.body;
    console.log('[API /register-profile] تم استلام البيانات لـ UID:', firebaseUid, req.body);
    if (!firebaseUid || !email) {
        return res.status(400).json({ message: "معرف Firebase UID والبريد الإلكتروني مطلوبان لتسجيل الملف الشخصي." });
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
            console.log('[API /register-profile] تم إنشاء/تحديث ملف المستخدم بنجاح لـ UID:', firebaseUid, result.rows[0]);
            res.status(201).json(result.rows[0]);
        } else {
            console.warn('[API /register-profile] الإدراج/التحديث لم يُرجع صفوفًا، محاولة جلب المستخدم لـ UID:', firebaseUid);
            const existingUser = await pool.query("SELECT * FROM users WHERE firebase_uid = $1", [firebaseUid]);
            if (existingUser.rows.length > 0) {
                res.status(200).json(existingUser.rows[0]);
            } else {
                res.status(500).json({ message: "فشل في ضمان وجود ملف المستخدم بعد محاولة التسجيل." });
            }
        }
    } catch (error) {
        console.error("[API /register-profile] خطأ أثناء تسجيل الملف الشخصي لـ UID:", firebaseUid, error.stack);
        next(new Error("فشل في تسجيل ملف المستخدم بسبب خطأ في الخادم."));
    }
});

// ===== GET /api/user/:firebaseUid/profile =====
// ... (هذا الجزء سليم ولا يحتاج تعديل)
router.get('/:firebaseUid/profile', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بالوصول إلى هذا الملف الشخصي." });
    }
    try {
        const result = await pool.query("SELECT * FROM users WHERE firebase_uid = $1", [firebaseUid]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "لم يتم العثور على ملف المستخدم." });
        }
        res.json(result.rows[0]);
    } catch (error) {
        next(new Error("فشل في جلب ملف المستخدم بسبب خطأ في الخادم."));
    }
});

// ===== PUT /api/user/:firebaseUid/profile =====
// ... (هذا الجزء سليم ولا يحتاج تعديل)
router.put('/:firebaseUid/profile', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { firstName, lastName, displayName, phone, photoURL } = req.body;
    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بتحديث هذا الملف الشخصي." });
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
        return res.status(400).json({ message: "لم يتم تقديم أي حقول للتحديث." });
    }
    fieldsToUpdate.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(firebaseUid);
    const updateSql = `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE firebase_uid = $${paramIndex} RETURNING *;`;
    try {
        const result = await pool.query(updateSql, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "لم يتم العثور على ملف المستخدم للتحديث." });
        }
        res.json(result.rows[0]);
    } catch (error) {
        next(new Error("فشل في تحديث ملف المستخدم بسبب خطأ في الخادم."));
    }
});


// ===== POST /api/user/:firebaseUid/grant-free-games =====
// مسار لمنح ألعاب مجانية للمستخدم بناءً على كود خصم
router.post('/:firebaseUid/grant-free-games', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { promoCode, gamesToGrant, source } = req.body;
    console.log(`[API /grant-free-games] طلب لـ UID: ${firebaseUid}`, req.body);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بتنفيذ هذا الإجراء لهذا المستخدم." });
    }
    
    // --- تعديل وتحصين: التحقق من المدخلات بشكل أفضل ---
    if (!promoCode || typeof promoCode !== 'string' || promoCode.trim() === '') {
        return res.status(400).json({ message: "كود الخصم مطلوب ويجب أن يكون نصاً صالحاً." });
    }
    if (typeof gamesToGrant !== 'number' || !Number.isInteger(gamesToGrant) || gamesToGrant <= 0) {
        return res.status(400).json({ message: "عدد الألعاب المراد منحها غير صالح." });
    }
    // --- نهاية التعديل ---

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const upperCasePromoCode = promoCode.toUpperCase(); // استخدام متغير لتجنب التكرار
        const promoResult = await client.query(
            `SELECT type, value, max_uses, current_uses
             FROM promo_codes
             WHERE code = $1 AND is_active = TRUE AND type = 'free_games' FOR UPDATE`,
            [upperCasePromoCode]
        );

        if (promoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "كود الألعاب المجانية المقدم غير صالح أو غير فعال." });
        }

        const promoDetails = promoResult.rows[0];
        if (promoDetails.value !== gamesToGrant) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "قيمة الألعاب المجانية في الكود لا تتطابق مع الطلب." });
        }
        if (promoDetails.max_uses !== null && promoDetails.current_uses >= promoDetails.max_uses) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "عفواً، لقد تم استخدام هذا الكود لأقصى عدد من المرات." });
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
            return res.status(404).json({ message: "المستخدم غير موجود." });
        }

        await client.query(
            "UPDATE promo_codes SET current_uses = current_uses + 1 WHERE code = $1",
            [upperCasePromoCode]
        );

        await client.query('COMMIT');
        
        console.log(`[API /grant-free-games] تم منح ${gamesToGrant} ألعاب لـ UID: ${firebaseUid} عبر الكود ${promoCode}. الرصيد الجديد: ${updatedUser.rows[0].games_balance}`);
        res.json({
            message: `تم إضافة ${gamesToGrant} ألعاب مجانية بنجاح!`,
            newBalance: updatedUser.rows[0].games_balance,
            source: source || `كود خصم: ${promoCode}`
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("[API /grant-free-games] خطأ لـ UID:", firebaseUid, error.stack);
        // إرجاع رسالة الخطأ الفعلية للمطور في بيئة التطوير
        const errorMessage = process.env.NODE_ENV === 'production' 
            ? "فشل في منح الألعاب المجانية." 
            : `فشل في منح الألعاب المجانية: ${error.message}`;
        next(new Error(errorMessage));
    } finally {
        if (client) client.release();
    }
});


// ===== POST /api/user/:firebaseUid/deduct-game =====
// ... (هذا الجزء سليم ولا يحتاج تعديل)
router.post('/:firebaseUid/deduct-game', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بتنفيذ هذا الإجراء لهذا المستخدم." });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userResult = await client.query("SELECT games_balance FROM users WHERE firebase_uid = $1 FOR UPDATE", [firebaseUid]);
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
        const updateResult = await client.query("UPDATE users SET games_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = $2 RETURNING games_balance", [newBalance, firebaseUid]);
        await client.query('COMMIT');
        res.json({ message: "تم خصم لعبة بنجاح من الخادم.", newBalance: updateResult.rows[0].games_balance, gamesDeducted: 1 });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(new Error("فشل في خصم اللعبة من الخادم."));
    } finally {
        if (client) client.release();
    }
});


// ===== DELETE /api/user/:firebaseUid/delete-account =====
// ... (هذا الجزء سليم ولا يحتاج تعديل)
router.delete('/:firebaseUid/delete-account', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بحذف هذا الحساب." });
    }
    try {
        const result = await pool.query("DELETE FROM users WHERE firebase_uid = $1 RETURNING firebase_uid", [firebaseUid]);
        if (result.rowCount === 0) {
            return res.status(200).json({ message: "تم مسح بيانات المستخدم (إن وجدت) من الواجهة الخلفية." });
        }
        res.status(200).json({ message: "تم حذف بيانات المستخدم بنجاح من الواجهة الخلفية." });
    } catch (error) {
        next(new Error("فشل في حذف بيانات المستخدم من الواجهة الخلفية."));
    }
});

module.exports = router;
