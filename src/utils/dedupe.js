/**
 * Message deduplication utility
 * Prevents duplicate logs from same user within 2-second window
 */

// Store recent messages: Map<idempotencyKey, timestamp>
const recentMessages = new Map();

// Cleanup interval (every 10 seconds)
const CLEANUP_INTERVAL_MS = 10000;
const DEDUPE_WINDOW_MS = 2000; // 2 seconds

/**
 * Normalize text for deduplication comparison
 * @param {string} text - Original message text
 * @returns {string} - Normalized text
 */
function normalizeText(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ');   // Normalize whitespace
}

/**
 * Generate idempotency key for message
 * @param {string} userId - Discord user ID
 * @param {string} text - Message text
 * @param {number} timestamp - Message timestamp in ms
 * @returns {string} - Idempotency key
 */
function generateKey(userId, text, timestamp) {
    const normText = normalizeText(text);
    // Round timestamp to 2-second buckets
    const roundedTs = Math.floor(timestamp / DEDUPE_WINDOW_MS) * DEDUPE_WINDOW_MS;
    return `${userId}|${normText}|${roundedTs}`;
}

/**
 * Check if message is a duplicate
 * @param {string} userId - Discord user ID
 * @param {string} text - Message text
 * @param {number} timestamp - Message timestamp in ms (default: now)
 * @returns {boolean} - True if duplicate, false otherwise
 */
function isDuplicate(userId, text, timestamp = Date.now()) {
    const key = generateKey(userId, text, timestamp);

    if (recentMessages.has(key)) {
        console.log(`[DEDUPE] ⏭️  Ignoring duplicate message: ${key}`);
        return true;
    }

    // Not a duplicate - add to recent messages
    recentMessages.set(key, timestamp);
    return false;
}

/**
 * Clean up old entries from the dedupe cache
 */
function cleanup() {
    const now = Date.now();
    const cutoff = now - (DEDUPE_WINDOW_MS * 2); // Keep 2x window for safety

    let removed = 0;
    for (const [key, timestamp] of recentMessages.entries()) {
        if (timestamp < cutoff) {
            recentMessages.delete(key);
            removed++;
        }
    }

    if (removed > 0) {
        console.log(`[DEDUPE] 🧹 Cleaned up ${removed} old entries (cache size: ${recentMessages.size})`);
    }
}

// Start cleanup interval
setInterval(cleanup, CLEANUP_INTERVAL_MS);

module.exports = {
    isDuplicate,
    normalizeText,
    generateKey,
    // Expose for testing
    _getCache: () => recentMessages,
    _clearCache: () => recentMessages.clear()
};
