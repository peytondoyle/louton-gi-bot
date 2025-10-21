const sqlite = require('./sqliteBridge'); // Assuming sqliteBridge is available
const TTL_SECONDS = 2 * 60; // 2 minutes

/**
 * Generates a unique key for a pending context based on Discord message details.
 * @param {import('discord.js').Message} message - The Discord message object or a context object with message-like properties.
 * @returns {string} A unique key string.
 */
function keyFrom(message) {
    try {
        if (!message || !message.author || !message.channel) {
            console.error('[PENDING] Invalid message object provided to keyFrom');
            return null;
        }
        
        const userId = message.author.id;
        const channelId = message.channel.id;
        const guildId = message.guild ? message.guild.id : 'dm';
        return `pending:${guildId}:${channelId}:${userId}`;
    } catch (error) {
        console.error('[PENDING] Error generating key from message:', error);
        return null;
    }
}

/**
 * Retrieves a pending context.
 * @param {string} key - The key for the pending context.
 * @returns {Promise<object|null>} The pending context object or null if not found or expired.
 */
async function get(key) {
    try {
        const record = await sqlite.get(key);
        if (!record) return null;
        
        // Additional expiration check for edge cases
        if (record.expiresAt && Date.now() > record.expiresAt) {
            console.log('[PENDING] Context expired, cleaning up:', key);
            await clear(key); // Clean up expired record
            return null;
        }
        
        return record;
    } catch (error) {
        console.error('[PENDING] Error retrieving pending context:', error);
        return null; // Gracefully handle database errors
    }
}

/**
 * Soft-extend read that extends TTL if near expiry
 * @param {string} key - The key for the pending context.
 * @param {number} minMs - Minimum milliseconds remaining before extending (default: 10,000)
 * @param {number} extendMs - Milliseconds to extend by (default: 60,000)
 * @returns {Promise<object|null>} The pending context payload or null if not found or expired.
 */
async function getSoft(key, minMs = 10_000, extendMs = 60_000) {
    try {
        const record = await sqlite.get(key);
        if (!record) return null;
        
        const now = Date.now();
        if (record.expiresAt && now > record.expiresAt) {
            console.log('[PENDING] Context expired, cleaning up:', key);
            await clear(key);
            return null;
        }
        
        // Soft extend if near expiry
        if (record.expiresAt && (record.expiresAt - now) < minMs) {
            record.expiresAt += extendMs;
            console.log(`[PENDING] Soft-extended TTL for key: ${key}, new expiry: ${new Date(record.expiresAt).toISOString()}`);
            // Update the record in storage
            await sqlite.set(key, record, Math.floor((record.expiresAt - now) / 1000));
        }
        
        return record.payload || record;
    } catch (error) {
        console.error('[PENDING] Error in getSoft:', error);
        return null;
    }
}

/**
 * Sets or updates a pending context.
 * @param {string} key - The key for the pending context.
 * @param {object} payload - The data to store for the pending context.
 * @param {number} ttlSeconds - Time-to-live in seconds.
 * @returns {Promise<boolean>} True if successful, false if failed.
 */
async function set(key, payload, ttlSeconds = TTL_SECONDS) {
    try {
        // Validate inputs
        if (!key || !payload) {
            console.error('[PENDING] Invalid key or payload provided');
            return false;
        }
        
        if (ttlSeconds <= 0) {
            console.error('[PENDING] Invalid TTL provided:', ttlSeconds);
            return false;
        }
        
        // Add expiration timestamp to payload for additional safety
        const enrichedPayload = {
            ...payload,
            expiresAt: Date.now() + (ttlSeconds * 1000),
            createdAt: Date.now()
        };
        
        await sqlite.set(key, enrichedPayload, ttlSeconds);
        return true;
    } catch (error) {
        console.error('[PENDING] Error setting pending context:', error);
        return false; // Gracefully handle database errors
    }
}

/**
 * Clears a pending context.
 * @param {string} key - The key for the pending context.
 * @returns {Promise<boolean>} True if successful, false if failed.
 */
async function clear(key) {
    try {
        await sqlite.del(key);
        return true;
    } catch (error) {
        console.error('[PENDING] Error clearing pending context:', error);
        return false; // Gracefully handle database errors
    }
}

// Background sweeper to clean up expired entries from sqliteBridge
setInterval(() => {
    try {
        sqlite.cleanup(); // No .catch() as it's not async
    } catch (error) {
        console.error('[PENDING] Error during cleanup:', error);
    }
}, 30 * 1000).unref(); // Run every 30 seconds, unref to not block process exit

/**
 * Checks if a pending context is expired
 * @param {object} context - The pending context object
 * @returns {boolean} True if expired, false otherwise
 */
function isExpired(context) {
    if (!context || !context.expiresAt) return false;
    return Date.now() > context.expiresAt;
}

/**
 * Gets the time remaining until expiration in seconds
 * @param {object} context - The pending context object
 * @returns {number} Seconds remaining, or 0 if expired
 */
function getTimeRemaining(context) {
    if (!context || !context.expiresAt) return 0;
    const remaining = Math.max(0, Math.floor((context.expiresAt - Date.now()) / 1000));
    return remaining;
}

module.exports = {
    keyFrom,
    get,
    getSoft,
    set,
    clear,
    isExpired,
    getTimeRemaining,
    TTL_SECONDS // Export TTL for consistency if needed elsewhere
};
