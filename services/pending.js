const sqlite = require('./sqliteBridge'); // Assuming sqliteBridge is available
const TTL_SECONDS = 2 * 60; // 2 minutes

/**
 * Generates a unique key for a pending context based on Discord message details.
 * @param {import('discord.js').Message} message - The Discord message object or a context object with message-like properties.
 * @returns {string} A unique key string.
 */
function keyFrom(message) {
    const userId = message.author.id;
    const channelId = message.channel.id;
    const guildId = message.guild ? message.guild.id : 'dm';
    return `pending:${guildId}:${channelId}:${userId}`;
}

/**
 * Retrieves a pending context.
 * @param {string} key - The key for the pending context.
 * @returns {Promise<object|null>} The pending context object or null if not found or expired.
 */
async function get(key) {
    const record = await sqlite.get(key);
    return record; // sqlite.get should already handle expired records based on TTL
}

/**
 * Sets or updates a pending context.
 * @param {string} key - The key for the pending context.
 * @param {object} payload - The data to store for the pending context.
 * @param {number} ttlSeconds - Time-to-live in seconds.
 */
async function set(key, payload, ttlSeconds = TTL_SECONDS) {
    await sqlite.set(key, payload, ttlSeconds);
}

/**
 * Clears a pending context.
 * @param {string} key - The key for the pending context.
 */
async function clear(key) {
    await sqlite.del(key);
}

// Background sweeper to clean up expired entries from sqliteBridge
setInterval(() => {
    sqlite.cleanup(); // No .catch() as it's not async
}, 30 * 1000).unref(); // Run every 30 seconds, unref to not block process exit

module.exports = {
    keyFrom,
    get,
    set,
    clear,
    TTL_SECONDS // Export TTL for consistency if needed elsewhere
};
