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
    // Adjusted for PostgreSQL syntax and data types
    // q_id can be UUID or SERIAL depending on how you generate it. Using TEXT for flexibility with UUIDs from app.
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
    // Adjusted for PostgreSQL syntax and data types
    // Using VARCHAR for code, and BOOLEAN for is_active
    const createPromoCodesTableSql = `
        CREATE TABLE IF NOT EXISTS promo_codes (
            code VARCHAR(50) PRIMARY KEY,    -- Promo code (consider making it case-insensitive at DB level if needed, or handle in app)
                                             -- PostgreSQL is case-sensitive by default for strings.
                                             -- To make it effectively case-insensitive for comparisons, you might use functions like LOWER() in queries.
                                             -- Or, store all codes in a consistent case (e.g., uppercase) from the application.
            type VARCHAR(20) NOT NULL CHECK(type IN ('percentage', 'free_games')), -- Type of promo
            value INTEGER NOT NULL,              -- Discount percentage or number of free games
            description TEXT,                    -- Optional description for admin
            is_active BOOLEAN NOT NULL DEFAULT TRUE -- TRUE for active, FALSE for inactive
            -- Consider adding:
            -- created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            -- expiry_date TIMESTAMP WITH TIME ZONE,
            -- max_uses INTEGER,
            -- current_uses INTEGER DEFAULT 0
        );
    `;

    // --- Users Table (Placeholder - you might need this for game balance sync from backend) ---
    // This is a basic example. You'll likely have more fields.
    const createUsersTableSql = `
        CREATE TABLE IF NOT EXISTS users (
            firebase_uid VARCHAR(255) PRIMARY KEY,
            email VARCHAR(255) UNIQUE,
            display_name VARCHAR(255),
            first_name VARCHAR(255),
            last_name VARCHAR(255),
            phone VARCHAR(50),
            photo_url TEXT,
            games_balance INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;
    // You might also want a trigger to update `updated_at` automatically.


    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start transaction

        await client.query(createQuestionsTableSql);
        console.log('Questions table checked/created successfully in PostgreSQL.');

        await client.query(createPromoCodesTableSql);
        console.log('Promo Codes table checked/created successfully in PostgreSQL.');

        // Example: Add an index for case-insensitive searching on promo_codes.code if you don't store them consistently cased
        // This is more advanced and might not be needed if your application layer handles case consistently.
        // await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code_lower_unique ON promo_codes (LOWER(code));');

        await client.query(createUsersTableSql); // Add users table if you plan to manage user profiles in backend
        console.log('Users table checked/created successfully in PostgreSQL.');


        await client.query('COMMIT'); // Commit transaction
    } catch (err) {
        await client.query('ROLLBACK'); // Rollback transaction on error
        console.error('Error initializing PostgreSQL tables:', err.message);
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