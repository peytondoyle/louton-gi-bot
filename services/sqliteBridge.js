/**
 * SQLite Persistent Cache Bridge
 * Optional: Survives restarts for frequently-accessed data
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file location
const DB_PATH = path.join(process.cwd(), '.data', 'cache.sqlite');

// Initialize database
let db = null;

/**
 * Initialize SQLite database
 */
function init() {
    try {
        // Ensure .data directory exists
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

        db = new Database(DB_PATH);

        // Create cache table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                expiry INTEGER NOT NULL
            )
        `).run();

        // Create index on expiry for fast cleanup
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_expiry ON cache(expiry)`).run();

        console.log(`[SQLITE] ✅ Initialized at ${DB_PATH}`);
    } catch (error) {
        console.error('[SQLITE] ❌ Failed to initialize:', error);
        db = null;
    }
}

/**
 * Set value in cache
 * @param {string} key - Cache key
 * @param {*} value - Value to cache (will be JSON stringified)
 * @param {number} ttlSec - TTL in seconds (default: 300)
 */
function set(key, value, ttlSec = 300) {
    if (!db) return;

    try {
        const expiry = Date.now() + (ttlSec * 1000);
        const valueStr = JSON.stringify(value);

        db.prepare(`REPLACE INTO cache (key, value, expiry) VALUES (?, ?, ?)`)
            .run(key, valueStr, expiry);

        console.log(`[SQLITE] Set ${key} (TTL: ${ttlSec}s)`);
    } catch (error) {
        console.error(`[SQLITE] Failed to set ${key}:`, error);
    }
}

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {*|null} - Cached value or null if expired/not found
 */
function get(key) {
    if (!db) return null;

    try {
        const row = db.prepare(`SELECT * FROM cache WHERE key = ?`).get(key);

        if (!row) {
            return null; // Cache miss
        }

        // Check expiry
        if (Date.now() > row.expiry) {
            // Expired - delete and return null
            db.prepare(`DELETE FROM cache WHERE key = ?`).run(key);
            console.log(`[SQLITE] Expired: ${key}`);
            return null;
        }

        console.log(`[SQLITE] Hit: ${key}`);
        return JSON.parse(row.value);
    } catch (error) {
        console.error(`[SQLITE] Failed to get ${key}:`, error);
        return null;
    }
}

/**
 * Delete key from cache
 * @param {string} key - Cache key
 */
function del(key) {
    if (!db) return;

    try {
        db.prepare(`DELETE FROM cache WHERE key = ?`).run(key);
        console.log(`[SQLITE] Deleted: ${key}`);
    } catch (error) {
        console.error(`[SQLITE] Failed to delete ${key}:`, error);
    }
}

/**
 * Cleanup expired entries
 * @returns {number} - Number of expired entries removed
 */
function cleanup() {
    if (!db) return 0;

    try {
        const result = db.prepare(`DELETE FROM cache WHERE expiry < ?`).run(Date.now());
        const deleted = result.changes;

        if (deleted > 0) {
            console.log(`[SQLITE] Cleaned up ${deleted} expired entries`);
        }

        return deleted;
    } catch (error) {
        console.error('[SQLITE] Cleanup failed:', error);
        return 0;
    }
}

/**
 * Get cache statistics
 * @returns {Object} - { totalKeys, size, oldestExpiry }
 */
function getStats() {
    if (!db) return { totalKeys: 0, size: 0, oldestExpiry: null };

    try {
        const totalKeys = db.prepare(`SELECT COUNT(*) as count FROM cache`).get().count;
        const size = fs.statSync(DB_PATH).size;
        const oldestRow = db.prepare(`SELECT MIN(expiry) as oldest FROM cache`).get();

        return {
            totalKeys,
            size: Math.round(size / 1024), // KB
            oldestExpiry: oldestRow?.oldest
        };
    } catch (error) {
        console.error('[SQLITE] Failed to get stats:', error);
        return { totalKeys: 0, size: 0, oldestExpiry: null };
    }
}

/**
 * Clear all cache entries
 */
function clearAll() {
    if (!db) return;

    try {
        db.prepare(`DELETE FROM cache`).run();
        console.log('[SQLITE] Cleared all entries');
    } catch (error) {
        console.error('[SQLITE] Failed to clear:', error);
    }
}

// Initialize on module load
init();

// Cleanup expired entries every 5 minutes
setInterval(cleanup, 5 * 60 * 1000);

module.exports = {
    set,
    get,
    del,
    cleanup,
    getStats,
    clearAll
};
