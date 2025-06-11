// routes/userRoutes.js
const express = require('express');
const pool    = require('../database/database');
const router  = express.Router();
const { verifyFirebaseToken } = require('../middleware/authMiddleware'); // استيراد middleware المصادقة

// ===== POST /api/user/register-profile =====
// يتم استدعاؤه عند إنشاء حساب مستخدم جديد في الواجهة الأمامية
// قد لا يتطلب verifyFirebaseToken هنا إذا كان firebaseUid يُرسل مباشرة بعد الإنشاء الأولي في Firebase Auth
// أو يمكن إضافته إذا كان التوكن متاحًا دائمًا.
router.post('/register-profile', async (req, res, next) => {
    const { firebaseUid, email, displayName, firstName, lastName, phone, photoURL } = req.body;
    console.log('[API /register-profile] تم استلام البيانات لـ UID:', firebaseUid, req.body);

    if (!firebaseUid || !email) {
        return res.status(400).json({ message: "معرف Firebase UID والبريد الإلكتروني مطلوبان لتسجيل الملف الشخصي." });
    }

    // رصيد ألعاب ابتدائي للمستخدمين الجدد
    const initialGamesBalance = 1;

    // استعلام SQL لإدراج مستخدم جديد أو تحديث مستخدم موجود بناءً على firebase_uid (لتجنب التكرار)
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
            // هذا السيناريو يجب ألا يحدث نظريًا مع ON CONFLICT ... DO UPDATE ... RETURNING
            console.warn('[API /register-profile] الإدراج/التحديث لم يُرجع صفوفًا، محاولة جلب المستخدم لـ UID:', firebaseUid);
            const existingUser = await pool.query("SELECT firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance FROM users WHERE firebase_uid = $1", [firebaseUid]);
            if (existingUser.rows.length > 0) {
                res.status(200).json(existingUser.rows[0]);
            } else {
                console.error('[API /register-profile] خطأ حرج: فشل في إنشاء أو العثور على ملف المستخدم بعد محاولة الإدراج لـ UID:', firebaseUid);
                res.status(500).json({ message: "فشل في ضمان وجود ملف المستخدم بعد محاولة التسجيل." });
            }
        }
    } catch (error) {
        console.error("[API /register-profile] خطأ أثناء تسجيل الملف الشخصي لـ UID:", firebaseUid, error.stack);
        next(new Error("فشل في تسجيل ملف المستخدم بسبب خطأ في الخادم."));
    }
});

// ===== GET /api/user/:firebaseUid/profile =====
// جلب بيانات الملف الشخصي للمستخدم
router.get('/:firebaseUid/profile', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params; // معرف المستخدم من بارامترات المسار
    console.log(`[API /profile] طلب لجلب الملف الشخصي لـ UID: ${firebaseUid}`);

    // التحقق من أن المستخدم المصادق عليه هو نفسه المستخدم المطلوب ملفه
    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بالوصول إلى هذا الملف الشخصي." });
    }

    try {
        const result = await pool.query(
            "SELECT firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance FROM users WHERE firebase_uid = $1",
            [firebaseUid]
        );
        // إذا لم يتم العثور على المستخدم
        if (result.rows.length === 0) {
            console.warn(`[API /profile] لم يتم العثور على ملف المستخدم لـ UID: ${firebaseUid}`);
            return res.status(404).json({ message: "لم يتم العثور على ملف المستخدم." });
        }
        console.log(`[API /profile] تم العثور على بيانات الملف الشخصي لـ UID: ${firebaseUid}`, result.rows[0]);
        res.json(result.rows[0]); // إرجاع بيانات المستخدم
    } catch (error) {
        console.error("[API /profile] خطأ في جلب ملف المستخدم لـ UID:", firebaseUid, error.stack);
        next(new Error("فشل في جلب ملف المستخدم بسبب خطأ في الخادم."));
    }
});

