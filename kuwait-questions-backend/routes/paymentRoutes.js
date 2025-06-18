// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// --- إعدادات Tap Payments (يتم تحميلها من ملف .env) ---
const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY_TEST; // استخدم مفتاح الاختبار هنا
const TAP_API_BASE_URL = process.env.TAP_API_BASE_URL || 'https://api.tap.company/v2';
const TAP_WEBHOOK_SIGNATURE_KEY = process.env.TAP_WEBHOOK_SIGNATURE_KEY_TEST; // !! مهم جدًا: استبدل هذا بمفتاح توقيع الـ Webhook الاختباري الفعلي من لوحة تحكم Tap !!

const APP_FRONTEND_URL = process.env.APP_FRONTEND_URL || 'https://rehlagame.com';
const BACKEND_URL_FOR_WEBHOOKS = process.env.BACKEND_URL; // يجب أن يكون عنوان URL للخادم المتاح للعامة (مثل Render أو ngrok)

// التحقق من المفاتيح الأساسية عند بدء التشغيل
if (!TAP_SECRET_KEY) {
    console.error("خطأ فادح: TAP_SECRET_KEY_TEST غير مهيأ في متغيرات البيئة!");
}
if (!TAP_WEBHOOK_SIGNATURE_KEY) {
    console.warn("تحذير: TAP_WEBHOOK_SIGNATURE_KEY_TEST غير مهيأ. التحقق من الـ Webhook سيفشل أو سيكون غير آمن. الرجاء إضافته من لوحة تحكم Tap.");
}
if (!BACKEND_URL_FOR_WEBHOOKS) {
    console.warn("تحذير: BACKEND_URL غير مهيأ. عنوان URL للـ Webhook قد يكون غير صحيح.");
}


