// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// --- تهيئة SendGrid ---
const sgMail = require('@sendgrid/mail');
if (process.env.SENDGRID_API_KEY && !process.env.SENDGRID_API_KEY.includes('DUMMY')) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('[SendGrid] SDK initialized with API key from environment.');
} else {
    console.warn("[SendGrid] SENDGRID_API_KEY is not set or is a dummy value. Email sending will be disabled.");
}

// --- إعدادات Tap Payments (يتم تحميلها من ملف .env) ---
const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY;
const TAP_API_BASE_URL = process.env.TAP_API_BASE_URL || 'https://api.tap.company/v2';

const APP_FRONTEND_URL = process.env.APP_FRONTEND_URL || 'https://rehlagame.com';
const BACKEND_URL_FOR_WEBHOOKS = process.env.BACKEND_URL;

// التحقق من المفاتيح الأساسية عند بدء التشغيل
if (!TAP_SECRET_KEY || TAP_SECRET_KEY.includes('DUMMYKEY')) {
    console.error("خطأ فادح: TAP_SECRET_KEY (الاختباري) غير مهيأ بشكل صحيح في متغيرات البيئة!");
}
if (!BACKEND_URL_FOR_WEBHOOKS) {
    console.warn("تحذير: BACKEND_URL غير مهيأ. عنوان URL للـ Webhook قد يكون غير صحيح.");
}

function formatAmountForHashing(amount, currency) {
    const currencyDecimals = { KWD: 3, BHD: 3, OMR: 3, SAR: 2, AED: 2, QAR: 2, USD: 2, EUR: 2, GBP: 2, EGP: 2 };
    const decimals = currencyDecimals[currency.toUpperCase()] !== undefined ? currencyDecimals[currency.toUpperCase()] : 2;
    return parseFloat(amount).toFixed(decimals);
}

// --- دالة إرسال الإيميل عبر SendGrid ---
async function sendPurchaseEmail(to, subject, htmlContent) {
    if (!process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY.includes('DUMMY') || !process.env.SENDER_EMAIL) {
        console.log(`[Email Sending SKIPPED] SENDGRID_API_KEY or SENDER_EMAIL not configured. To: ${to}, Subject: ${subject}`);
        return; // لا تحاول الإرسال إذا لم يتم تكوين المفتاح أو بريد المرسل
    }
    const msg = {
        to: to,
        from: {
            email: process.env.SENDER_EMAIL,
            name: 'لعبة رحلة' // اسم المرسل الذي سيظهر
        },
        subject: subject,
        html: htmlContent,
    };
    try {
        await sgMail.send(msg);
        console.log(`[Payment Email] Email sent successfully to ${to} with subject: "${subject}"`);
    } catch (error) {
        console.error(`[Payment Email] Error sending email to ${to} with subject "${subject}":`, error.toString());
        if (error.response && error.response.body && error.response.body.errors) {
            console.error("[SendGrid Error Details]:", JSON.stringify(error.response.body.errors, null, 2));
        } else if (error.response) {
            console.error("[SendGrid Error Response]:", error.response.body);
        }
    }
}


// ===== POST /api/payment/initiate-tap-payment =====
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

    let client;
    try {
        client = await pool.connect();
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
            receipt: { email: !!customerEmail, sms: false },
            customer: {
                first_name: (customerName ? customerName.split(' ')[0] : (req.user.name ? req.user.name.split(' ')[0] : 'Rehla')).substring(0, 30),
                email: customerEmail || req.user.email,
            },
            source: { id: "src_all" },
            post: { url: `${BACKEND_URL_FOR_WEBHOOKS}/api/payment/webhook/tap` },
            redirect: { url: `${BACKEND_URL_FOR_WEBHOOKS}/api/payment/payment-callback?localInvoiceId=${localInvoiceId}&dbLogId=${dbLogId}` }
        };

        const tapHeaders = { 'Authorization': `Bearer ${TAP_SECRET_KEY}`, 'Content-Type': 'application/json', 'lang_code': 'ar' };
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
        if (client) { try { await client.query('ROLLBACK'); } catch (rbError) { console.error('[API /initiate-tap-payment] Rollback error:', rbError); } }
        const errorMsg = error.response?.data?.errors?.[0]?.description || error.response?.data?.response?.message || error.message || "خطأ غير معروف في الخادم.";
        console.error('[API /initiate-tap-payment] Critical error:', errorMsg, error.stack);
        next(error);
    } finally {
        if (client) client.release();
    }
});

