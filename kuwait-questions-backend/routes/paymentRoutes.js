// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// --- إعدادات Tap Payments (يتم تحميلها من ملف .env) ---
const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY; // يستخدم هذا الآن لتوقيع الـ hashstring
const TAP_API_BASE_URL = process.env.TAP_API_BASE_URL || 'https://api.tap.company/v2';
// لم نعد بحاجة إلى TAP_WEBHOOK_SIGNATURE_KEY بشكل منفصل إذا كان هو نفسه الـ SECRET_KEY
// وإذا كان Tap يستخدم الـ SECRET_KEY للتحقق من الـ hashstring

const APP_FRONTEND_URL = process.env.APP_FRONTEND_URL || 'https://rehlagame.com';
const BACKEND_URL_FOR_WEBHOOKS = process.env.BACKEND_URL;

// التحقق من المفاتيح الأساسية عند بدء التشغيل
if (!TAP_SECRET_KEY || TAP_SECRET_KEY.includes('DUMMYKEY')) {
    console.error("خطأ فادح: TAP_SECRET_KEY (الاختباري) غير مهيأ بشكل صحيح في متغيرات البيئة!");
}
if (!BACKEND_URL_FOR_WEBHOOKS) {
    console.warn("تحذير: BACKEND_URL غير مهيأ. عنوان URL للـ Webhook قد يكون غير صحيح.");
}

// --- Helper function to format amount based on currency (as per Tap docs example) ---
// This is a simplified version. For production, use a proper library for currency formatting.
function formatAmountForHashing(amount, currency) {
    const currencyDecimals = {
        KWD: 3, BHD: 3, OMR: 3, // 3 decimal places
        SAR: 2, AED: 2, QAR: 2, USD: 2, EUR: 2, GBP: 2, EGP: 2 // 2 decimal places
    };
    const decimals = currencyDecimals[currency.toUpperCase()] !== undefined ? currencyDecimals[currency.toUpperCase()] : 2;
    return parseFloat(amount).toFixed(decimals);
}


// ===== POST /api/payment/initiate-tap-payment =====
// ... (لا تغييرات هنا، الكود الحالي صحيح)
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
    if (!TAP_SECRET_KEY || TAP_SECRET_KEY.includes('DUMMYKEY')) {
        console.error("[API /initiate-tap-payment] مفتاح Tap السري الاختباري غير مهيأ بشكل صحيح. لا يمكن المتابعة.");
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
            currency: currency.toUpperCase(),
            threeDSecure: true,
            save_card: false,
            description: `لعبة رحلة - ${packageName}`,
            statement_descriptor: "RehlaGame",
            metadata: {
                local_invoice_id: localInvoiceId,
                db_log_id: dbLogId.toString(),
                firebase_uid: firebaseUid,
                package: packageName,
                games: gamesInPackage.toString()
            },
            receipt: {
                email: !!customerEmail,
                sms: false
            },
            customer: {
                first_name: (customerName ? customerName.split(' ')[0] : (req.user.name ? req.user.name.split(' ')[0] : 'Rehla')).substring(0, 30),
                email: customerEmail || req.user.email,
            },
            source: {
                id: "src_all"
            },
            post: {
                url: `${BACKEND_URL_FOR_WEBHOOKS}/api/payment/webhook/tap`
            },
            redirect: {
                url: `${BACKEND_URL_FOR_WEBHOOKS}/api/payment/payment-callback?localInvoiceId=${localInvoiceId}&dbLogId=${dbLogId}`
            }
        };

        const tapHeaders = {
            'Authorization': `Bearer ${TAP_SECRET_KEY}`,
            'Content-Type': 'application/json',
            'lang_code': 'ar'
        };

        const tapApiUrl = `${TAP_API_BASE_URL}/charges`;

        console.log(`[API /initiate-tap-payment] Sending to Tap: ${tapApiUrl}. Payload:`, JSON.stringify(tapPayload, null, 2));
        const tapGatewayResponse = await axios.post(tapApiUrl, tapPayload, { headers: tapHeaders });
        const tapData = tapGatewayResponse.data;
        console.log(`[API /initiate-tap-payment] Tap Payments Response:`, JSON.stringify(tapData, null, 2));

        if (tapData && tapData.id && tapData.transaction && tapData.transaction.url) {
            const paymentURL = tapData.transaction.url;
            const gatewayChargeId = tapData.id;

            await client.query(
                'UPDATE payment_logs SET gateway_invoice_id = $1, gateway_response_initiation = $2, status = $3, updated_at = NOW() WHERE id = $4',
                [gatewayChargeId, tapData, tapData.status || 'INITIATED', dbLogId]
            );
            await client.query('COMMIT');
            console.log(`[API /initiate-tap-payment] Payment initiated successfully. LocalInvoiceId: ${localInvoiceId}, GatewayChargeId: ${gatewayChargeId}`);
            res.status(200).json({ paymentURL: paymentURL, localInvoiceId: localInvoiceId, gatewayChargeId: gatewayChargeId });
        } else {
            const errorMessage = tapData.errors?.[0]?.description || tapData.response?.message || 'فشل غير متوقع في بدء عملية الدفع مع Tap Payments.';
            console.error('[API /initiate-tap-payment] Error in Tap Payments API response:', errorMessage, tapData);
            await client.query(
                "UPDATE payment_logs SET status = 'ERROR_GATEWAY_INIT_FAILED', gateway_response_initiation = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                [tapData, errorMessage.substring(0, 250), dbLogId]
            );
            await client.query('COMMIT');
            res.status(502).json({ message: `فشل الاتصال ببوابة الدفع: ${errorMessage}` });
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        const errorMsg = error.response?.data?.errors?.[0]?.description || error.response?.data?.response?.message || error.message || "خطأ غير معروف في الخادم.";
        console.error('[API /initiate-tap-payment] Critical error:', errorMsg, error.stack);
        res.status(500).json({ message: "حدث خطأ في الخادم أثناء محاولة بدء الدفع. يرجى المحاولة مرة أخرى." });
    } finally {
        if (client) client.release();
    }
});