// ===== POST /api/payment/initiate-tap-payment =====
// مسار بدء عملية الدفع مع Tap Payments
router.post('/initiate-tap-payment', verifyFirebaseToken, async (req, res, next) => {
    const { amount, currency, packageName, gamesInPackage, customerName, customerEmail, appliedPromoCode } = req.body;
    const firebaseUid = req.user.uid;
    const localInvoiceId = `REHLA-TAP-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    console.log(`[API /initiate-tap-payment] Request for UID: ${firebaseUid}`, { localInvoiceId, ...req.body });

    if (!amount || parseFloat(amount) <= 0 || !currency) {
        return res.status(400).json({ message: 'مبلغ الدفع أو العملة غير صالحين.' });
    }
    if (!packageName || typeof gamesInPackage !== 'number' || gamesInPackage <= 0) {
        return res.status(400).json({ message: 'تفاصيل الباقة غير صالحة.' });
    }
    if (!TAP_SECRET_KEY) {
        console.error("[API /initiate-tap-payment] مفتاح Tap السري الاختباري غير مهيأ. لا يمكن المتابعة.");
        return res.status(500).json({ message: "خطأ في تهيئة بوابة الدفع." });
    }
    if (!BACKEND_URL_FOR_WEBHOOKS) {
        console.error("[API /initiate-tap-payment] BACKEND_URL غير مهيأ. لا يمكن إنشاء رابط Webhook صحيح.");
        return res.status(500).json({ message: "خطأ في تهيئة الخادم (عنوان Webhook)." });
    }


    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const paymentLogQuery = `
            INSERT INTO payment_logs
                (user_firebase_uid, local_invoice_id, amount, currency, package_name, games_in_package, promo_code_used, status, gateway_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING_GATEWAY_INIT', 'TapPayments')
            RETURNING id;
        `;
        const paymentLogValues = [firebaseUid, localInvoiceId, parseFloat(amount), currency, packageName, gamesInPackage, appliedPromoCode || null];
        const paymentLogResult = await client.query(paymentLogQuery, paymentLogValues);
        const dbLogId = paymentLogResult.rows[0].id;

        const tapPayload = {
            amount: parseFloat(amount),
            currency: currency,
            threeDSecure: true,
            save_card: false,
            description: `لعبة رحلة - ${packageName}`,
            statement_descriptor: "RehlaGame",
            metadata: {
                local_invoice_id: localInvoiceId,
                db_log_id: dbLogId.toString(), // تأكد من أنه سلسلة نصية إذا كان Tap يتوقع ذلك
                firebase_uid: firebaseUid,
                package: packageName,
                games: gamesInPackage.toString() // تأكد من أنه سلسلة نصية
            },
            receipt: {
                email: !!customerEmail, // أرسل فقط إذا كان البريد الإلكتروني موجودًا
                sms: false
            },
            customer: {
                first_name: customerName ? customerName.split(' ')[0] : (req.user.name ? req.user.name.split(' ')[0] : 'رحلة'),
                //  Tap تتطلب first_name. إذا كان فارغًا، قدم قيمة افتراضية.
                email: customerEmail || req.user.email,
                // يمكنك إضافة المزيد من تفاصيل العميل إذا لزم الأمر ومتاحة
            },
            source: {
                id: "src_all" // للسماح بجميع وسائل الدفع المتاحة (KNET, Cards)
            },
            post: { // عنوان URL لإشعارات الخادم إلى الخادم (Webhook)
                url: `${BACKEND_URL_FOR_WEBHOOKS}/api/payment/webhook/tap`
            },
            redirect: { // عنوان URL لإعادة توجيه المستخدم بعد محاولة الدفع
                // سنوجهه إلى مسار الـ callback الخاص بنا في الواجهة الخلفية أولاً
                url: `${BACKEND_URL_FOR_WEBHOOKS}/api/payment/payment-callback?localInvoiceId=${localInvoiceId}&dbLogId=${dbLogId}`
            }
        };

        const tapHeaders = {
            'Authorization': `Bearer ${TAP_SECRET_KEY}`,
            'Content-Type': 'application/json',
            'lang_code': 'ar' // تحديد اللغة العربية لواجهة Tap إذا أمكن
        };

        const tapApiUrl = `${TAP_API_BASE_URL}/charges`;

        console.log(`[API /initiate-tap-payment] إرسال إلى Tap Payments: ${tapApiUrl}. الحمولة:`, JSON.stringify(tapPayload, null, 2));
        const tapGatewayResponse = await axios.post(tapApiUrl, tapPayload, { headers: tapHeaders });
        const tapData = tapGatewayResponse.data;
        console.log(`[API /initiate-tap-payment] استجابة Tap Payments:`, JSON.stringify(tapData, null, 2));

        if (tapData && tapData.id && tapData.transaction && tapData.transaction.url) {
            const paymentURL = tapData.transaction.url;
            const gatewayChargeId = tapData.id;

            await client.query(
                'UPDATE payment_logs SET gateway_invoice_id = $1, gateway_response_initiation = $2, status = $3, updated_at = NOW() WHERE id = $4',
                [gatewayChargeId, tapData, tapData.status || 'INITIATED', dbLogId] // استخدام حالة Tap الأولية
            );
            await client.query('COMMIT');
            console.log(`[API /initiate-tap-payment] تم بدء الدفع بنجاح. LocalInvoiceId: ${localInvoiceId}, GatewayChargeId: ${gatewayChargeId}`);
            res.status(200).json({ paymentURL: paymentURL, localInvoiceId: localInvoiceId, gatewayChargeId: gatewayChargeId });
        } else {
            const errorMessage = tapData.errors?.[0]?.description || tapData.response?.message || 'فشل غير متوقع في بدء عملية الدفع مع Tap Payments.';
            console.error('[API /initiate-tap-payment] خطأ في استجابة Tap Payments API:', errorMessage, tapData);
            await client.query(
                "UPDATE payment_logs SET status = 'ERROR_GATEWAY_INIT_FAILED', gateway_response_initiation = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                [tapData, errorMessage, dbLogId]
            );
            await client.query('COMMIT');
            res.status(502).json({ message: `فشل الاتصال ببوابة الدفع: ${errorMessage}` }); // 502 Bad Gateway
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        const errorMsg = error.response?.data?.errors?.[0]?.description || error.response?.data?.response?.message || error.message || "خطأ غير معروف في الخادم.";
        console.error('[API /initiate-tap-payment] خطأ كارثي:', errorMsg, error.stack);
        // لا تمرر الخطأ مباشرة إلى next إذا كان يحتوي على معلومات حساسة، بدلاً من ذلك، سجل الخطأ وأرسل رسالة عامة.
        res.status(500).json({ message: "حدث خطأ في الخادم أثناء محاولة بدء الدفع. يرجى المحاولة مرة أخرى." });
    } finally {
        if (client) client.release();
    }
});


// ===== GET /api/payment/payment-callback =====
// المستخدم يعود هنا بعد محاولة الدفع في صفحة Tap
router.get('/payment-callback', async (req, res) => {
    const { tap_id, localInvoiceId, dbLogId } = req.query;
    const gatewayChargeIdFromCallback = tap_id; // Tap تستخدم tap_id كمعرف للشحنة في الـ redirect

    console.log(`[API /payment-callback] تم استلام Callback من Tap:`, req.query);

    if (!gatewayChargeIdFromCallback) {
        console.warn("[API /payment-callback] الـ Callback يفتقد tap_id. لا يمكن المتابعة.");
        return res.redirect(`${APP_FRONTEND_URL}/payment-failure?reason=callback_missing_charge_id&ref=${localInvoiceId || 'unknown'}`);
    }

    let effectiveDbLogId = dbLogId;
    let effectiveLocalInvoiceId = localInvoiceId;
    let paymentActuallySucceeded = false;
    let finalLogStatus = 'USER_RETURNED_UNKNOWN_STATUS';

    const client = await pool.connect();
    try {
        // إذا لم يكن dbLogId موجودًا في الـ query، ابحث عنه باستخدام gatewayChargeIdFromCallback
        // أو localInvoiceId إذا كان متاحًا (لكن الاعتماد على معرف البوابة أفضل هنا)
        if (!effectiveDbLogId) {
            console.log(`[API /payment-callback] dbLogId مفقود، محاولة البحث باستخدام gatewayChargeIdFromCallback: ${gatewayChargeIdFromCallback}`);
            const logRes = await client.query(
                'SELECT id, local_invoice_id FROM payment_logs WHERE gateway_invoice_id = $1 ORDER BY created_at DESC LIMIT 1',
                [gatewayChargeIdFromCallback]
            );
            if (logRes.rows.length > 0) {
                effectiveDbLogId = logRes.rows[0].id;
                effectiveLocalInvoiceId = logRes.rows[0].local_invoice_id; // استرجاع المعرف المحلي أيضًا
                console.log(`[API /payment-callback] تم العثور على dbLogId: ${effectiveDbLogId} و localInvoiceId: ${effectiveLocalInvoiceId}`);
            } else {
                console.warn(`[API /payment-callback] لم يتم العثور على payment_log لـ gatewayChargeId: ${gatewayChargeIdFromCallback}`);
                return res.redirect(`${APP_FRONTEND_URL}/payment-failure?reason=log_not_found_for_charge&charge_id=${gatewayChargeIdFromCallback}`);
            }
        }

        // جلب حالة الشحنة من Tap API (التحقق من جانب الخادم)
        if (TAP_SECRET_KEY) {
            const tapRetrieveUrl = `${TAP_API_BASE_URL}/charges/${gatewayChargeIdFromCallback}`;
            const tapHeaders = { 'Authorization': `Bearer ${TAP_SECRET_KEY}` };
            console.log(`[API /payment-callback] التحقق من الشحنة ${gatewayChargeIdFromCallback} مع Tap.`);
            const chargeDetailsResponse = await axios.get(tapRetrieveUrl, { headers: tapHeaders });
            const chargeDetails = chargeDetailsResponse.data;
            console.log(`[API /payment-callback] تفاصيل شحنة Tap المسترجعة:`, JSON.stringify(chargeDetails, null, 2));

            if (chargeDetails && (chargeDetails.status === 'CAPTURED' || chargeDetails.status === 'PAID')) {
                paymentActuallySucceeded = true;
                finalLogStatus = 'USER_RETURNED_SUCCESS_VERIFIED_CB';
            } else {
                paymentActuallySucceeded = false;
                finalLogStatus = `USER_RETURNED_FAILURE_VERIFIED_CB_${chargeDetails.status || 'UNKNOWN'}`;
            }

            if (effectiveDbLogId) {
                await client.query(
                    "UPDATE payment_logs SET status = $1, gateway_payment_id_callback = $2, gateway_response_callback = $3, updated_at = NOW() WHERE id = $4 AND (status NOT LIKE 'COMPLETED' AND status NOT LIKE '%_WEBHOOK%')",
                    [finalLogStatus, gatewayChargeIdFromCallback, chargeDetails, effectiveDbLogId]
                );
            }
        } else {
            console.warn("[API /payment-callback] مفتاح Tap السري غير موجود. لا يمكن التحقق من حالة الشحنة من جانب الخادم. هذا غير آمن.");
            // في هذه الحالة، لا يمكننا تأكيد الدفع بشكل موثوق. سنعتبره فشلًا احترازيًا.
            paymentActuallySucceeded = false;
            finalLogStatus = 'USER_RETURNED_NO_VERIFICATION_KEY';
            if (effectiveDbLogId) {
                await client.query(
                    "UPDATE payment_logs SET status = $1, gateway_payment_id_callback = $2, gateway_response_callback = $3, error_message = $4, updated_at = NOW() WHERE id = $5 AND (status NOT LIKE 'COMPLETED' AND status NOT LIKE '%_WEBHOOK%')",
                    [finalLogStatus, gatewayChargeIdFromCallback, req.query, "Missing TAP_SECRET_KEY for server-side verification", effectiveDbLogId]
                );
            }
        }

        const redirectParams = `?ref=${effectiveLocalInvoiceId || gatewayChargeIdFromCallback}&charge_id=${gatewayChargeIdFromCallback}&status=${paymentActuallySucceeded ? 'success' : 'failed'}`;
        const redirectUrl = paymentActuallySucceeded
            ? `${APP_FRONTEND_URL}/payment-success${redirectParams}`
            : `${APP_FRONTEND_URL}/payment-failure${redirectParams}`;

        console.log(`[API /payment-callback] إعادة توجيه المستخدم إلى: ${redirectUrl}`);
        res.redirect(redirectUrl);

    } catch (error) {
        const errorMsg = error.response?.data?.errors?.[0]?.description || error.response?.data?.message || error.message || "خطأ غير معروف";
        console.error("[API /payment-callback] خطأ أثناء معالجة الـ Callback:", errorMsg, error.stack);
        if (effectiveDbLogId && client) { // تأكد من أن client معرف
            try {
                 await client.query(
                    "UPDATE payment_logs SET status = 'ERROR_CALLBACK_PROCESSING', gateway_payment_id_callback = $1, gateway_response_callback = $2, error_message = $3, updated_at = NOW() WHERE id = $4",
                    [gatewayChargeIdFromCallback, req.query, errorMsg.substring(0, 250), effectiveDbLogId]
                );
            } catch (dbUpdateError) { console.error("[API /payment-callback] خطأ أثناء تسجيل خطأ الـ callback في قاعدة البيانات:", dbUpdateError); }
        }
        const redirectUrlOnError = `${APP_FRONTEND_URL}/payment-failure?ref=${effectiveLocalInvoiceId || gatewayChargeIdFromCallback || 'unknown_cb_err'}&reason=internal_callback_error`;
        res.redirect(redirectUrlOnError);
    } finally {
        if (client) client.release();
    }
});


// ===== POST /api/payment/webhook/tap =====
// Tap ترسل إشعارات (خادم-إلى-خادم) هنا
router.post('/webhook/tap', async (req, res, next) => {
    // !! مهم: تأكد من أن `server.js` يقوم بتهيئة express.json مع خيار `verify`
    // !! للسماح بالوصول إلى الجسم الخام للطلب (`req.rawBody`)
    // !! مثال في server.js: app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
    // !! يجب وضع هذا Middleware قبل تعريف هذا المسار.
    const rawBody = req.rawBody; // يفترض أن يكون هذا متاحًا (Buffer)
    const webhookData = req.body; // الجسم المحلّل كـ JSON
    const tapSignature = req.headers['x-tap-signature'];

    console.log(`[API Tap Webhook] Received. Signature: ${tapSignature}, Parsed Body:`, JSON.stringify(webhookData, null, 2));

    if (!TAP_WEBHOOK_SIGNATURE_KEY) {
        console.error("[API Tap Webhook] مفتاح توقيع Tap Webhook غير مهيأ. لا يمكن التحقق من الـ webhook. يتم الرفض.");
        return res.status(500).send('Webhook configuration error (missing signature key).');
    }
    if (!tapSignature) {
        console.warn('[API Tap Webhook] ترويسة X-TAP-SIGNATURE مفقودة.');
        return res.status(400).send('Missing signature header.');
    }
    if (!rawBody) {
        console.error('[API Tap Webhook] الجسم الخام للطلب (req.rawBody) غير متاح. لا يمكن التحقق من التوقيع. تأكد من تهيئة express.json بشكل صحيح في server.js.');
        return res.status(500).send('Server configuration error (rawBody unavailable).');
    }

    try {
        const expectedSignature = crypto
            .createHmac('sha256', TAP_WEBHOOK_SIGNATURE_KEY)
            .update(rawBody.toString('utf8')) // تأكد من تحويل الـ Buffer إلى سلسلة نصية بنفس الترميز
            .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(tapSignature), Buffer.from(expectedSignature))) {
            console.warn('[API Tap Webhook] توقيع غير صالح. المستلم:', tapSignature, 'المتوقع بناءً على الحساب:', expectedSignature);
            return res.status(403).send('Invalid signature.');
        }
        console.log('[API Tap Webhook] تم التحقق من التوقيع بنجاح.');
    } catch (sigError) {
        console.error('[API Tap Webhook] خطأ أثناء عملية التحقق من التوقيع:', sigError);
        return res.status(500).send('Error during signature verification process.');
    }

    const gatewayChargeId = webhookData.id;
    const gatewayChargeStatus = webhookData.status;
    const metadata = webhookData.metadata || {};
    const dbLogIdFromMeta = metadata.db_log_id;
    const firebaseUidFromMeta = metadata.firebase_uid;
    const gamesFromMeta = metadata.games ? parseInt(metadata.games, 10) : null;

    let effectiveDbLogId = dbLogIdFromMeta;
    let effectiveFirebaseUid = firebaseUidFromMeta;
    let effectiveGamesToGrant = gamesFromMeta;

    const client = await pool.connect();
    try {
        // إذا لم تكن المعرفات موجودة في metadata، حاول البحث عنها باستخدام gatewayChargeId
        if (!effectiveDbLogId || !effectiveFirebaseUid || typeof effectiveGamesToGrant !== 'number') {
            console.log(`[API Tap Webhook] Metadata incomplete or missing. Attempting lookup for charge ID: ${gatewayChargeId}`);
            const logRes = await client.query(
                'SELECT id, user_firebase_uid, games_in_package FROM payment_logs WHERE gateway_invoice_id = $1 ORDER BY created_at DESC LIMIT 1',
                [gatewayChargeId]
            );
            if (logRes.rows.length > 0) {
                effectiveDbLogId = logRes.rows[0].id;
                effectiveFirebaseUid = logRes.rows[0].user_firebase_uid;
                effectiveGamesToGrant = parseInt(logRes.rows[0].games_in_package, 10);
                console.log(`[API Tap Webhook] Found log from DB: dbLogId=${effectiveDbLogId}, uid=${effectiveFirebaseUid}, games=${effectiveGamesToGrant}`);
            } else {
                console.warn(`[API Tap Webhook] لم يتم العثور على payment_log لـ gateway_invoice_id: ${gatewayChargeId} (بعد التحقق من التوقيع).`);
                return res.status(200).send('Webhook processed: Log entry not found for this charge ID.');
            }
        }

        if (!effectiveDbLogId || !effectiveFirebaseUid || typeof effectiveGamesToGrant !== 'number' || effectiveGamesToGrant <= 0) {
            console.error(`[API Tap Webhook] بيانات السجل غير صالحة بعد البحث أو من metadata. dbLogId: ${effectiveDbLogId}, uid: ${effectiveFirebaseUid}, games: ${effectiveGamesToGrant}`);
            await client.query(
                "UPDATE payment_logs SET status = 'ERROR_INVALID_LOG_DATA_WEBHOOK', gateway_response_webhook = $1, error_message = $2, updated_at = NOW() WHERE gateway_invoice_id = $3 OR id = $4",
                [webhookData, `Invalid log data. DBLogID: ${effectiveDbLogId}, UID: ${effectiveFirebaseUid}, Games: ${effectiveGamesToGrant}`, gatewayChargeId, effectiveDbLogId || null]
            );
            return res.status(200).send('Webhook processed: Invalid log data associated with this charge.');
        }

        // بدء معاملة قاعدة البيانات
        await client.query('BEGIN');

        const orderResult = await client.query(
            "SELECT status FROM payment_logs WHERE id = $1 FOR UPDATE", // قفل الصف
            [effectiveDbLogId]
        );

        if (orderResult.rows.length === 0) {
            console.warn(`[API Tap Webhook] لم يتم العثور على الطلب لـ dbLogId ${effectiveDbLogId} للمعالجة النهائية (بعد البحث).`);
            await client.query('ROLLBACK');
            return res.status(200).send('Webhook processed: Order not found for final processing.');
        }
        const currentLogStatus = orderResult.rows[0].status;

        if (currentLogStatus === 'COMPLETED') {
            console.log(`[API Tap Webhook] الطلب ${effectiveDbLogId} (الشحنة: ${gatewayChargeId}) مكتمل بالفعل. تجاهل الـ Webhook.`);
            await client.query('ROLLBACK');
            return res.status(200).send('Webhook processed: Order already completed.');
        }

        // حالات النجاح من Tap
        if (gatewayChargeStatus === 'CAPTURED' || gatewayChargeStatus === 'PAID') {
            const updateUserBalanceSql = `
                UPDATE users SET games_balance = games_balance + $1, updated_at = NOW()
                WHERE firebase_uid = $2 RETURNING games_balance;
            `;
            const balanceUpdateResult = await client.query(updateUserBalanceSql, [effectiveGamesToGrant, effectiveFirebaseUid]);

            if (balanceUpdateResult.rowCount === 0) {
                console.error(`[API Tap Webhook] لم يتم العثور على المستخدم ${effectiveFirebaseUid} لتحديث الرصيد. الشحنة: ${gatewayChargeId}`);
                await client.query(
                    "UPDATE payment_logs SET status = 'ERROR_USER_NOT_FOUND_COMPLETION', gateway_response_webhook = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                    [webhookData, `User ${effectiveFirebaseUid} not found for balance update.`, effectiveDbLogId]
                );
                await client.query('COMMIT'); // تأكيد حالة الخطأ
                return res.status(200).send('Webhook processed: User not found for balance update.');
            }
            const newBalance = balanceUpdateResult.rows[0].games_balance;

            await client.query(
                "UPDATE payment_logs SET status = 'COMPLETED', gateway_payment_id_webhook = $1, gateway_response_webhook = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3",
                [gatewayChargeId, webhookData, effectiveDbLogId]
            );
            await client.query('COMMIT');
            console.log(`[API Tap Webhook] تم منح الألعاب بنجاح. dbLogId: ${effectiveDbLogId}, Charge: ${gatewayChargeId}. رصيد المستخدم ${effectiveFirebaseUid} الآن ${newBalance}.`);
            res.status(200).send('Webhook processed successfully and games granted.');
        } else {
            // حالات الفشل أو الحالات الأخرى من Tap
            const failureStatusForLog = `FAILED_GATEWAY_WEBHOOK_${gatewayChargeStatus.toUpperCase()}`;
            await client.query(
                "UPDATE payment_logs SET status = $1, gateway_payment_id_webhook = $2, gateway_response_webhook = $3, error_message = $4, updated_at = NOW() WHERE id = $5 AND status <> 'COMPLETED'",
                [failureStatusForLog, gatewayChargeId, webhookData, `Tap Webhook Status: ${gatewayChargeStatus}`, effectiveDbLogId]
            );
            await client.query('COMMIT'); // تأكيد حالة الفشل/الأخرى
            console.log(`[API Tap Webhook] تم تسجيل حالة الدفع كـ ${failureStatusForLog}. dbLogId: ${effectiveDbLogId}, Charge: ${gatewayChargeId}.`);
            res.status(200).send('Webhook processed: Payment not successful or in other state.');
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error(`[API Tap Webhook] خطأ كارثي في معالجة الـ webhook لـ Charge ID ${gatewayChargeId} (Log ID: ${effectiveDbLogId}):`, error.stack);
        // لا نرسل تفاصيل الخطأ الدقيقة إلى Tap، ولكن يجب أن نحاول الرد بـ 500 لتشجيع إعادة المحاولة إذا كان خطأً مؤقتًا
        res.status(500).send('Internal server error processing webhook.');
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
