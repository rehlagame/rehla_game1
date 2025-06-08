// database/database.js
const { Pool } = require('pg'); // PostgreSQL client
const path = require('path');   // path module is not strictly needed here anymore
                                // as we'll use DATABASE_URL from environment variables.

// --- PostgreSQL Connection Pool ---
// Render will provide the DATABASE_URL in the environment.
// For local development, you might set it in a .env file (and use dotenv package)
// or set it directly in your environment.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, // Required for Render's managed DB
                                                                                        // Disable for local development if not using SSL.
});

pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database via pool.');
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    // process.exit(-1); // Optionally, exit if a critical error occurs
});


// --- Database Initialization ---
// This function will now ensure the tables exist in PostgreSQL.
// It's good practice to run migrations separately in a production environment,
// but for simplicity, we can keep it here for now.
async function initializeDatabase() {
    console.log("Initializing PostgreSQL database tables if they don't exist...");

    // --- Questions Table ---
    const createQuestionsTableSql = `
        CREATE TABLE IF NOT EXISTS questions (
            q_id VARCHAR(255) PRIMARY KEY,    -- Unique identifier (e.g., UUID as string)
            text TEXT NOT NULL,               -- Question text
            options_json JSONB,               -- Options stored as JSONB (more efficient for JSON in PG)
            correctAnswer TEXT NOT NULL,      -- The correct answer string
            difficulty VARCHAR(10) NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')), -- Difficulty level
            points INTEGER NOT NULL,          -- Points for the question
            landmark_name VARCHAR(255),       -- Associated landmark/area (can be NULL)
            is_general BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE for general, FALSE for specific landmark
            type VARCHAR(50) NOT NULL DEFAULT 'mcq', -- Question type
            image_filename VARCHAR(255),      -- Filename of the associated image (can be NULL)
            image_firebase_url TEXT           -- (NEW/RECOMMENDED) Store the full Firebase Storage URL here
        );
    `;

    // --- Promo Codes Table ---
    const createPromoCodesTableSql = `
        CREATE TABLE IF NOT EXISTS promo_codes (
            code VARCHAR(50) PRIMARY KEY,
            type VARCHAR(20) NOT NULL CHECK(type IN ('percentage', 'free_games')),
            value INTEGER NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            expiry_date TIMESTAMP WITH TIME ZONE,
            max_uses INTEGER,
            current_uses INTEGER DEFAULT 0
        );
    `;

    // --- Users Table ---
    const createUsersTableSql = `
        CREATE TABLE IF NOT EXISTS users (
            firebase_uid VARCHAR(255) PRIMARY KEY,
            email VARCHAR(255) UNIQUE,
            display_name VARCHAR(255),
            first_name VARCHAR(255),
            last_name VARCHAR(255),
            phone VARCHAR(50),
            photo_url TEXT,
            games_balance INTEGER DEFAULT 0 NOT NULL, -- Ensure games_balance is not null
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;

    // --- Payment Logs Table ---
    const createPaymentLogsTableSql = `
        CREATE TABLE IF NOT EXISTS payment_logs (
            id SERIAL PRIMARY KEY,
            user_firebase_uid VARCHAR(255) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE, -- Foreign key to users table
            local_invoice_id VARCHAR(255) UNIQUE, -- (اختياري) معرف فاتورة محلي فريد إذا كنت ستنشئه قبل بوابة الدفع
            amount DECIMAL(10, 3) NOT NULL, -- KWD uses 3 decimal places
            currency VARCHAR(3) NOT NULL,
            package_name VARCHAR(255),
            games_in_package INTEGER,
            promo_code_used VARCHAR(50) REFERENCES promo_codes(code), -- Foreign key to promo_codes table (optional)
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, USER_RETURNED_SUCCESS, USER_RETURNED_FAILURE, FAILED_AT_GATEWAY, COMPLETED, ERROR_PRE_GATEWAY, CANCELED
            gateway_name VARCHAR(50), -- e.g., 'MyFatoorah', 'UPayment'
            gateway_invoice_id VARCHAR(255), -- ID الفاتورة من بوابة الدفع عند الإنشاء
            gateway_payment_id_callback VARCHAR(255), -- ID الدفع المستلم في الـ callback
            gateway_payment_id_webhook VARCHAR(255), -- ID الدفع المستلم في الـ webhook
            gateway_response_initiation JSONB, -- استجابة بوابة الدفع الأولية
            gateway_response_callback JSONB, -- بيانات الـ callback
            gateway_response_webhook JSONB, -- بيانات الـ webhook
            error_message TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- To track status changes
            completed_at TIMESTAMP WITH TIME ZONE -- When payment is successfully confirmed and games granted
        );
    `;
    // Index for faster lookups on payment_logs
    const createPaymentLogsIndexesSql = `
        CREATE INDEX IF NOT EXISTS idx_payment_logs_user_firebase_uid ON payment_logs(user_firebase_uid);
        CREATE INDEX IF NOT EXISTS idx_payment_logs_gateway_invoice_id ON payment_logs(gateway_invoice_id);
        CREATE INDEX IF NOT EXISTS idx_payment_logs_local_invoice_id ON payment_logs(local_invoice_id);
        CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON payment_logs(status);
    `;

    // =================================================================================
    // === بداية التعديل: إضافة جدول تتبع استخدام أكواد الخصم ===
    // =================================================================================
    const createPromoUsageTableSql = `
        CREATE TABLE IF NOT EXISTS promo_code_usage (
            id SERIAL PRIMARY KEY,
            promo_code_used VARCHAR(50) NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
            user_firebase_uid VARCHAR(255) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
            used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (promo_code_used, user_firebase_uid)
        );
    `;
    // =================================================================================
    // === نهاية التعديل ===
    // =================================================================================

    // --- Trigger function to update 'updated_at' column ---
    const createUpdatedAtTriggerFunctionSql = `
      CREATE OR REPLACE FUNCTION trigger_set_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    // --- Apply trigger to 'users' table ---
    const createUsersUpdatedAtTriggerSql = `
      DROP TRIGGER IF EXISTS set_timestamp_users ON users;
      CREATE TRIGGER set_timestamp_users
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE PROCEDURE trigger_set_timestamp();
    `;

    // --- Apply trigger to 'payment_logs' table ---
    const createPaymentLogsUpdatedAtTriggerSql = `
      DROP TRIGGER IF EXISTS set_timestamp_payment_logs ON payment_logs;
      CREATE TRIGGER set_timestamp_payment_logs
      BEFORE UPDATE ON payment_logs
      FOR EACH ROW
      EXECUTE PROCEDURE trigger_set_timestamp();
    `;


    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start transaction

        await client.query(createQuestionsTableSql);
        console.log('Questions table checked/created successfully in PostgreSQL.');

        await client.query(createPromoCodesTableSql);
        console.log('Promo Codes table checked/created successfully in PostgreSQL.');

        await client.query(createUsersTableSql);
        console.log('Users table checked/created successfully in PostgreSQL.');

        await client.query(createPaymentLogsTableSql);
        console.log('Payment Logs table checked/created successfully in PostgreSQL.');

        await client.query(createPaymentLogsIndexesSql);
        console.log('Indexes for Payment Logs table checked/created successfully.');
        
        // --- (أضف هذا الاستدعاء الجديد) ---
        await client.query(createPromoUsageTableSql);
        console.log('Promo Code Usage table checked/created successfully.');
        // ------------------------------------

        // Create the trigger function first
        await client.query(createUpdatedAtTriggerFunctionSql);
        console.log('Updated_at trigger function checked/created successfully.');

        // Then apply it to tables
        await client.query(createUsersUpdatedAtTriggerSql);
        console.log('Updated_at trigger for Users table checked/created successfully.');

        await client.query(createPaymentLogsUpdatedAtTriggerSql);
        console.log('Updated_at trigger for Payment Logs table checked/created successfully.');

        await client.query('COMMIT'); // Commit transaction
    } catch (err) {
        await client.query('ROLLBACK'); // Rollback transaction on error
        console.error('Error initializing PostgreSQL tables:', err.message, err.stack);
        // Propagate the error to stop the server from starting if initialization fails critically
        throw err;
    } finally {
        client.release(); // Release the client back to the pool
    }
}

// Call initialization immediately.
// If it throws an error, the server startup might be affected, which is intended for critical setup.
initializeDatabase().catch(err => {
    console.error("Failed to initialize database. Server might not start correctly.", err);
    // process.exit(1); // Optionally, exit if DB initialization is critical for server start
});

// Export the pool for use in other modules
module.exports = pool;
