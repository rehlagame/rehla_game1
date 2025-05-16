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
        const promoCodes = result.rows.map(row => ({
            code:        row.code,
            type:        row.type,
            value:       row.value,
            description: row.description,
            // PostgreSQL BOOLEAN type is returned as true/false by node-postgres driver
            // admin.html is already handling this correctly by checking promo.is_active === 1 || promo.is_active === true
            is_active:   row.is_active
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

    if (!code || !type || value == null) {
        return res.status(400).json({ message: 'Missing required fields: code, type, value.' });
    }
    if (!['percentage','free_games'].includes(type)) {
        return res.status(400).json({ message: "Invalid type. Must be 'percentage' or 'free_games'." });
    }

    const codeUpper     = code.trim().toUpperCase();
    const valInt        = parseInt(value, 10);
    // Convert boolean from request to boolean for DB (PostgreSQL BOOLEAN type)
    const activeBool    = parseBool(is_active);

    if (isNaN(valInt) || valInt <= 0 || (type === 'percentage' && valInt > 100)) {
        return res.status(400).json({ message: 'Invalid value for discount.' });
    }

    const sql = `
    INSERT INTO promo_codes
      (code, type, value, description, is_active)
    VALUES
      ($1, $2, $3, $4, $5)
    RETURNING code, type, value, description, is_active
  `;
    const params = [codeUpper, type, valInt, description || null, activeBool];

    try {
        const result = await pool.query(sql, params);
        return res.status(201).json({
            message: 'Promo code created successfully.',
            code:    result.rows[0].code,
            promo:   result.rows[0] // is_active will be true/false from DB
        });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
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
    // Convert boolean from request to boolean for DB
    const activeBool = parseBool(req.body.is_active);

    const sql = `
    UPDATE promo_codes
      SET is_active = $1
    WHERE code = $2
    RETURNING code, type, value, description, is_active
  `;
    try {
        const result = await pool.query(sql, [activeBool, codeUpper]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: `Promo code '${codeUpper}' not found.` });
        }
        res.json({
            message: `Promo code '${codeUpper}' ${activeBool ? 'activated' : 'deactivated'}.`,
            promo:   result.rows[0] // is_active will be true/false from DB
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


// ===== GET /api/promos/validate/:code =====
// للتحقق من صحة كود الخصم وإرجاع تفاصيله
// هذا المسار يستخدم من الواجهة الأمامية للعبة للتحقق من الكود قبل عملية الشراء
router.get('/validate/:code', async (req, res, next) => {
    const promoCodeFromRequest = req.params.code.toUpperCase();

    // يمكنك إضافة middleware هنا للتحقق من Firebase token إذا أردت أن يكون هذا المسار محميًا
    // const user = req.user; // (يتطلب middleware مصادقة)

    try {
        // استعلام للبحث عن الكود والتأكد من أنه فعال
        const result = await pool.query(
            "SELECT code, type, value, is_active FROM promo_codes WHERE code = $1 AND is_active = TRUE",
            [promoCodeFromRequest]
        );

        if (result.rows.length === 0) {
            // إذا لم يتم العثور على الكود أو لم يكن فعالاً
            return res.status(404).json({ message: "كود الخصم غير صالح أو منتهي الصلاحية." });
        }

        const promo = result.rows[0];

        // (اختياري) يمكنك هنا إضافة منطق إضافي:
        // - التحقق مما إذا كان المستخدم قد استخدم هذا الكود من قبل (يتطلب جدول لتتبع استخدامات الأكواد).
        // - التحقق مما إذا كان الكود قد وصل إلى الحد الأقصى المسموح به للاستخدام (يتطلب أعمدة إضافية في جدول promo_codes).

        // إذا تم العثور على الكود وهو فعال، أرجع بياناته
        // الواجهة الأمامية (main.js) تتوقع هذا التنسيق
        res.json({
            code: promo.code,
            type: promo.type,
            value: promo.value
            // لا نرجع is_active هنا لأنه تم التحقق منه بالفعل (is_active = TRUE)
            // أرجع فقط البيانات التي تحتاجها الواجهة الأمامية لاتخاذ قرار
        });

    } catch (err) {
        console.error(`Error validating promo code ${promoCodeFromRequest}:`, err.stack);
        // أرسل رسالة خطأ عامة للعميل في حالة حدوث خطأ في قاعدة البيانات
        next(new Error('حدث خطأ أثناء التحقق من كود الخصم.'));
    }
});


module.exports = router;
