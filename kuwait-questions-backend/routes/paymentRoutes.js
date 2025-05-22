// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const axios = require('axios'); // أو SDK بوابة الدفع التي اخترتها
const { v4: uuidv4 } = require('uuid'); // لإنشاء معرفات فريدة إذا لزم الأمر

const MYFATOORAH_API_KEY = process.env.MYFATOORAH_API_KEY;
const MYFATOORAH_BASE_URL = process.env.MYFATOORAH_BASE_URL || 'https://apitest.myfatoorah.com'; // استخدم رابط الاختبار افتراضيًا
const APP_URL = process.env.APP_FRONTEND_URL || 'https://rehlagame.com'; // رابط الواجهة الأمامية لتطبيقك

// ===== POST /api/payment/initiate-payment =====
// (مثال باستخدام MyFatoorah - ستحتاج لتكييفه لبوابة الدفع الفعلية)
router.post('/initiate-payment', verifyFirebaseToken, async (req, res, next) => {
    const { amount, currency, packageName, gamesInPackage, customerName, customerEmail, appliedPromoCode } = req.body;
    const firebaseUid = req.user.uid;
    const localInvoiceId = `REHLA-${uuidv4().slice(0, 12).toUpperCase()}`; // معرف فاتورة محلي فريد

    console.log(`[API /initiate-payment] Request for UID: ${firebaseUid}`, { localInvoiceId, ...req.body });

    if (!amount || amount <= 0 || !currency) {
        return res.status(400).json({ message: 'Invalid payment amount or currency.' });
    }
    if (!packageName || typeof gamesInPackage !== 'number' || gamesInPackage <= 0) {
        return res.status(400).json({ message: 'Invalid package details.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. سجل محاولة الدفع في قاعدة بياناتك
        const paymentLogQuery = `
            INSERT INTO payment_logs
                (user_firebase_uid, local_invoice_id, amount, currency, package_name, games_in_package, promo_code_used, status, gateway_name, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', 'MyFatoorah', NOW(), NOW())
            RETURNING id;
        `;
        const paymentLogValues = [firebaseUid, localInvoiceId, amount, currency, packageName, gamesInPackage, appliedPromoCode || null];
        const paymentLogResult = await client.query(paymentLogQuery, paymentLogValues);
        const dbLogId = paymentLogResult.rows[0].id; // ID السجل في قاعدة البيانات

        // 2. قم بإعداد طلب API لبوابة الدفع (MyFatoorah كمثال)
        const myFatoorahPayload = {
            InvoiceAmount: parseFloat(amount).toFixed(3), // تأكد من أن المبلغ مهيأ بشكل صحيح (3 خانات عشرية للدينار الكويتي)
            CurrencyIso: currency,
            CustomerName: customerName || req.user.name || 'Rehla User',
            CustomerEmail: customerEmail || req.user.email,
            CallBackUrl: `${APP_URL}/payment-callback?status=success&localInvoiceId=${localInvoiceId}&dbLogId=${dbLogId}`,
            ErrorUrl: `${APP_URL}/payment-callback?status=failure&localInvoiceId=${localInvoiceId}&dbLogId=${dbLogId}`,
            Language: 'AR',
            DisplayCurrencyIso: currency,
            UserDefinedField: JSON.stringify({ localInvoiceId: localInvoiceId, firebaseUid: firebaseUid, dbLogId: dbLogId })
            // يمكنك إضافة حقول مثل CustomerMobile، CustomerCivilId إذا كانت مطلوبة/موصى بها
        };

        const myFatoorahHeaders = {
            'Authorization': `Bearer ${MYFATOORAH_API_KEY}`,
            'Content-Type': 'application/json'
        };
        const myFatoorahApiUrl = `${MYFATOORAH_BASE_URL}/v2/SendPayment`;

        console.log(`[API /initiate-payment] Sending to MyFatoorah: ${myFatoorahApiUrl}`, myFatoorahPayload);
        const paymentGatewayResponse = await axios.post(myFatoorahApiUrl, myFatoorahPayload, { headers: myFatoorahHeaders });
        console.log(`[API /initiate-payment] MyFatoorah Raw Response:`, paymentGatewayResponse.data);


        if (paymentGatewayResponse.data && paymentGatewayResponse.data.IsSuccess && paymentGatewayResponse.data.Data.PaymentURL) {
            const paymentURL = paymentGatewayResponse.data.Data.PaymentURL;
            const gatewayInvoiceId = paymentGatewayResponse.data.Data.InvoiceId;

            await client.query(
                'UPDATE payment_logs SET gateway_invoice_id = $1, gateway_response_initiation = $2, updated_at = NOW() WHERE id = $3',
                [gatewayInvoiceId, paymentGatewayResponse.data, dbLogId]
            );
            await client.query('COMMIT');
            console.log(`[API /initiate-payment] Payment initiated for localInvoiceId: ${localInvoiceId}, GatewayInvoiceId: ${gatewayInvoiceId}`);
            res.status(200).json({ paymentURL: paymentURL, localInvoiceId: localInvoiceId });
        } else {
            const errorMessage = paymentGatewayResponse.data?.ValidationErrors?.[0]?.Error || paymentGatewayResponse.data?.Message || 'Failed to initiate payment with MyFatoorah.';
            console.error('[API /initiate-payment] MyFatoorah API Error:', errorMessage, paymentGatewayResponse.data);
            await client.query(
                "UPDATE payment_logs SET status = 'FAILED_AT_GATEWAY', gateway_response_initiation = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                [paymentGatewayResponse.data, errorMessage, dbLogId]
            );
            await client.query('COMMIT'); // Commit even on failure to log
            res.status(500).json({ message: errorMessage });
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[API /initiate-payment] Error:', error.response ? error.response.data : error.message, error.stack);
        next(new Error('Server error while initiating payment.'));
    } finally {
        if (client) client.release();
    }
});

// ===== GET /api/payment/callback/myfatoorah (أو اسم عام أكثر مثل /payment-status) =====
// هذا الـ endpoint يستقبل المستخدم بعد عودته من صفحة بوابة الدفع.
// لا تقم بتحديث رصيد الألعاب هنا. استخدمه فقط لعرض رسالة أو إعادة توجيه.
// الواجهة الأمامية (main.js) ستتعامل مع إعادة التوجيه الفعلية إلى /payment-success أو /payment-failure
// بناءً على الـ query parameters.
// هذا الـ endpoint هو لتسجيل عودة المستخدم إذا أردت ذلك.
router.get('/payment-status-update', async (req, res) => {
    const { paymentId, Id, localInvoiceId, dbLogId, status, reason } = req.query; // قد تختلف أسماء البارامترات
    const gatewayPaymentId = paymentId || Id; // MyFatoorah قد تستخدم paymentId أو Id

    console.log(`[API /payment-status-update] Callback received:`, req.query);

    if (!dbLogId) {
        console.warn("[API /payment-status-update] Callback missing dbLogId. Cannot update payment log for user feedback stage.");
        // لا يزال بإمكانك إعادة توجيه المستخدم بناءً على 'status' إذا كان موجودًا
        const redirectUrl = (status === 'success')
            ? `${APP_URL}/payment-success?ref=${localInvoiceId || 'unknown'}`
            : `${APP_URL}/payment-failure?ref=${localInvoiceId || 'unknown'}&reason=${reason || 'callback_error'}`;
        return res.redirect(redirectUrl);
    }

    const client = await pool.connect();
    try {
        let logStatusUpdate = 'UNKNOWN_CALLBACK';
        if (status === 'success' && gatewayPaymentId) {
            logStatusUpdate = 'USER_RETURNED_SUCCESS';
        } else if (status === 'failure') {
            logStatusUpdate = 'USER_RETURNED_FAILURE';
        }

        await client.query(
            "UPDATE payment_logs SET status = $1, gateway_payment_id_callback = $2, gateway_response_callback = $3, updated_at = NOW() WHERE id = $4 AND status = 'PENDING'",
            [logStatusUpdate, gatewayPaymentId || null, req.query, dbLogId]
        );
        console.log(`[API /payment-status-update] Log status updated to ${logStatusUpdate} for dbLogId: ${dbLogId}`);

        // أعد توجيه المستخدم إلى صفحة نجاح/فشل في الواجهة الأمامية
        // الواجهة الأمامية ستقوم بعرض الرسالة المناسبة
        const redirectUrl = (status === 'success')
            ? `${APP_URL}/payment-success?ref=${localInvoiceId}`
            : `${APP_URL}/payment-failure?ref=${localInvoiceId}&reason=${reason || 'payment_failed_at_gateway'}`;
        res.redirect(redirectUrl);

    } catch (dbError) {
        console.error("[API /payment-status-update] Error updating payment_log status on callback:", dbError);
        // حتى لو فشل تحديث السجل، أعد توجيه المستخدم
        const redirectUrlOnError = (status === 'success')
            ? `${APP_URL}/payment-success?ref=${localInvoiceId || 'unknown_error_ref'}`
            : `${APP_URL}/payment-failure?ref=${localInvoiceId || 'unknown_error_ref'}&reason=db_callback_error`;
        res.redirect(redirectUrlOnError);
    } finally {
        if (client) client.release();
    }
});


// ===== POST /api/payment/webhook/myfatoorah =====
// هذا الـ endpoint يستقبل إشعارًا مباشرًا (خادم-إلى-خادم) من بوابة الدفع.
// هذا هو المكان الموثوق لتحديث رصيد الألعاب.
router.post('/webhook/myfatoorah', async (req, res, next) => {
    const webhookData = req.body;
    console.log('[API MyFatoorah Webhook] Received:', JSON.stringify(webhookData, null, 2));

    // !! مهم جدًا: تحقق من صحة الـ Webhook هنا !!
    // كل بوابة دفع لديها طريقتها (مثلاً، توقيع في الترويسة، أو التحقق من IP المصدر).
    // تجاهل هذه الخطوة يعرضك للاحتيال.
    // const signature = req.headers['x-myfatoorah-signature']; // مثال
    // if (!isValidMyFatoorahSignature(signature, req.rawBody || JSON.stringify(req.body), process.env.MYFATOORAH_WEBHOOK_SECRET)) {
    //     console.warn('[API MyFatoorah Webhook] Invalid signature.');
    //     return res.status(400).send('Invalid signature.');
    // }

    const gatewayInvoiceStatus = webhookData.Data?.InvoiceStatus; // أو حقل الحالة المناسب من MyFatoorah
    const gatewayInvoiceId = webhookData.Data?.InvoiceId;
    const gatewayPaymentId = webhookData.Data?.PaymentId; // قد يكون هذا أكثر فائدة لتسجيل معرف الدفع الفعلي

    let localInvoiceId;
    let firebaseUidForUpdate;
    let dbLogIdForUpdate;
    let gamesToGrantFromLog;

    // محاولة استخراج localInvoiceId و firebaseUid من UserDefinedField
    if (webhookData.Data?.UserDefinedField) {
        try {
            const udf = JSON.parse(webhookData.Data.UserDefinedField);
            if (udf) {
                localInvoiceId = udf.localInvoiceId;
                firebaseUidForUpdate = udf.firebaseUid;
                dbLogIdForUpdate = udf.dbLogId; // استخدام dbLogId إذا تم تمريره
            }
        } catch (e) { console.warn("[API MyFatoorah Webhook] Could not parse UserDefinedField:", e); }
    }

    // إذا لم يتم العثور على dbLogId من UserDefinedField، حاول البحث عنه عبر gatewayInvoiceId
    if (!dbLogIdForUpdate && gatewayInvoiceId) {
        try {
            const logRes = await pool.query('SELECT id, user_firebase_uid, games_in_package FROM payment_logs WHERE gateway_invoice_id = $1 ORDER BY created_at DESC LIMIT 1', [gatewayInvoiceId]);
            if (logRes.rows.length > 0) {
                dbLogIdForUpdate = logRes.rows[0].id;
                firebaseUidForUpdate = logRes.rows[0].user_firebase_uid;
                gamesToGrantFromLog = logRes.rows[0].games_in_package;
            }
        } catch (lookupError) {
            console.error(`[API MyFatoorah Webhook] Error looking up log by gatewayInvoiceId ${gatewayInvoiceId}:`, lookupError);
            return res.status(500).send('Error processing webhook (log lookup).');
        }
    }

    if (!dbLogIdForUpdate || !firebaseUidForUpdate) {
        console.error('[API MyFatoorah Webhook] Error: Could not determine dbLogId or firebaseUid from webhook data:', webhookData);
        return res.status(400).send('Webhook Error: Missing or invalid invoice/user identifier.');
    }


    const client = await pool.connect();
    try {
        if (gatewayInvoiceStatus === 'Paid') { // أو الحالة التي تشير إلى نجاح الدفع من MyFatoorah
            await client.query('BEGIN');

            const orderResult = await client.query(
                "SELECT user_firebase_uid, games_in_package, status FROM payment_logs WHERE id = $1 FOR UPDATE",
                [dbLogIdForUpdate]
            );

            if (orderResult.rows.length === 0) {
                console.warn(`[API MyFatoorah Webhook] No order found for dbLogId ${dbLogIdForUpdate}`);
                await client.query('ROLLBACK');
                return res.status(404).send('Order not found for webhook processing.');
            }
            const order = orderResult.rows[0];
            gamesToGrantFromLog = order.games_in_package; // التأكد من أن لدينا عدد الألعاب الصحيح

            if (order.status === 'COMPLETED') {
                console.warn(`[API MyFatoorah Webhook] Order ${dbLogIdForUpdate} already completed.`);
                await client.query('ROLLBACK');
                return res.status(200).send('Webhook: Order already processed.');
            }
            if (typeof gamesToGrantFromLog !== 'number' || gamesToGrantFromLog <= 0) {
                console.error(`[API MyFatoorah Webhook] Invalid games_in_package (${gamesToGrantFromLog}) for order ${dbLogIdForUpdate}.`);
                await client.query('ROLLBACK');
                return res.status(400).send('Webhook: Invalid package details in log.');
            }

            const updateUserBalanceSql = `
                UPDATE users SET games_balance = games_balance + $1, updated_at = NOW()
                WHERE firebase_uid = $2 RETURNING games_balance;
            `;
            const balanceUpdateResult = await client.query(updateUserBalanceSql, [gamesToGrantFromLog, firebaseUidForUpdate]);

            if (balanceUpdateResult.rowCount === 0) {
                console.error(`[API MyFatoorah Webhook] User not found or failed to update balance for UID ${firebaseUidForUpdate}`);
                await client.query('ROLLBACK');
                return res.status(500).send('Webhook: Failed to update user balance.');
            }
            const newBalance = balanceUpdateResult.rows[0].games_balance;

            await client.query(
                "UPDATE payment_logs SET status = 'COMPLETED', gateway_payment_id_webhook = $1, gateway_response_webhook = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3",
                [gatewayPaymentId || gatewayInvoiceId, webhookData, dbLogIdForUpdate]
            );

            await client.query('COMMIT');
            console.log(`[API MyFatoorah Webhook] Payment for dbLogId ${dbLogIdForUpdate} (local: ${localInvoiceId}) processed. User ${firebaseUidForUpdate} balance now ${newBalance}.`);
            res.status(200).send('Webhook processed successfully.');

        } else {
            // إذا لم يكن الدفع ناجحًا، قم بتحديث حالة الطلب
            await client.query(
                "UPDATE payment_logs SET status = 'FAILED_AT_GATEWAY_WEBHOOK', gateway_payment_id_webhook = $1, gateway_response_webhook = $2, error_message = $3, updated_at = NOW() WHERE id = $4 AND status <> 'COMPLETED'",
                [gatewayPaymentId || gatewayInvoiceId, webhookData, `Gateway status: ${gatewayInvoiceStatus}`, dbLogIdForUpdate]
            );
            console.log(`[API MyFatoorah Webhook] Payment for dbLogId ${dbLogIdForUpdate} reported as not successful: ${gatewayInvoiceStatus}`);
            res.status(200).send('Webhook received, payment not successful.');
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error(`[API MyFatoorah Webhook] Error processing webhook for dbLogId ${dbLogIdForUpdate}:`, error.stack);
        // لا ترسل next(error) هنا بالضرورة، لأن بوابة الدفع تتوقع استجابة 2xx أو 5xx
        res.status(500).send('Server error processing webhook.');
    } finally {
        if (client) client.release();
    }
});

// (اختياري) دالة بسيطة للتحقق من توقيع Webhook (هذه مجرد مثال، ستحتاج إلى منطق MyFatoorah الفعلي)
// function isValidMyFatoorahSignature(signature, body, secret) {
//     if (!secret || !signature) return false; // لا يمكن التحقق بدون سر أو توقيع
//     // const crypto = require('crypto');
//     // const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
//     // return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
//     console.warn("Webhook signature validation is NOT YET IMPLEMENTED for MyFatoorah. This is a security risk.");
//     return true; // حاليًا، افترض أنه صحيح (للتطوير فقط!)
// }


module.exports = router;