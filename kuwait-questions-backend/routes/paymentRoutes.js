// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const axios = require('axios'); // عميل HTTP لإجراء استدعاءات API
const { v4: uuidv4 } = require('uuid'); // لإنشاء معرفات فريدة
const crypto = require('crypto'); // للتحقق من توقيع الـ webhook

// --- إعدادات Tap Payments (يتم تحميلها من ملف .env) ---
const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY;
const TAP_PUBLISHABLE_KEY = process.env.TAP_PUBLISHABLE_KEY; // قد يكون ضروريًا لبعض عمليات الدمج في الواجهة الأمامية
const TAP_API_BASE_URL = process.env.TAP_API_BASE_URL || 'https://api.tap.company/v2'; // مثال، تحقق من الوثائق الرسمية
const TAP_WEBHOOK_SIGNATURE_KEY = process.env.TAP_WEBHOOK_SIGNATURE_KEY; // مفتاح سري للتحقق من الـ webhooks

const APP_FRONTEND_URL = process.env.APP_FRONTEND_URL || 'https://rehlagame.com';

if (!TAP_SECRET_KEY || !TAP_WEBHOOK_SIGNATURE_KEY) {
    console.error("خطأ فادح: مفتاح Tap Payments السري أو مفتاح توقيع الـ Webhook غير مهيأ في متغيرات البيئة!");
    // في سيناريو حقيقي، قد تمنع التطبيق من البدء أو تعطل ميزات الدفع.
    // حاليًا، سنسجل الخطأ ونستمر، ولكن من المحتمل أن تفشل عمليات الدفع أو تكون غير آمنة.
}