// ===== GET /api/payment/payment-callback =====
// ... (لا تغييرات هنا، الكود الحالي صحيح)
router.get('/payment-callback', async (req, res) => {
    const { tap_id, localInvoiceId, dbLogId } = req.query;
    const gatewayChargeIdFromCallback = tap_id;

    console.log(`[API /payment-callback] Received Callback from Tap:`, req.query);

    if (!gatewayChargeIdFromCallback) {
        console.warn("[API /payment-callback] Callback missing tap_id. Cannot proceed.");
        return res.redirect(`${APP_FRONTEND_URL}/payment-failure.html?reason=callback_missing_charge_id&ref=${localInvoiceId || 'unknown'}`);
    }

    let effectiveDbLogId = dbLogId;
    let effectiveLocalInvoiceId = localInvoiceId;
    let paymentActuallySucceeded = false;
    let finalLogStatus = 'USER_RETURNED_UNKNOWN_STATUS';

    const client = await pool.connect();
    try {
        if (!effectiveDbLogId) {
            console.log(`[API /payment-callback] dbLogId missing, looking up by gatewayChargeId: ${gatewayChargeIdFromCallback}`);
            const logRes = await client.query(
                'SELECT id, local_invoice_id FROM payment_logs WHERE gateway_invoice_id = $1 ORDER BY created_at DESC LIMIT 1',
                [gatewayChargeIdFromCallback]
            );
            if (logRes.rows.length > 0) {
                effectiveDbLogId = logRes.rows[0].id;
                effectiveLocalInvoiceId = logRes.rows[0].local_invoice_id;
                console.log(`[API /payment-callback] Found dbLogId: ${effectiveDbLogId}, localInvoiceId: ${effectiveLocalInvoiceId}`);
            } else {
                console.warn(`[API /payment-callback] No payment_log found for gatewayChargeId: ${gatewayChargeIdFromCallback}`);
                return res.redirect(`${APP_FRONTEND_URL}/payment-failure.html?reason=log_not_found_for_charge&charge_id=${gatewayChargeIdFromCallback}`);
            }
        }

        if (!TAP_SECRET_KEY || TAP_SECRET_KEY.includes('DUMMYKEY')) {
            console.error("[API /payment-callback] TAP_SECRET_KEY is not properly configured. Cannot verify charge status with Tap API. THIS IS INSECURE.");
            paymentActuallySucceeded = false;
            finalLogStatus = 'USER_RETURNED_NO_VERIFICATION_KEY';
            if (effectiveDbLogId) {
                await client.query(
                    "UPDATE payment_logs SET status = $1, gateway_payment_id_callback = $2, gateway_response_callback = $3, error_message = $4, updated_at = NOW() WHERE id = $5 AND (status NOT LIKE 'COMPLETED' AND status NOT LIKE '%_WEBHOOK%')",
                    [finalLogStatus, gatewayChargeIdFromCallback, req.query, "Missing/Dummy TAP_SECRET_KEY for server-side verification", effectiveDbLogId]
                );
            }
        } else {
            const tapRetrieveUrl = `${TAP_API_BASE_URL}/charges/${gatewayChargeIdFromCallback}`;
            const tapHeaders = { 'Authorization': `Bearer ${TAP_SECRET_KEY}` };
            console.log(`[API /payment-callback] Verifying charge ${gatewayChargeIdFromCallback} with Tap.`);
            const chargeDetailsResponse = await axios.get(tapRetrieveUrl, { headers: tapHeaders });
            const chargeDetails = chargeDetailsResponse.data;
            console.log(`[API /payment-callback] Tap Charge Details:`, JSON.stringify(chargeDetails, null, 2));

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
        }

        const redirectParams = `?ref=${effectiveLocalInvoiceId || gatewayChargeIdFromCallback}&charge_id=${gatewayChargeIdFromCallback}&status=${paymentActuallySucceeded ? 'success' : 'failed'}`;
        const redirectUrl = paymentActuallySucceeded
            ? `${APP_FRONTEND_URL}/payment-success.html${redirectParams}`
            : `${APP_FRONTEND_URL}/payment-failure.html${redirectParams}`;

        console.log(`[API /payment-callback] Redirecting user to: ${redirectUrl}`);
        res.redirect(redirectUrl);

    } catch (error) {
        const errorMsg = error.response?.data?.errors?.[0]?.description || error.response?.data?.message || error.message || "خطأ غير معروف";
        console.error("[API /payment-callback] Error processing callback:", errorMsg, error.stack);
        if (effectiveDbLogId && client) {
            try {
                 await client.query(
                    "UPDATE payment_logs SET status = 'ERROR_CALLBACK_PROCESSING', gateway_payment_id_callback = $1, gateway_response_callback = $2, error_message = $3, updated_at = NOW() WHERE id = $4",
                    [gatewayChargeIdFromCallback, req.query, errorMsg.substring(0, 250), effectiveDbLogId]
                );
            } catch (dbUpdateError) { console.error("[API /payment-callback] Error logging callback processing error to DB:", dbUpdateError); }
        }
        const redirectUrlOnError = `${APP_FRONTEND_URL}/payment-failure.html?ref=${effectiveLocalInvoiceId || gatewayChargeIdFromCallback || 'unknown_cb_err'}&reason=internal_callback_error`;
        res.redirect(redirectUrlOnError);
    } finally {
        if (client) client.release();
    }
});