// ===== PUT /api/user/:firebaseUid/profile =====
// تحديث بيانات الملف الشخصي للمستخدم
router.put('/:firebaseUid/profile', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { firstName, lastName, displayName, phone, photoURL } = req.body; // البيانات المراد تحديثها
    console.log(`[API PUT /profile] طلب لتحديث الملف الشخصي لـ UID: ${firebaseUid}`, req.body);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بتحديث هذا الملف الشخصي." });
    }

    const fieldsToUpdate = []; // قائمة الحقول المراد تحديثها في استعلام SQL
    const values = []; // قيم هذه الحقول
    let paramIndex = 1; // عداد لبارامترات SQL ($1, $2, ...)

    // بناء استعلام التحديث ديناميكيًا بناءً على الحقول المتوفرة
    if (firstName !== undefined) { fieldsToUpdate.push(`first_name = $${paramIndex++}`); values.push(firstName); }
    if (lastName !== undefined) { fieldsToUpdate.push(`last_name = $${paramIndex++}`); values.push(lastName); }
    if (displayName !== undefined) { fieldsToUpdate.push(`display_name = $${paramIndex++}`); values.push(displayName); }
    if (phone !== undefined) { fieldsToUpdate.push(`phone = $${paramIndex++}`); values.push(phone); }
    if (photoURL !== undefined) { fieldsToUpdate.push(`photo_url = $${paramIndex++}`); values.push(photoURL); }

    // إذا لم يتم تقديم أي حقول للتحديث
    if (fieldsToUpdate.length === 0) {
        return res.status(400).json({ message: "لم يتم تقديم أي حقول للتحديث." });
    }

    fieldsToUpdate.push(`updated_at = CURRENT_TIMESTAMP`); // تحديث الطابع الزمني
    values.push(firebaseUid); // إضافة firebaseUid كآخر بارامتر للشرط WHERE

    const updateSql = `
        UPDATE users
        SET ${fieldsToUpdate.join(', ')}
        WHERE firebase_uid = $${paramIndex}
        RETURNING firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance;
    `;

    try {
        const result = await pool.query(updateSql, values);
        if (result.rows.length === 0) {
            // هذا يعني أن المستخدم لم يتم العثور عليه بالـ firebaseUid المحدد
            return res.status(404).json({ message: "لم يتم العثور على ملف المستخدم للتحديث." });
        }
        console.log(`[API PUT /profile] تم تحديث الملف الشخصي بنجاح لـ UID: ${firebaseUid}`);
        res.json(result.rows[0]); // إرجاع البيانات المحدثة
    } catch (error) {
        console.error("[API PUT /profile] خطأ في تحديث ملف المستخدم لـ UID:", firebaseUid, error.stack);
        next(new Error("فشل في تحديث ملف المستخدم بسبب خطأ في الخادم."));
    }
});