// ===== POST /api/payment/initiate-tap-payment =====
// مسار بدء عملية الدفع مع Tap Payments
router.post('/initiate-tap-payment', verifyFirebaseToken, async (req, res, next) => {
    const { amount, currency, packageName, gamesInPackage, customerName, customerEmail, appliedPromoCode } = req.body;
    const firebaseUid = req.user.uid;
    // تأكد من أن localInvoiceId فريد ويمكن استخدامه لاسترداد المعاملة
    const localInvoiceId = `REHLA-TAP-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    console.log(`[API /initiate-tap-payment] طلب لـ UID: ${firebaseUid}`, { localInvoiceId, ...req.body });

    if (!amount || amount <= 0 || !currency) {
        return res.status(400).json({ message: 'مبلغ الدفع أو العملة غير صالحين.' });
    }
    if (!packageName || typeof gamesInPackage !== 'number' || gamesInPackage <= 0) {
        return res.status(400).json({ message: 'تفاصيل الباقة غير صالحة.' });
    }
    if (!TAP_SECRET_KEY) {
        console.error("[API /initiate-tap-payment] مفتاح Tap السري غير مهيأ. لا يمكن المتابعة.");
        return res.status(500).json({ message: "خطأ في تهيئة بوابة الدفع." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // بدء معاملة قاعدة البيانات

        // تسجيل محاولة الدفع في جدول payment_logs
        const paymentLogQuery = `
            INSERT INTO payment_logs
                (user_firebase_uid, local_invoice_id, amount, currency, package_name, games_in_package, promo_code_used, status, gateway_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', 'TapPayments')
            RETURNING id;
        `;
        const paymentLogValues = [firebaseUid, localInvoiceId, amount, currency, packageName, gamesInPackage, appliedPromoCode || null];
        const paymentLogResult = await client.query(paymentLogQuery, paymentLogValues);
        const dbLogId = paymentLogResult.rows[0].id; // معرّف السجل في قاعدة البيانات

        // --- إعداد طلب API لإنشاء شحنة/معاملة مع Tap Payments ---
        // هذا الـ payload هو مثال. ارجع إلى وثائق Tap Payments "Charges API" أو "Tokens API".
        // قد تنشئ شحنة مباشرة أو تقوم بترميز تفاصيل البطاقة أولاً.
        // إذا كنت تنشئ شحنة مباشرة تعيد توجيه المستخدم، فهذا أبسط.
        const tapPayload = {
            amount: parseFloat(amount), // Tap عادةً تتوقع المبلغ بالوحدة الرئيسية للعملة
            currency: currency,
            threeDSecure: true, // موصى به
            save_card: false,   // أو true إذا كنت تريد السماح للمستخدمين بحفظ بطاقاتهم
            description: `لعبة رحلة - ${packageName}`,
            statement_descriptor: "RehlaGame", // ما يظهر في كشف الحساب البنكي
            metadata: { // بيانات مخصصة تريد تتبعها
                local_invoice_id: localInvoiceId,
                db_log_id: dbLogId,
                firebase_uid: firebaseUid,
                package: packageName,
                games: gamesInPackage
            },
            receipt: {
                email: true, // إرسال إيصال بالبريد الإلكتروني للعميل
                sms: false   // إرسال رسالة نصية (قد تترتب عليها رسوم)
            },
            customer: {
                first_name: customerName ? customerName.split(' ')[0] : (req.user.name ? req.user.name.split(' ')[0] : 'رحلة'),
                last_name: customerName ? customerName.split(' ').slice(1).join(' ') : (req.user.name ? req.user.name.split(' ').slice(1).join(' ') : 'مستخدم'),
                email: customerEmail || req.user.email,
                // phone: { // اختياري، لكن جيد للإيصالات/الإشعارات
                // country_code: "965",
                // number: "00000000"
                // }
            },
            source: {
                id: "src_all" // هذا يعني عادةً "استخدم أي وسيلة دفع متاحة مفعلة في حساب Tap الخاص بك"
                              // أو "src_card" للبطاقات، "src_apple_pay"، "src_google_pay" إلخ.
                              // إذا كنت تستخدم صفحة الدفع المستضافة من Tap، فقد يكون هذا أبسط.
            },
            post: { // عنوان URL لإشعارات الخادم إلى الخادم (Webhook)
                url: `${process.env.BACKEND_URL}/api/payment/webhook/tap` // تأكد من تعيين BACKEND_URL
            },
            redirect: { // عنوان URL لإعادة توجيه المستخدم بعد محاولة الدفع
                url: `${APP_FRONTEND_URL}/payment-callback?localInvoiceId=${localInvoiceId}&dbLogId=${dbLogId}`
                // سيضيف Tap بارامترات الحالة الخاصة به إلى هذا العنوان
            }
        };

        const tapHeaders = {
            'Authorization': `Bearer ${TAP_SECRET_KEY}`,
            'Content-Type': 'application/json',
            // أضف أي ترويسات أخرى تتطلبها Tap، مثل 'lang_code' إذا لزم الأمر
        };

        const tapApiUrl = `${TAP_API_BASE_URL}/charges`; // أو نقطة النهاية الصحيحة لبدء الدفع

        console.log(`[API /initiate-tap-payment] إرسال إلى Tap Payments: ${tapApiUrl}`, JSON.stringify(tapPayload, null, 2));
        const tapGatewayResponse = await axios.post(tapApiUrl, tapPayload, { headers: tapHeaders });
        const tapData = tapGatewayResponse.data;
        console.log(`[API /initiate-tap-payment] استجابة Tap Payments الخام:`, JSON.stringify(tapData, null, 2));

        if (tapData && tapData.id && tapData.status && tapData.transaction && tapData.transaction.url) {
            // tapData.id هو عادةً معرف الشحنة (gateway_invoice_id)
            // tapData.transaction.url هو عنوان URL لإعادة توجيه المستخدم إليه
            const paymentURL = tapData.transaction.url;
            const gatewayChargeId = tapData.id;

            // تحديث سجل الدفع بمعرف الشحنة من البوابة وحالة Tap الأولية
            await client.query(
                'UPDATE payment_logs SET gateway_invoice_id = $1, gateway_response_initiation = $2, status = $3, updated_at = NOW() WHERE id = $4',
                [gatewayChargeId, tapData, tapData.status, dbLogId]
            );
            await client.query('COMMIT'); // تأكيد معاملة قاعدة البيانات
            console.log(`[API /initiate-tap-payment] تم بدء الدفع لـ localInvoiceId: ${localInvoiceId}, GatewayChargeId: ${gatewayChargeId}`);
            res.status(200).json({ paymentURL: paymentURL, localInvoiceId: localInvoiceId, gatewayChargeId: gatewayChargeId });
        } else {
            // إذا فشل بدء الدفع مع Tap
            const errorMessage = tapData.errors?.[0]?.description || tapData.response?.message || 'فشل في بدء عملية الدفع مع Tap Payments.';
            console.error('[API /initiate-tap-payment] خطأ من Tap Payments API:', errorMessage, tapData);
            await client.query(
                "UPDATE payment_logs SET status = 'ERROR_PRE_GATEWAY', gateway_response_initiation = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                [tapData, errorMessage, dbLogId]
            );
            await client.query('COMMIT'); // تأكيد المعاملة حتى في حالة الفشل لتسجيل الخطأ
            res.status(500).json({ message: errorMessage });
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK'); // تراجع عن المعاملة في حالة حدوث أي خطأ آخر
        console.error('[API /initiate-tap-payment] خطأ:', error.response ? JSON.stringify(error.response.data,null,2) : error.message, error.stack);
        // إذا كان خطأ axios، قد يحتوي error.response.data على معلومات مفيدة من Tap
        const tapErrorMessage = error.response?.data?.errors?.[0]?.description || error.response?.data?.response?.message || "خطأ في الخادم أثناء بدء عملية الدفع مع Tap.";
        next(new Error(tapErrorMessage));
    } finally {
        if (client) client.release(); // تحرير الاتصال بقاعدة البيانات
    }
});

// ===== GET /api/payment/payment-callback =====
// هذا هو `redirect.url` الذي تقدمه لـ Tap.
// سيعيد Tap توجيه المستخدم هنا ويضيف بارامترات مثل `tap_id` (charge_id).
router.get('/payment-callback', async (req, res) => {
    const { tap_id, localInvoiceId, dbLogId } = req.query; // Tap قد ترسل 'tap_id' أو 'charge_id'
    const gatewayChargeId = tap_id; // نفترض أن Tap ترسل 'tap_id' للشحنة

    console.log(`[API /payment-callback] تم استلام Callback من Tap:`, req.query);

    if (!dbLogId && !localInvoiceId) {
        console.warn("[API /payment-callback] الـ Callback يفتقد dbLogId أو localInvoiceId. لا يمكن تحديث السجل بشكل موثوق.");
        // إعادة التوجيه إلى صفحة فشل عامة إذا كانت المعرفات الأساسية مفقودة
        return res.redirect(`${APP_FRONTEND_URL}/payment-failure?reason=callback_param_missing`);
    }

    let effectiveDbLogId = dbLogId;
    let effectiveLocalInvoiceId = localInvoiceId;
    let paymentSucceededAccordingToTap = false; // سنتحقق من هذا بجلب حالة الشحنة

    const client = await pool.connect();
    try {
        // إذا كان localInvoiceId موجودًا فقط، حاول العثور على dbLogId
        if (!effectiveDbLogId && effectiveLocalInvoiceId) {
            const logRes = await client.query('SELECT id FROM payment_logs WHERE local_invoice_id = $1 ORDER BY created_at DESC LIMIT 1', [effectiveLocalInvoiceId]);
            if (logRes.rows.length > 0) {
                effectiveDbLogId = logRes.rows[0].id;
            } else {
                console.warn(`[API /payment-callback] لم يتم العثور على payment_log لـ localInvoiceId: ${effectiveLocalInvoiceId}`);
                return res.redirect(`${APP_FRONTEND_URL}/payment-failure?ref=${effectiveLocalInvoiceId}&reason=log_not_found_cb`);
            }
        }

        // --- مهم: تحقق من حالة المعاملة مع Tap API باستخدام gatewayChargeId ---
        // لا تثق بالبارامترات الموجودة في عنوان URL الخاص بإعادة التوجيه وحدها لنجاح الدفع.
        let finalStatusForLog = 'USER_RETURNED_UNKNOWN'; // حالة افتراضية للسجل
        if (gatewayChargeId && TAP_SECRET_KEY) {
            try {
                const tapRetrieveUrl = `${TAP_API_BASE_URL}/charges/${gatewayChargeId}`;
                const tapHeaders = { 'Authorization': `Bearer ${TAP_SECRET_KEY}` };
                console.log(`[API /payment-callback] التحقق من الشحنة ${gatewayChargeId} مع Tap.`);
                const chargeDetailsResponse = await axios.get(tapRetrieveUrl, { headers: tapHeaders });
                const chargeDetails = chargeDetailsResponse.data;
                console.log(`[API /payment-callback] تفاصيل شحنة Tap:`, JSON.stringify(chargeDetails, null, 2));

                // تحقق من حالة الشحنة من Tap (قد تكون 'CAPTURED', 'PAID', إلخ. لعملية ناجحة)
                if (chargeDetails && (chargeDetails.status === 'CAPTURED' || chargeDetails.status === 'PAID')) {
                    paymentSucceededAccordingToTap = true;
                    finalStatusForLog = 'USER_RETURNED_SUCCESS_VERIFIED'; // تم التحقق من النجاح
                } else {
                    finalStatusForLog = 'USER_RETURNED_FAILURE_VERIFIED'; // تم التحقق من الفشل
                }
                // تحديث السجل بالحالة التي تم التحقق منها
                if (effectiveDbLogId) {
                     await client.query(
                        "UPDATE payment_logs SET status = $1, gateway_payment_id_callback = $2, gateway_response_callback = $3, updated_at = NOW() WHERE id = $4 AND (status = 'PENDING' OR status LIKE 'USER_RETURNED%')",
                        [finalStatusForLog, gatewayChargeId, chargeDetails, effectiveDbLogId]
                    );
                }
            } catch (verifyError) {
                console.error(`[API /payment-callback] خطأ في التحقق من الشحنة ${gatewayChargeId} مع Tap:`, verifyError.response ? verifyError.response.data : verifyError.message);
                // استمر في إعادة التوجيه بناءً على إعادة التوجيه الأولية من Tap، ولكن سجل فشل التحقق
                finalStatusForLog = 'USER_RETURNED_VERIFY_FAILED';
                 if (effectiveDbLogId) {
                    await client.query(
                        "UPDATE payment_logs SET status = $1, gateway_payment_id_callback = $2, gateway_response_callback = $3, error_message = $4, updated_at = NOW() WHERE id = $5 AND (status = 'PENDING' OR status LIKE 'USER_RETURNED%')",
                        [finalStatusForLog, gatewayChargeId, req.query, `خطأ التحقق: ${verifyError.message}`, effectiveDbLogId]
                    );
                }
            }
        } else {
            // إذا لم يكن هناك gatewayChargeId أو مفتاح سري، يمكننا فقط الوثوق ببارامترات query الخاصة بإعادة التوجيه (أقل أمانًا)
            // هذا السيناريو يجب تجنبه في الإنتاج.
            console.warn("[API /payment-callback] لا يمكن التحقق من الشحنة مع Tap API بسبب فقدان معرف الشحنة أو المفتاح السري. الاعتماد على بارامترات إعادة التوجيه (أقل أمانًا).");
            // افترض حالة بناءً على بارامترات `req.query` (مثلاً، req.query.status) - هذا غير مثالي
            finalStatusForLog = req.query.status === 'CAPTURED' || req.query.status === 'PAID' ? 'USER_RETURNED_SUCCESS' : 'USER_RETURNED_FAILURE';
            paymentSucceededAccordingToTap = finalStatusForLog === 'USER_RETURNED_SUCCESS';

            if (effectiveDbLogId) {
                await client.query(
                    "UPDATE payment_logs SET status = $1, gateway_payment_id_callback = $2, gateway_response_callback = $3, updated_at = NOW() WHERE id = $4 AND (status = 'PENDING' OR status LIKE 'USER_RETURNED%')",
                    [finalStatusForLog, gatewayChargeId || null, req.query, effectiveDbLogId]
                );
            }
        }

        console.log(`[API /payment-callback] حالة السجل لـ dbLogId ${effectiveDbLogId} (محلي: ${effectiveLocalInvoiceId}) تعتبر: ${paymentSucceededAccordingToTap ? 'ناجحة' : 'فاشلة'}`);

        // إعادة توجيه المستخدم إلى صفحة النجاح/الفشل المناسبة في الواجهة الأمامية
        const redirectUrl = paymentSucceededAccordingToTap
            ? `${APP_FRONTEND_URL}/payment-success?ref=${effectiveLocalInvoiceId}&charge_id=${gatewayChargeId || ''}`
            : `${APP_FRONTEND_URL}/payment-failure?ref=${effectiveLocalInvoiceId}&charge_id=${gatewayChargeId || ''}&reason=payment_gateway_status`;
        res.redirect(redirectUrl);

    } catch (dbError) {
        console.error("[API /payment-callback] خطأ في قاعدة البيانات أثناء معالجة الـ Callback:", dbError);
        const redirectUrlOnError = `${APP_FRONTEND_URL}/payment-failure?ref=${effectiveLocalInvoiceId || 'unknown_cb_dberr'}&reason=internal_callback_error`;
        res.redirect(redirectUrlOnError);
    } finally {
        if (client) client.release();
    }
});

// ===== POST /api/payment/webhook/tap =====
// هذا هو `post.url` الذي تقدمه لـ Tap (خادم-إلى-خادم).
// هذا هو المكان الموثوق لتحديث رصيد الألعاب.
router.post('/webhook/tap', async (req, res, next) => {
    const webhookData = req.body;
    const tapSignature = req.headers['x-tap-signature']; // Tap تستخدم هذا الترويسة لتوقيع الـ webhook
    const tapTimestamp = req.headers['x-tap-timestamp']; // وهذا أيضًا

    console.log('[API Tap Webhook] تم الاستلام. الترويسات:', JSON.stringify(req.headers, null, 2) ,'\nالـ Body:', JSON.stringify(webhookData, null, 2));

    // --- التحقق من مفتاح توقيع الـ Webhook ---
    if (!TAP_WEBHOOK_SIGNATURE_KEY) {
        console.error("[API Tap Webhook] مفتاح توقيع Tap Webhook غير مهيأ. لا يمكن التحقق من الـ webhook. يتم الرفض.");
        return res.status(500).send('خطأ في تهيئة الـ Webhook.');
    }
    if (!tapSignature || !tapTimestamp) {
        console.warn('[API Tap Webhook] ترويسات توقيع Tap أو الطابع الزمني مفقودة.');
        return res.status(400).send('ترويسات التوقيع مفقودة.');
    }

    // --- التحقق من توقيع الـ Webhook (حاسم للأمان) ---
    try {
        const rawBody = JSON.stringify(webhookData); // Tap تتوقع جسم JSON الخام كسلسلة نصية
        const dataToSign = `${tapTimestamp}.${rawBody}`; // البيانات التي سيتم توقيعها
        const expectedSignature = crypto
            .createHmac('sha256', TAP_WEBHOOK_SIGNATURE_KEY)
            .update(dataToSign)
            .digest('hex');

        // استخدام `crypto.timingSafeEqual` لمقارنة التواقيع بأمان (يمنع هجمات التوقيت)
        if (!crypto.timingSafeEqual(Buffer.from(tapSignature), Buffer.from(expectedSignature))) {
            console.warn('[API Tap Webhook] توقيع غير صالح. المتوقع:', expectedSignature, 'المستلم:', tapSignature);
            return res.status(403).send('توقيع غير صالح.');
        }
        console.log('[API Tap Webhook] تم التحقق من التوقيع بنجاح.');
    } catch (sigError) {
        console.error('[API Tap Webhook] خطأ أثناء التحقق من التوقيع:', sigError);
        return res.status(500).send('خطأ في التحقق من التوقيع.');
    }
    // --- نهاية التحقق من توقيع الـ Webhook ---

    const gatewayChargeId = webhookData.id; // معرف شحنة Tap عادةً ما يكون في حقل `id` للـ webhook
    const gatewayChargeStatus = webhookData.status; // مثال: "CAPTURED", "DECLINED", "FAILED"

    let dbLogIdForUpdate;
    let firebaseUidForUpdate;
    let gamesToGrantFromLog;

    // استخراج المعرفات من `metadata` إذا أمكن، وإلا ابحث باستخدام `gatewayChargeId`
    if (webhookData.metadata && webhookData.metadata.db_log_id) {
        dbLogIdForUpdate = webhookData.metadata.db_log_id;
        firebaseUidForUpdate = webhookData.metadata.firebase_uid;
        gamesToGrantFromLog = webhookData.metadata.games; // نفترض أن 'games' تم تخزينها في metadata
    } else if (gatewayChargeId) {
        try {
            console.log(`[API Tap Webhook] البحث عن payment_log باستخدام gateway_invoice_id: ${gatewayChargeId}`);
            const logRes = await pool.query(
                'SELECT id, user_firebase_uid, games_in_package, status FROM payment_logs WHERE gateway_invoice_id = $1 ORDER BY created_at DESC LIMIT 1',
                [gatewayChargeId]
            );
            if (logRes.rows.length > 0) {
                dbLogIdForUpdate = logRes.rows[0].id;
                firebaseUidForUpdate = logRes.rows[0].user_firebase_uid;
                gamesToGrantFromLog = logRes.rows[0].games_in_package;
                console.log(`[API Tap Webhook] تم العثور على payment_log ID ${dbLogIdForUpdate} لـ gateway_invoice_id ${gatewayChargeId}. الحالة الحالية: ${logRes.rows[0].status}`);
            } else {
                 console.warn(`[API Tap Webhook] لم يتم العثور على payment_log لـ gateway_invoice_id: ${gatewayChargeId}. قد يكون هذا الـ webhook لمعاملة لم تبدأ عبر نظامنا أو تمت معالجتها/فشلت مبكرًا.`);
                 // الاستجابة بـ 200 لـ Tap حتى لا تعيد المحاولة، ولكن سجل هذه المشكلة.
                 return res.status(200).send('Webhook: لم يتم العثور على إدخال سجل لمعرف الشحنة هذا.');
            }
        } catch (lookupError) {
            console.error(`[API Tap Webhook] خطأ في البحث عن السجل باستخدام gatewayChargeId ${gatewayChargeId}:`, lookupError);
            return res.status(500).send('خطأ في معالجة الـ webhook (بحث السجل).');
        }
    }

    // التحقق من وجود المعرفات اللازمة
    if (!dbLogIdForUpdate || !firebaseUidForUpdate) {
        console.error('[API Tap Webhook] خطأ: تعذر تحديد dbLogId أو firebaseUid من بيانات الـ webhook للشحنة:', gatewayChargeId);
        return res.status(400).send('خطأ في الـ Webhook: معرف الشحنة/المستخدم مفقود أو غير صالح.');
    }
    // التحقق من أن عدد الألعاب المراد منحها صالح
    if (typeof gamesToGrantFromLog !== 'number' || gamesToGrantFromLog <= 0) {
         console.error(`[API Tap Webhook] games_in_package غير صالح (${gamesToGrantFromLog}) لـ dbLogId ${dbLogIdForUpdate}. معرف الشحنة: ${gatewayChargeId}`);
         // قد يتم تحديث الحالة إلى خطأ والاستجابة بـ 200 لـ Tap.
         // هذا يشير إلى مشكلة في كيفية إنشاء سجل الدفع.
         const clientErr = await pool.connect();
         try {
            await clientErr.query(
                "UPDATE payment_logs SET status = 'ERROR_INVALID_PACKAGE_WEBHOOK', gateway_response_webhook = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                [webhookData, `games_in_package غير صالح: ${gamesToGrantFromLog}`, dbLogIdForUpdate]
            );
         } catch(e) { console.error("خطأ في تسجيل خطأ الباقة غير الصالحة في الـ webhook:", e); }
         finally { if(clientErr) clientErr.release(); }
         return res.status(200).send('Webhook: تفاصيل الباقة غير صالحة في السجل.'); // الاستجابة بـ 200 للاعتراف، ولكن سجل الخطأ
    }

    const client = await pool.connect();
    try {
        // تحقق من حالات النجاح الخاصة بـ Tap (مثال: 'CAPTURED', 'PAID')
        if (gatewayChargeStatus === 'CAPTURED' || gatewayChargeStatus === 'PAID') {
            await client.query('BEGIN'); // بدء معاملة

            // قفل الصف في payment_logs لمنع التحديثات المتزامنة (Idempotency)
            const orderResult = await client.query(
                "SELECT status FROM payment_logs WHERE id = $1 FOR UPDATE",
                [dbLogIdForUpdate]
            );

            if (orderResult.rows.length === 0) {
                console.warn(`[API Tap Webhook] لم يتم العثور على طلب لـ dbLogId ${dbLogIdForUpdate} أثناء المعالجة النهائية.`);
                await client.query('ROLLBACK');
                return res.status(200).send('Webhook: لم يتم العثور على الطلب للمعالجة النهائية.'); // 200 لـ Tap
            }
            const currentLogStatus = orderResult.rows[0].status;

            // إذا كان الطلب قد اكتمل بالفعل، لا تفعل شيئًا
            if (currentLogStatus === 'COMPLETED') {
                console.warn(`[API Tap Webhook] الطلب ${dbLogIdForUpdate} (الشحنة: ${gatewayChargeId}) مكتمل بالفعل.`);
                await client.query('ROLLBACK');
                return res.status(200).send('Webhook: الطلب تمت معالجته بالفعل.');
            }

            // تحديث رصيد ألعاب المستخدم
            const updateUserBalanceSql = `
                UPDATE users SET games_balance = games_balance + $1, updated_at = NOW()
                WHERE firebase_uid = $2 RETURNING games_balance;
            `;
            const balanceUpdateResult = await client.query(updateUserBalanceSql, [gamesToGrantFromLog, firebaseUidForUpdate]);

            if (balanceUpdateResult.rowCount === 0) {
                console.error(`[API Tap Webhook] لم يتم العثور على المستخدم أو فشل تحديث الرصيد لـ UID ${firebaseUidForUpdate}. الشحنة: ${gatewayChargeId}`);
                // تحديث سجل الدفع بحالة خطأ
                await client.query(
                    "UPDATE payment_logs SET status = 'ERROR_USER_NOT_FOUND_WEBHOOK', gateway_response_webhook = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                    [webhookData, `المستخدم ${firebaseUidForUpdate} لم يتم العثور عليه لتحديث الرصيد.`, dbLogIdForUpdate]
                );
                await client.query('COMMIT'); // تأكيد حالة الخطأ في السجل
                return res.status(200).send('Webhook: فشل تحديث رصيد المستخدم (المستخدم غير موجود).'); // 200 لـ Tap
            }
            const newBalance = balanceUpdateResult.rows[0].games_balance;

            // تحديث سجل الدفع إلى 'COMPLETED'
            await client.query(
                "UPDATE payment_logs SET status = 'COMPLETED', gateway_payment_id_webhook = $1, gateway_response_webhook = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3",
                [gatewayChargeId, webhookData, dbLogIdForUpdate]
            );

            await client.query('COMMIT'); // تأكيد المعاملة بنجاح
            console.log(`[API Tap Webhook] تمت معالجة الدفع لـ dbLogId ${dbLogIdForUpdate} (الشحنة: ${gatewayChargeId}). رصيد المستخدم ${firebaseUidForUpdate} الآن ${newBalance}.`);
            res.status(200).send('تمت معالجة الـ Webhook بنجاح.');

        } else { // معالجة الحالات الأخرى مثل DECLINED, FAILED, CANCELED, إلخ.
            const failureStatus = `FAILED_GATEWAY_WEBHOOK_${gatewayChargeStatus.toUpperCase()}`;
            await client.query(
                "UPDATE payment_logs SET status = $1, gateway_payment_id_webhook = $2, gateway_response_webhook = $3, error_message = $4, updated_at = NOW() WHERE id = $5 AND status <> 'COMPLETED'",
                [failureStatus, gatewayChargeId, webhookData, `حالة بوابة Tap: ${gatewayChargeStatus}`, dbLogIdForUpdate]
            );
            console.log(`[API Tap Webhook] تم الإبلاغ عن الدفع لـ dbLogId ${dbLogIdForUpdate} (الشحنة: ${gatewayChargeId}) كغير ناجح بواسطة Tap: ${gatewayChargeStatus}`);
            res.status(200).send('تم استلام الـ Webhook، الدفع غير ناجح.');
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK'); // تراجع عن المعاملة في حالة الخطأ
        console.error(`[API Tap Webhook] خطأ في معالجة الـ webhook لـ dbLogId ${dbLogIdForUpdate} (الشحنة: ${gatewayChargeId}):`, error.stack);
        res.status(500).send('خطأ في الخادم أثناء معالجة الـ webhook.'); // خطأ داخلي، أرسل 500 حتى قد تعيد Tap المحاولة
    } finally {
        if (client) client.release(); // تحرير الاتصال
    }
});

module.exports = router;