// ===== POST /api/payment/webhook/tap =====
router.post('/webhook/tap', async (req, res, next) => {
    console.log('[API Tap Webhook] ALL INCOMING HEADERS:', JSON.stringify(req.headers, null, 2));

    const webhookData = req.body; // الجسم الخام لم يعد ضروريًا بهذه الطريقة
    const receivedHashstring = req.headers['hashstring']; // Header الصحيح من Tap

    console.log(`[API Tap Webhook] Received. Hashstring from header: ${receivedHashstring}, Parsed Body:`, JSON.stringify(webhookData, null, 2));

    if (!TAP_SECRET_KEY || TAP_SECRET_KEY.includes('DUMMYKEY')) {
        console.error("[API Tap Webhook] TAP_SECRET_KEY is not properly configured. Cannot verify webhook. REJECTING.");
        return res.status(500).send('Webhook configuration error (missing secret key).');
    }

    if (!receivedHashstring) {
        console.warn('[API Tap Webhook] "hashstring" header missing. Cannot verify.');
        return res.status(400).send('Missing hashstring header.');
    }

    // استخراج الحقول اللازمة للـ hash من جسم الـ webhookData
    // يجب أن تتطابق هذه الحقول وترتيبها مع ما هو موثق من Tap لنوع الحدث (Charge)
    let id, amount, currency, gateway_reference, payment_reference, status, created_timestamp;

    if (webhookData.object === 'charge') {
        id = webhookData.id;
        amount = webhookData.amount; // Tap يتوقع هذا الرقم بالفعل بالتنسيق الصحيح
        currency = webhookData.currency;
        gateway_reference = webhookData.reference?.gateway;
        payment_reference = webhookData.reference?.payment;
        status = webhookData.status;
        created_timestamp = webhookData.transaction?.created; // يجب أن يكون هذا timestamp
    } else {
        console.warn(`[API Tap Webhook] Received webhook for unhandled object type: ${webhookData.object}`);
        return res.status(400).send(`Unhandled webhook object type: ${webhookData.object}`);
    }
    
    // التحقق من وجود جميع الحقول الضرورية قبل بناء السلسلة
    if ([id, amount, currency, status, created_timestamp].some(val => val === undefined || val === null) || 
        (webhookData.object === 'charge' && (gateway_reference === undefined || payment_reference === undefined))) {
        console.error('[API Tap Webhook] Missing one or more required fields for hashstring calculation from webhook body:', {id, amount, currency, gateway_reference, payment_reference, status, created_timestamp});
        return res.status(400).send('Webhook body missing required fields for hashstring.');
    }

    // بناء السلسلة النصية للـ hash كما هو موضح في وثائق Tap لـ Charge
    // x_id{charge.id}x_amount{charge.amount}x_currency{charge.currency}x_gateway_reference{charge.reference.gateway}x_payment_reference{charge.reference.payment}x_status{charge.status}x_created{charge.transaction.created}
    const formattedAmount = formatAmountForHashing(amount, currency); // استخدام الدالة المساعدة
    const toBeHashedString = `x_id${id}x_amount${formattedAmount}x_currency${currency}x_gateway_reference${gateway_reference}x_payment_reference${payment_reference}x_status${status}x_created${created_timestamp}`;
    
    console.log(`[API Tap Webhook] String to be hashed: "${toBeHashedString}"`);

    try {
        const calculatedHashstring = crypto
            .createHmac('sha256', TAP_SECRET_KEY) // استخدام TAP_SECRET_KEY
            .update(toBeHashedString)
            .digest('hex');

        console.log(`[API Tap Webhook] Calculated hashstring: ${calculatedHashstring}`);

        if (calculatedHashstring !== receivedHashstring) {
            console.warn('[API Tap Webhook] Invalid hashstring. Received:', receivedHashstring, 'Calculated:', calculatedHashstring);
            return res.status(403).send('Invalid hashstring.');
        }
        console.log('[API Tap Webhook] Hashstring verified successfully.');
    } catch (sigError) {
        console.error('[API Tap Webhook] Error during hashstring verification process:', sigError);
        return res.status(500).send('Error during hashstring verification process.');
    }

    // --- بقية منطق معالجة الـ Webhook (كما كان، مع بعض التعديلات الطفيفة للتأكد من الحصول على البيانات) ---
    const gatewayChargeId = webhookData.id; // هذا هو id من webhookData
    const gatewayChargeStatus = webhookData.status; // status من webhookData
    const metadata = webhookData.metadata || {};
    const dbLogIdFromMeta = metadata.db_log_id;
    const firebaseUidFromMeta = metadata.firebase_uid;
    const gamesFromMeta = metadata.games ? parseInt(metadata.games, 10) : null;

    let effectiveDbLogId = dbLogIdFromMeta;
    let effectiveFirebaseUid = firebaseUidFromMeta;
    let effectiveGamesToGrant = gamesFromMeta;

    const client = await pool.connect();
    try {
        // ... (المنطق المتبقي كما هو، تأكد فقط أنك تستخدم المتغيرات الصحيحة من webhookData)
        if (!effectiveDbLogId || !effectiveFirebaseUid || typeof effectiveGamesToGrant !== 'number') {
            console.log(`[API Tap Webhook] Metadata incomplete from webhook. Attempting lookup for charge ID: ${gatewayChargeId}`);
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
                console.warn(`[API Tap Webhook] No payment_log found for gateway_invoice_id: ${gatewayChargeId}. Cannot process webhook further.`);
                return res.status(200).send('Webhook processed: Log entry not found for this charge ID, cannot fulfill.');
            }
        }

        if (!effectiveDbLogId || !effectiveFirebaseUid || typeof effectiveGamesToGrant !== 'number' || effectiveGamesToGrant <= 0) {
            console.error(`[API Tap Webhook] Invalid or incomplete log data after lookup. dbLogId: ${effectiveDbLogId}, uid: ${effectiveFirebaseUid}, games: ${effectiveGamesToGrant}`);
            if(effectiveDbLogId) {
                await client.query(
                    "UPDATE payment_logs SET status = 'ERROR_INVALID_LOG_DATA_WEBHOOK', gateway_response_webhook = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                    [webhookData, `Invalid log data. DBLogID: ${effectiveDbLogId}, UID: ${effectiveFirebaseUid}, Games: ${effectiveGamesToGrant}`, effectiveDbLogId]
                ).catch(e => console.error("Error updating log for invalid data:", e));
            }
            return res.status(200).send('Webhook processed: Invalid log data associated with this charge.');
        }

        await client.query('BEGIN');

        const orderResult = await client.query(
            "SELECT status FROM payment_logs WHERE id = $1 FOR UPDATE",
            [effectiveDbLogId]
        );

        if (orderResult.rows.length === 0) {
            console.warn(`[API Tap Webhook] Order not found for dbLogId ${effectiveDbLogId} for final processing.`);
            await client.query('ROLLBACK');
            return res.status(200).send('Webhook processed: Order not found for final processing.');
        }
        const currentLogStatus = orderResult.rows[0].status;

        if (currentLogStatus === 'COMPLETED') {
            console.log(`[API Tap Webhook] Order ${effectiveDbLogId} (Charge: ${gatewayChargeId}) is already COMPLETED. Ignoring webhook.`);
            await client.query('ROLLBACK');
            return res.status(200).send('Webhook processed: Order already completed.');
        }

        if (gatewayChargeStatus === 'CAPTURED' || gatewayChargeStatus === 'PAID') {
            const updateUserBalanceSql = `
                UPDATE users SET games_balance = games_balance + $1, updated_at = NOW()
                WHERE firebase_uid = $2 RETURNING games_balance;
            `;
            const balanceUpdateResult = await client.query(updateUserBalanceSql, [effectiveGamesToGrant, effectiveFirebaseUid]);

            if (balanceUpdateResult.rowCount === 0) {
                console.error(`[API Tap Webhook] User ${effectiveFirebaseUid} not found for balance update. Charge: ${gatewayChargeId}`);
                await client.query(
                    "UPDATE payment_logs SET status = 'ERROR_USER_NOT_FOUND_COMPLETION', gateway_response_webhook = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                    [webhookData, `User ${effectiveFirebaseUid} not found for balance update.`, effectiveDbLogId]
                );
                await client.query('COMMIT'); 
                return res.status(200).send('Webhook processed: User not found for balance update.');
            }
            const newBalance = balanceUpdateResult.rows[0].games_balance;

            await client.query(
                "UPDATE payment_logs SET status = 'COMPLETED', gateway_payment_id_webhook = $1, gateway_response_webhook = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3",
                [gatewayChargeId, webhookData, effectiveDbLogId]
            );
            await client.query('COMMIT');
            console.log(`[API Tap Webhook] Games granted successfully. dbLogId: ${effectiveDbLogId}, Charge: ${gatewayChargeId}. User ${effectiveFirebaseUid} balance now ${newBalance}.`);
            res.status(200).send('Webhook processed successfully and games granted.');
        } else {
            const failureStatusForLog = `FAILED_GATEWAY_WEBHOOK_${gatewayChargeStatus.toUpperCase()}`;
            await client.query(
                "UPDATE payment_logs SET status = $1, gateway_payment_id_webhook = $2, gateway_response_webhook = $3, error_message = $4, updated_at = NOW() WHERE id = $5 AND status <> 'COMPLETED'",
                [failureStatusForLog, gatewayChargeId, webhookData, `Tap Webhook Status: ${gatewayChargeStatus}`, effectiveDbLogId]
            );
            await client.query('COMMIT');
            console.log(`[API Tap Webhook] Payment status logged as ${failureStatusForLog}. dbLogId: ${effectiveDbLogId}, Charge: ${gatewayChargeId}.`);
            res.status(200).send('Webhook processed: Payment not successful or in other state.');
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error(`[API Tap Webhook] Critical error processing webhook for Charge ID ${gatewayChargeId} (Log ID: ${effectiveDbLogId}):`, error.stack);
        res.status(200).send('Webhook received but internal server error occurred during processing.');
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