// ===== GET /api/payment/payment-callback =====
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
    let client;

    try {
        client = await pool.connect();
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
    console.log('\n============================================================');
    console.log('[API Tap Webhook] <<<<< WEBHOOK RECEIVED >>>>>');
    console.log('[API Tap Webhook] Timestamp:', new Date().toISOString());
    console.log('[API Tap Webhook] ALL INCOMING HEADERS:', JSON.stringify(req.headers, null, 2));

    const webhookData = req.body;
    const receivedHashstring = req.headers['hashstring'];

    console.log(`[API Tap Webhook] Parsed Body:`, JSON.stringify(webhookData, null, 2));
    console.log(`[API Tap Webhook] Hashstring from header: "${receivedHashstring}"`);

    if (!TAP_SECRET_KEY || TAP_SECRET_KEY.includes('DUMMYKEY')) {
        console.error("[API Tap Webhook] CRITICAL: TAP_SECRET_KEY is not properly configured. Cannot verify webhook. REJECTING.");
        return res.status(500).send('Webhook configuration error (missing secret key).');
    }

    if (!receivedHashstring) {
        console.warn('[API Tap Webhook] WARNING: "hashstring" header missing. Cannot verify. REJECTING.');
        return res.status(400).send('Missing hashstring header.');
    }

    let id, amount, currency, gateway_reference, payment_reference, status, created_timestamp;
    if (webhookData.object === 'charge') {
        id = webhookData.id;
        amount = webhookData.amount;
        currency = webhookData.currency;
        gateway_reference = webhookData.reference?.gateway;
        payment_reference = webhookData.reference?.payment;
        status = webhookData.status;
        created_timestamp = webhookData.transaction?.created;
        console.log('[API Tap Webhook] Extracted fields for hashstring:');
        console.log(`  id: ${id}, amount: ${amount}, currency: ${currency}, gateway_ref: ${gateway_reference}, payment_ref: ${payment_reference}, status: ${status}, created: ${created_timestamp}`);
    } else {
        console.warn(`[API Tap Webhook] Received webhook for unhandled object type: ${webhookData.object}. REJECTING.`);
        return res.status(400).send(`Unhandled webhook object type: ${webhookData.object}`);
    }

    if ([id, amount, currency, status, created_timestamp].some(val => val === undefined || val === null) ||
        (webhookData.object === 'charge' && (gateway_reference === undefined || payment_reference === undefined))) {
        console.error('[API Tap Webhook] CRITICAL: Missing one or more required fields for hashstring calculation from webhook body. REJECTING.');
        return res.status(400).send('Webhook body missing required fields for hashstring.');
    }

    const formattedAmount = formatAmountForHashing(amount, currency);
    const toBeHashedString = `x_id${id}x_amount${formattedAmount}x_currency${currency}x_gateway_reference${gateway_reference}x_payment_reference${payment_reference}x_status${status}x_created${created_timestamp}`;
    console.log(`[API Tap Webhook] String to be hashed: "${toBeHashedString}"`);

    try {
        const calculatedHashstring = crypto
            .createHmac('sha256', TAP_SECRET_KEY)
            .update(toBeHashedString)
            .digest('hex');
        console.log(`[API Tap Webhook] Calculated hashstring: "${calculatedHashstring}"`);

        if (calculatedHashstring !== receivedHashstring) {
            console.warn('[API Tap Webhook] SECURITY ALERT: Invalid hashstring. Potential tampering or configuration error.');
            console.warn(`  Received:   "${receivedHashstring}"`);
            console.warn(`  Calculated: "${calculatedHashstring}"`);
            console.warn(`  Secret Key (first 5 chars): ${TAP_SECRET_KEY.substring(0,5)}...`);
            return res.status(403).send('Invalid hashstring.');
        }
        console.log('[API Tap Webhook] SUCCESS: Hashstring verified successfully.');
    } catch (sigError) {
        console.error('[API Tap Webhook] CRITICAL ERROR during hashstring verification process:', sigError.message, sigError.stack);
        return res.status(500).send('Error during hashstring verification process.');
    }

    const gatewayChargeId = webhookData.id;
    const gatewayChargeStatus = webhookData.status;
    const metadata = webhookData.metadata || {};
    const dbLogIdFromMeta = metadata.db_log_id;
    const firebaseUidFromMeta = metadata.firebase_uid;
    const gamesFromMeta = metadata.games ? parseInt(metadata.games, 10) : null;

    console.log(`[API Tap Webhook] PROCESSING charge ID: ${gatewayChargeId}, Status: ${gatewayChargeStatus}`);
    console.log(`[API Tap Webhook] Metadata from webhook: dbLogId=${dbLogIdFromMeta}, uid=${firebaseUidFromMeta}, games=${gamesFromMeta}`);

    let effectiveDbLogId = dbLogIdFromMeta;
    let effectiveFirebaseUid = firebaseUidFromMeta;
    let effectiveGamesToGrant = gamesFromMeta;
    let client;

    try {
        console.log('[API Tap Webhook] Attempting to connect to DB pool...');
        client = await pool.connect();
        console.log('[API Tap Webhook] SUCCESS: Connected to DB pool.');

        if (!effectiveDbLogId || !effectiveFirebaseUid || typeof effectiveGamesToGrant !== 'number') {
            console.log(`[API Tap Webhook] Metadata incomplete or invalid. Attempting DB lookup for charge ID: ${gatewayChargeId}`);
            const logRes = await client.query(
                'SELECT id, user_firebase_uid, games_in_package FROM payment_logs WHERE gateway_invoice_id = $1 ORDER BY created_at DESC LIMIT 1',
                [gatewayChargeId]
            );
            console.log(`[API Tap Webhook] DB Lookup for log by gateway_invoice_id result rows: ${logRes.rows.length}`);
            if (logRes.rows.length > 0) {
                effectiveDbLogId = logRes.rows[0].id;
                effectiveFirebaseUid = logRes.rows[0].user_firebase_uid;
                effectiveGamesToGrant = parseInt(logRes.rows[0].games_in_package, 10);
                console.log(`[API Tap Webhook] SUCCESS: Found log from DB - dbLogId=${effectiveDbLogId}, uid=${effectiveFirebaseUid}, games=${effectiveGamesToGrant}`);
            } else {
                console.warn(`[API Tap Webhook] WARNING: No payment_log found for gateway_invoice_id: ${gatewayChargeId}. Cannot process webhook further.`);
                return res.status(200).send('Webhook processed: Log entry not found for this charge ID, cannot fulfill.');
            }
        }

        if (!effectiveDbLogId || !effectiveFirebaseUid || typeof effectiveGamesToGrant !== 'number' || effectiveGamesToGrant <= 0) {
            console.error(`[API Tap Webhook] CRITICAL: Invalid or incomplete log data after lookup. dbLogId: ${effectiveDbLogId}, uid: ${effectiveFirebaseUid}, games: ${effectiveGamesToGrant}.`);
            if(effectiveDbLogId) {
                await client.query(
                    "UPDATE payment_logs SET status = 'ERROR_INVALID_LOG_DATA_WEBHOOK', gateway_response_webhook = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                    [webhookData, `Invalid log data. DBLogID: ${effectiveDbLogId}, UID: ${effectiveFirebaseUid}, Games: ${effectiveGamesToGrant}`, effectiveDbLogId]
                ).catch(e => console.error("[API Tap Webhook] DB Error updating log for invalid data:", e.message));
            }
            return res.status(200).send('Webhook processed: Invalid log data associated with this charge.');
        }

        console.log(`[API Tap Webhook] Attempting to BEGIN transaction for dbLogId: ${effectiveDbLogId}`);
        await client.query('BEGIN');
        console.log('[API Tap Webhook] SUCCESS: Transaction BEGAN.');

        console.log(`[API Tap Webhook] DB Query: SELECT status FROM payment_logs WHERE id = ${effectiveDbLogId} FOR UPDATE`);
        const orderResult = await client.query(
            "SELECT status FROM payment_logs WHERE id = $1 FOR UPDATE",
            [effectiveDbLogId]
        );
        console.log(`[API Tap Webhook] DB Query for order status (dbLogId ${effectiveDbLogId}) result rows: ${orderResult.rows.length}`);

        if (orderResult.rows.length === 0) {
            console.warn(`[API Tap Webhook] WARNING: Order not found for dbLogId ${effectiveDbLogId} for final processing. ROLLING BACK.`);
            await client.query('ROLLBACK');
            console.log('[API Tap Webhook] Transaction ROLLED BACK.');
            return res.status(200).send('Webhook processed: Order not found for final processing.');
        }
        const currentLogStatus = orderResult.rows[0].status;
        console.log(`[API Tap Webhook] Current log status for dbLogId ${effectiveDbLogId}: ${currentLogStatus}`);

        if (currentLogStatus === 'COMPLETED') {
            console.log(`[API Tap Webhook] INFO: Order ${effectiveDbLogId} (Charge: ${gatewayChargeId}) is already COMPLETED. Ignoring webhook. ROLLING BACK (no changes needed).`);
            await client.query('ROLLBACK');
            console.log('[API Tap Webhook] Transaction ROLLED BACK.');
            return res.status(200).send('Webhook processed: Order already completed.');
        }

        if (gatewayChargeStatus === 'CAPTURED' || gatewayChargeStatus === 'PAID') {
            console.log(`[API Tap Webhook] Charge status is ${gatewayChargeStatus}. Attempting to update user balance for UID: ${effectiveFirebaseUid}, Games: ${effectiveGamesToGrant}`);
            const updateUserBalanceSql = `
                UPDATE users SET games_balance = games_balance + $1, updated_at = NOW()
                WHERE firebase_uid = $2 RETURNING games_balance, email, display_name;
            `; // جلب الإيميل والاسم أيضًا
            const balanceUpdateResult = await client.query(updateUserBalanceSql, [effectiveGamesToGrant, effectiveFirebaseUid]);
            console.log(`[API Tap Webhook] DB Query for user balance update (UID ${effectiveFirebaseUid}) result rowCount: ${balanceUpdateResult.rowCount}`);

            if (balanceUpdateResult.rowCount === 0) {
                console.error(`[API Tap Webhook] ERROR: User ${effectiveFirebaseUid} not found for balance update. Charge: ${gatewayChargeId}.`);
                await client.query(
                    "UPDATE payment_logs SET status = 'ERROR_USER_NOT_FOUND_COMPLETION', gateway_response_webhook = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
                    [webhookData, `User ${effectiveFirebaseUid} not found for balance update.`, effectiveDbLogId]
                );
                console.log('[API Tap Webhook] DB: payment_logs updated to ERROR_USER_NOT_FOUND_COMPLETION.');
                await client.query('COMMIT');
                console.log('[API Tap Webhook] Transaction COMMITTED with error status.');
                return res.status(200).send('Webhook processed: User not found for balance update.');
            }
            const newBalance = balanceUpdateResult.rows[0].games_balance;
            const userEmailForReceipt = balanceUpdateResult.rows[0].email;
            const userDisplayNameForReceipt = balanceUpdateResult.rows[0].display_name || 'عميلنا العزيز';

            console.log(`[API Tap Webhook] SUCCESS: User balance updated. New balance for ${effectiveFirebaseUid}: ${newBalance}`);

            console.log(`[API Tap Webhook] Attempting to update payment_logs to COMPLETED for dbLogId: ${effectiveDbLogId}`);
            await client.query(
                "UPDATE payment_logs SET status = 'COMPLETED', gateway_payment_id_webhook = $1, gateway_response_webhook = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3",
                [gatewayChargeId, webhookData, effectiveDbLogId]
            );
            console.log('[API Tap Webhook] SUCCESS: payment_logs updated to COMPLETED.');
            await client.query('COMMIT'); // COMMIT التغييرات في قاعدة البيانات هنا
            console.log('[API Tap Webhook] SUCCESS: Transaction COMMITTED for COMPLETED payment.');

            // --- إرسال الإيميلات بعد تأكيد حفظ التغييرات في قاعدة البيانات ---
            const customerEmail = webhookData.customer?.email || userEmailForReceipt;
            const customerName = webhookData.customer?.first_name || userDisplayNameForReceipt;
            const packageName = webhookData.metadata?.package || 'باقة ألعاب رحلة';
            const gamesGranted = effectiveGamesToGrant;
            const amountPaid = webhookData.amount;
            const currencyPaid = webhookData.currency;
            const paymentReference = webhookData.id; // هو نفسه gatewayChargeId
            const transactionDate = new Date(webhookData.transaction.created * 1000).toLocaleString('ar-KW-u-nu-latn', { dateStyle: 'full', timeStyle: 'short' });

            if (customerEmail) {
                const customerSubject = `✅ تأكيد شراء باقة ألعاب رحلة - طلب رقم ${paymentReference}`;
                const customerHtml = `
                    <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right; padding: 20px; border: 1px solid #eee; border-radius: 5px; max-width: 600px; margin: auto;">
                        <h2 style="color: #17a2b8;">أهلاً ${customerName}،</h2>
                        <p>شكراً لشرائك من لعبة رحلة! تم بنجاح إضافة الألعاب إلى حسابك.</p>
                        <h3 style="color: #138496;">تفاصيل الطلب:</h3>
                        <ul style="list-style-type: none; padding-right: 0;">
                            <li><strong>رقم المرجع:</strong> ${paymentReference}</li>
                            <li><strong>الباقة:</strong> ${packageName}</li>
                            <li><strong>عدد الألعاب المضافة:</strong> ${gamesGranted}</li>
                            <li><strong>المبلغ المدفوع:</strong> ${formatAmountForHashing(amountPaid, currencyPaid)} ${currencyPaid.toUpperCase()}</li>
                            <li><strong>تاريخ العملية:</strong> ${transactionDate}</li>
                        </ul>
                        <p>رصيدك الحالي من الألعاب هو: <strong>${newBalance}</strong> ${newBalance === 1 ? 'لعبة' : (newBalance === 2 ? 'لعبتين' : `${newBalance} ألعاب`)}.</p>
                        <p style="margin-top: 20px;">يمكنك الآن الاستمتاع باللعب! <a href="${APP_FRONTEND_URL}/game.html" style="color: #ffc107; text-decoration: none; font-weight: bold;">ابدأ اللعب الآن</a>.</p>
                        <p style="margin-top: 30px; font-size: 0.9em; color: #777;">مع تحيات،<br>فريق لعبة رحلة</p>
                    </div>`;
                await sendPurchaseEmail(customerEmail, customerSubject, customerHtml);
            } else {
                console.warn(`[API Tap Webhook] Customer email not found for charge ${gatewayChargeId}, cannot send receipt to customer.`);
            }

            if (process.env.ADMIN_EMAIL_RECIPIENT) {
                const adminSubject = `تنبيه: عملية شراء جديدة #${paymentReference} في لعبة رحلة`;
                const adminHtml = `
                    <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
                        <h2>عملية شراء جديدة في لعبة رحلة:</h2>
                        <ul style="list-style-type: none; padding-right: 0;">
                            <li><strong>العميل:</strong> ${customerName} (${customerEmail || 'لا يوجد بريد للعميل'})</li>
                            <li><strong>معرف المستخدم (Firebase):</strong> ${effectiveFirebaseUid}</li>
                            <li><strong>رقم مرجع Tap:</strong> ${paymentReference}</li>
                            <li><strong>الباقة:</strong> ${packageName}</li>
                            <li><strong>عدد الألعاب:</strong> ${gamesGranted}</li>
                            <li><strong>المبلغ:</strong> ${formatAmountForHashing(amountPaid, currencyPaid)} ${currencyPaid.toUpperCase()}</li>
                            <li><strong>تاريخ العملية:</strong> ${transactionDate}</li>
                            <li><strong>رصيد المستخدم الجديد:</strong> ${newBalance}</li>
                            <li><strong>DB Log ID:</strong> ${effectiveDbLogId}</li>
                        </ul>
                    </div>`;
                await sendPurchaseEmail(process.env.ADMIN_EMAIL_RECIPIENT, adminSubject, adminHtml);
            }
            // --- نهاية إرسال الإيميلات ---

            console.log(`[API Tap Webhook] <<<<< WEBHOOK PROCESSING ENDED SUCCESSFULLY (GAMES GRANTED & EMAILS SCHEDULED) for dbLogId: ${effectiveDbLogId} >>>>>`);
            res.status(200).send('Webhook processed successfully and games granted.');

        } else {
            const failureStatusForLog = `FAILED_GATEWAY_WEBHOOK_${gatewayChargeStatus.toUpperCase()}`;
            console.log(`[API Tap Webhook] Charge status is ${gatewayChargeStatus}. Updating payment_logs to ${failureStatusForLog} for dbLogId: ${effectiveDbLogId}`);
            await client.query(
                "UPDATE payment_logs SET status = $1, gateway_payment_id_webhook = $2, gateway_response_webhook = $3, error_message = $4, updated_at = NOW() WHERE id = $5 AND status <> 'COMPLETED'",
                [failureStatusForLog, gatewayChargeId, webhookData, `Tap Webhook Status: ${gatewayChargeStatus}`, effectiveDbLogId]
            );
            console.log(`[API Tap Webhook] SUCCESS: payment_logs updated to ${failureStatusForLog}.`);
            await client.query('COMMIT');
            console.log('[API Tap Webhook] SUCCESS: Transaction COMMITTED for FAILED_GATEWAY_WEBHOOK status.');
            console.log(`[API Tap Webhook] <<<<< WEBHOOK PROCESSING ENDED (NON-CAPTURED STATUS) for dbLogId: ${effectiveDbLogId} >>>>>`);
            res.status(200).send('Webhook processed: Payment not successful or in other state.');
        }
    } catch (error) {
        console.error(`[API Tap Webhook] CRITICAL ERROR during DB operations for Charge ID ${gatewayChargeId} (Log ID: ${effectiveDbLogId || 'N/A'}):`, error.message, error.stack);
        if (client) {
            console.log('[API Tap Webhook] Attempting to ROLLBACK transaction due to caught error...');
            try {
                await client.query('ROLLBACK');
                console.log('[API Tap Webhook] SUCCESS: Transaction ROLLED BACK after error.');
            } catch (rbError) {
                console.error('[API Tap Webhook] CRITICAL ERROR during ROLLBACK attempt:', rbError.message, rbError.stack);
            }
        }
        console.log('[API Tap Webhook] <<<<< WEBHOOK PROCESSING FAILED (INTERNAL ERROR) >>>>>');
        res.status(500).send('Webhook received but internal server error occurred during processing.');
    } finally {
        if (client) {
            console.log(`[API Tap Webhook] Releasing DB client for dbLogId: ${effectiveDbLogId || 'N/A'}...`);
            client.release();
            console.log('[API Tap Webhook] SUCCESS: DB client released.');
        }
        console.log('============================================================\n');
    }
});

module.exports = router;