// ===== POST /api/user/:firebaseUid/grant-free-games =====
// مسار لمنح ألعاب مجانية للمستخدم بناءً على كود خصم
router.post('/:firebaseUid/grant-free-games', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params; // معرف المستخدم من Firebase
    const { promoCode, gamesToGrant, source } = req.body; // `source` يمكن أن يكون 'Promo Code Redemption' أو مصدر آخر
    console.log(`[API /grant-free-games] طلب لـ UID: ${firebaseUid}`, req.body);

    // التحقق من أن المستخدم المصادق عليه هو نفسه المستخدم المستهدف
    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بتنفيذ هذا الإجراء لهذا المستخدم." });
    }
    // التحقق من صحة البيانات المدخلة
    if (!promoCode || typeof gamesToGrant !== 'number' || gamesToGrant <= 0) {
        return res.status(400).json({ message: "بيانات منح الألعاب المجانية غير كاملة أو غير صالحة." });
    }

    const client = await pool.connect(); // الحصول على اتصال من pool قاعدة البيانات
    try {
        await client.query('BEGIN'); // بدء معاملة لضمان سلامة البيانات

        // --- التحقق من كود الخصم وتحديث استخدامه ---
        const promoResult = await client.query(
            // استعلام لجلب تفاصيل كود الخصم والتأكد من أنه فعال ومن النوع 'free_games'
            // `FOR UPDATE` يقوم بقفل الصف لمنع التحديثات المتزامنة
            `SELECT type, value, max_uses, current_uses
             FROM promo_codes
             WHERE code = $1 AND is_active = TRUE AND type = 'free_games' FOR UPDATE`,
            [promoCode.toUpperCase()] // تحويل الكود إلى حروف كبيرة للمقارنة
        );

        // إذا لم يتم العثور على كود الخصم أو لم يكن بالشروط المطلوبة
        if (promoResult.rows.length === 0) {
            await client.query('ROLLBACK'); // تراجع عن المعاملة
            return res.status(400).json({ message: "كود الألعاب المجانية المقدم غير صالح أو غير فعال." });
        }

        const promoDetails = promoResult.rows[0]; // تفاصيل كود الخصم
        // التحقق من أن قيمة الألعاب في الكود تطابق القيمة المطلوبة للمنح
        if (promoDetails.value !== gamesToGrant) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "قيمة الألعاب المجانية في الكود لا تتطابق مع الطلب." });
        }
        // التحقق مما إذا كان الكود قد وصل إلى الحد الأقصى للاستخدام
        if (promoDetails.max_uses !== null && promoDetails.current_uses >= promoDetails.max_uses) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "عفواً، لقد تم استخدام هذا الكود لأقصى عدد من المرات." });
        }

        // (اختياري) يمكنك هنا إضافة منطق لمنع نفس المستخدم من استخدام نفس الكود المجاني أكثر من مرة
        // يتطلب هذا عادةً جدولاً إضافيًا لتتبع `(user_firebase_uid, promo_code)`
        // مثال: const userUsage = await client.query("SELECT 1 FROM user_promo_usages WHERE user_uid = $1 AND promo_code = $2", [firebaseUid, promoCode.toUpperCase()]);
        // if (userUsage.rows.length > 0) { /* ... امنع الاستخدام ... */ }

        // تحديث رصيد ألعاب المستخدم
        const updateUserBalanceSql = `
            UPDATE users
            SET games_balance = games_balance + $1, updated_at = CURRENT_TIMESTAMP
            WHERE firebase_uid = $2
            RETURNING games_balance;
        `;
        const updatedUser = await client.query(updateUserBalanceSql, [gamesToGrant, firebaseUid]);

        // إذا لم يتم العثور على المستخدم في قاعدة البيانات
        if (updatedUser.rowCount === 0) {
            await client.query('ROLLBACK');
            console.error(`[API /grant-free-games] المستخدم ذو firebase_uid ${firebaseUid} غير موجود في جدول users.`);
            return res.status(404).json({ message: "المستخدم غير موجود." });
        }

        // زيادة عدد مرات استخدام كود الخصم
        await client.query(
            "UPDATE promo_codes SET current_uses = current_uses + 1 WHERE code = $1",
            [promoCode.toUpperCase()]
        );
        // --- نهاية التحقق من كود الخصم وتحديث استخدامه ---

        await client.query('COMMIT'); // تأكيد المعاملة بنجاح
        console.log(`[API /grant-free-games] تم منح ${gamesToGrant} ألعاب لـ UID: ${firebaseUid} عبر الكود ${promoCode}. الرصيد الجديد: ${updatedUser.rows[0].games_balance}`);
        res.json({
            message: `تم إضافة ${gamesToGrant} ألعاب مجانية بنجاح!`,
            newBalance: updatedUser.rows[0].games_balance,
            source: source || `كود خصم: ${promoCode}` // مصدر منح الألعاب
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK'); // تراجع عن المعاملة في حالة حدوث خطأ
        console.error("[API /grant-free-games] خطأ لـ UID:", firebaseUid, error.stack);
        next(new Error("فشل في منح الألعاب المجانية."));
    } finally {
        if (client) client.release(); // تحرير الاتصال بقاعدة البيانات
    }
});


