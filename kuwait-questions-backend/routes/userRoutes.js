// في routes/userRoutes.js (أو الملف الذي اخترته)
const express = require('express');
const pool    = require('../database/database'); // تأكد أن المسار صحيح
const router  = express.Router();

// (اختياري) Middleware للتحقق من Firebase Token إذا أردت حماية هذا المسار
// const { verifyFirebaseToken } = require('../middleware/authMiddleware'); // مثال

// POST /api/user/:firebaseUid/grant-free-games
router.post('/:firebaseUid/grant-free-games', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid } = req.params;
    const { promoCode, gamesToGrant, source } = req.body;

    // إذا كنت تستخدم middleware للمصادقة، يمكنك التحقق هنا:
    // if (req.user?.uid !== firebaseUid) {
    //     return res.status(403).json({ message: "Unauthorized action." });
    // }

    if (!promoCode || typeof gamesToGrant !== 'number' || gamesToGrant <= 0) {
        return res.status(400).json({ message: "بيانات منح الألعاب المجانية غير كاملة أو غير صالحة." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. تحقق من أن الكود الترويجي صالح ونوعه ألعاب مجانية وقيمته تتطابق
        const promoResult = await client.query(
            "SELECT type, value FROM promo_codes WHERE code = $1 AND is_active = TRUE AND type = 'free_games'",
            [promoCode.toUpperCase()]
        );

        if (promoResult.rows.length === 0 || promoResult.rows[0].value !== gamesToGrant) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "كود الألعاب المجانية المقدم غير صالح أو لا يتطابق مع العرض." });
        }

        // 2. قم بتحديث رصيد ألعاب المستخدم
        // تأكد أن اسم العمود games_balance صحيح في جدول users
        const updateUserBalanceSql = ` 
            UPDATE users
            SET games_balance = games_balance + $1, updated_at = CURRENT_TIMESTAMP
            WHERE firebase_uid = $2
            RETURNING games_balance;
        `;
        const updatedUser = await client.query(updateUserBalanceSql, [gamesToGrant, firebaseUid]);

        if (updatedUser.rowCount === 0) {
            await client.query('ROLLBACK');
            // هذا يعني أن المستخدم غير موجود في جدول 'users' الخاص بك.
            // يجب أن يتم إنشاء سجل المستخدم عند التسجيل الأولي.
            // إذا لم يحدث ذلك، فهذه مشكلة أخرى يجب معالجتها في مسار تسجيل المستخدم.
            console.error(`User with firebase_uid ${firebaseUid} not found in users table during grant-free-games.`);
            return res.status(404).json({ message: "المستخدم غير موجود في قاعدة البيانات لتحديث الرصيد." });
        }

        // 3. (مهم جدًا في تطبيق حقيقي) سجل أن هذا المستخدم قد استخدم هذا الكود الترويجي
        //    لمنعه من استخدامه مرة أخرى. هذا يتطلب جدولاً إضافيًا (مثلاً used_promo_codes)
        //    لتتبع (user_id, promo_code). سنتجاوز هذا للتبسيط الآن.

        // 4. (اختياري) إذا كان الكود الترويجي للاستخدام مرة واحدة فقط بشكل عام (وليس لكل مستخدم)
        //    يمكنك تعطيله هنا.
        //    await client.query("UPDATE promo_codes SET is_active = FALSE WHERE code = $1", [promoCode.toUpperCase()]);


        await client.query('COMMIT');
        res.json({
            message: `تم إضافة ${gamesToGrant} ألعاب مجانية بنجاح!`,
            newBalance: updatedUser.rows[0].games_balance,
            source: source || "Promo Code Redemption"
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error in /grant-free-games route for user:", firebaseUid, error);
        next(new Error("فشل في منح الألعاب المجانية. يرجى المحاولة مرة أخرى لاحقًا."));
    } finally {
        if (client) client.release();
    }
});

// (اختياري ولكن موصى به) أضف مسار جلب ملف المستخدم هنا أيضًا
// GET /api/user/:firebaseUid/profile
router.get('/:firebaseUid/profile', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid } = req.params;
    // if (req.user?.uid !== firebaseUid) {
    //     return res.status(403).json({ message: "Unauthorized." });
    // }
    try {
        const result = await pool.query(
            "SELECT firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance FROM users WHERE firebase_uid = $1",
            [firebaseUid]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User profile not found." });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching user profile:", error);
        next(new Error("Failed to fetch user profile."));
    }
});

// (مهم) أضف مسار تسجيل ملف المستخدم إذا لم يكن موجودًا بعد
// هذا المسار يتم استدعاؤه من main.js عند إنشاء حساب جديد
// POST /api/user/register-profile
router.post('/register-profile', /* verifyFirebaseToken, */ async (req, res, next) => {
    const { firebaseUid, email, displayName, firstName, lastName, phone, photoURL } = req.body;

    // if (req.user?.uid !== firebaseUid) { // تأكد أن المستخدم الذي يرسل الطلب هو نفسه
    //     return res.status(403).json({ message: "Unauthorized to register this profile." });
    // }

    if (!firebaseUid || !email) {
        return res.status(400).json({ message: "Firebase UID and Email are required." });
    }

    const insertSql = `
        INSERT INTO users (firebase_uid, email, display_name, first_name, last_name, phone, photo_url, games_balance)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (firebase_uid) DO NOTHING 
        RETURNING *; 
    `; // ON CONFLICT لتجنب الخطأ إذا تم استدعاؤه مرتين بالخطأ
       // games_balance يتم تعيينه إلى 5 كقيمة ابتدائية، يمكنك تغييرها
    const params = [
        firebaseUid,
        email,
        displayName || null,
        firstName || null,
        lastName || null,
        phone || null,
        photoURL || null,
        5 // رصيد ألعاب ابتدائي عند التسجيل
    ];

    try {
        const result = await pool.query(insertSql, params);
        if (result.rows.length > 0) {
            res.status(201).json(result.rows[0]);
        } else {
            // قد يعني هذا أن المستخدم موجود بالفعل ولم يتم فعل شيء بسبب ON CONFLICT
            // يمكنك جلب بيانات المستخدم الموجود وإرجاعها
            const existingUser = await pool.query("SELECT * FROM users WHERE firebase_uid = $1", [firebaseUid]);
            if (existingUser.rows.length > 0) {
                res.status(200).json(existingUser.rows[0]);
            } else {
                // هذا لا يجب أن يحدث إذا كان ON CONFLICT يعمل بشكل صحيح
                res.status(409).json({ message: "Profile already exists or failed to retrieve after conflict." });
            }
        }
    } catch (error) {
        console.error("Error registering user profile in backend:", error);
        next(new Error("Failed to register user profile."));
    }
});


module.exports = router;