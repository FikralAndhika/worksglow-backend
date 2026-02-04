const { Pool } = require('pg');
require('dotenv').config();

// Database connection pool with optimized settings for Neon
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false
    },
    // Connection pool settings optimized for Neon
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Return error after 5 seconds if connection unavailable
    maxUses: 7500, // Close and replace a connection after it has been used 7500 times
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

// Handle pool errors - don't exit process, just log
pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    // Removed process.exit(-1) to prevent server crash
});

// Helper function to execute queries with proper client release
const query = async (text, params) => {
    const client = await pool.connect();
    const start = Date.now();
    try {
        const res = await client.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    } finally {
        client.release(); // CRITICAL: Always release the client back to pool
    }
};

// Keepalive function to prevent connection timeout
const keepAlive = async () => {
    try {
        await pool.query('SELECT 1');
    } catch (err) {
        console.error('❌ Keepalive ping failed:', err.message);
    }
};

// Ping database every 50 seconds to keep connection alive
setInterval(keepAlive, 50000);

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, closing database pool...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, closing database pool...');
    await pool.end();
    process.exit(0);
});

module.exports = {
    pool,
    query
};