// ===== POST /api/user/:firebaseUid/deduct-game =====
// خصم لعبة واحدة من رصيد المستخدم عند بدء اللعبة
router.post('/:firebaseUid/deduct-game', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    console.log(`[API /deduct-game] طلب لخصم لعبة لـ UID: ${firebaseUid}`);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بتنفيذ هذا الإجراء لهذا المستخدم." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // بدء معاملة

        // جلب الرصيد الحالي للمستخدم مع قفل الصف (FOR UPDATE) لمنع مشاكل التزامن
        const userResult = await client.query(
            "SELECT games_balance FROM users WHERE firebase_uid = $1 FOR UPDATE",
            [firebaseUid]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "المستخدم غير موجود." });
        }

        const currentBalance = parseInt(userResult.rows[0].games_balance, 10);

        // التحقق من أن الرصيد كافٍ
        if (isNaN(currentBalance) || currentBalance <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "لا يوجد رصيد ألعاب كافٍ للخصم." });
        }

        const newBalance = currentBalance - 1; // حساب الرصيد الجديد
        // تحديث رصيد المستخدم في قاعدة البيانات
        const updateResult = await client.query(
            "UPDATE users SET games_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = $2 RETURNING games_balance",
            [newBalance, firebaseUid]
        );

        await client.query('COMMIT'); // تأكيد المعاملة
        console.log(`[API /deduct-game] تم خصم لعبة لـ UID: ${firebaseUid}. القديم: ${currentBalance}, الجديد: ${newBalance}`);
        res.json({
            message: "تم خصم لعبة بنجاح من الخادم.",
            newBalance: updateResult.rows[0].games_balance,
            gamesDeducted: 1
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("[API /deduct-game] خطأ لـ UID:", firebaseUid, error.stack);
        next(new Error("فشل في خصم اللعبة من الخادم."));
    } finally {
        if (client) client.release();
    }
});

// ===== DELETE /api/user/:firebaseUid/delete-account =====
// حذف حساب المستخدم وبياناته من قاعدة البيانات
router.delete('/:firebaseUid/delete-account', verifyFirebaseToken, async (req, res, next) => {
    const { firebaseUid } = req.params;
    console.log(`[API /delete-account] طلب لحذف الحساب لـ UID: ${firebaseUid}`);

    if (req.user.uid !== firebaseUid) {
        return res.status(403).json({ message: "ممنوع: غير مصرح لك بحذف هذا الحساب." });
    }

    try {
        // في بيئة الإنتاج، قد ترغب في استخدام "soft delete" (وضع علامة على أنه محذوف بدلاً من الحذف الفعلي)،
        // أو حذف البيانات المرتبطة في جداول أخرى ضمن معاملة.
        // حاليًا، سيقوم `ON DELETE CASCADE` في جدول `payment_logs` بحذف السجلات المرتبطة تلقائيًا.
        const result = await pool.query("DELETE FROM users WHERE firebase_uid = $1 RETURNING firebase_uid", [firebaseUid]);
        if (result.rowCount === 0) {
            // إذا لم يتم العثور على المستخدم، لا يزال يعتبر نجاحًا من منظور العميل لأنه لا يوجد شيء لحذفه
            console.warn(`[API /delete-account] لم يتم العثور على المستخدم للحذف، UID: ${firebaseUid}، ولكن سيتم التعامل معها كنجاح من منظور العميل.`);
            return res.status(200).json({ message: "تم مسح بيانات المستخدم (إن وجدت) من الواجهة الخلفية." });
        }
        console.log(`[API /delete-account] تم حذف بيانات المستخدم بنجاح من الواجهة الخلفية لـ UID: ${firebaseUid}`);
        res.status(200).json({ message: "تم حذف بيانات المستخدم بنجاح من الواجهة الخلفية." });
    } catch (error) {
        console.error("[API /delete-account] خطأ في حذف بيانات المستخدم لـ UID:", firebaseUid, error.stack);
        next(new Error("فشل في حذف بيانات المستخدم من الواجهة الخلفية."));
    }
});

module.exports = router;
