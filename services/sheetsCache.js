/**
 * Sheets Caching Layer
 * In-memory cache with TTL to reduce API calls
 */

const NodeCache = require('node-cache');

// Cache with default 5-minute TTL and cleanup every 2 minutes
const cache = new NodeCache({
    stdTTL: 300,        // 5 minutes default
    checkperiod: 120,   // Check for expired keys every 2 minutes
    useClones: false    // Don't clone objects (faster, but mutate carefully)
});

/**
 * Get cached value or fetch and cache
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function to fetch data if cache miss
 * @param {number} ttl - TTL in seconds (default: 300)
 * @returns {Promise<*>} - Cached or fetched data
 */
async function getCached(key, fetcher, ttl = 300) {
    const hit = cache.get(key);
    if (hit !== undefined) {
        console.log(`[CACHE] Hit: ${key}`);
        return hit;
    }

    console.log(`[CACHE] Miss: ${key} → fetching...`);
    const startTime = Date.now();

    const data = await fetcher();

    cache.set(key, data, ttl);
    console.log(`[CACHE] Cached ${key} (${Date.now() - startTime}ms, TTL: ${ttl}s)`);

    return data;
}

/**
 * Invalidate cache keys by prefix
 * @param {string} prefix - Key prefix to invalidate
 */
function invalidate(prefix) {
    const keys = cache.keys().filter(k => k.startsWith(prefix));
    for (const k of keys) {
        cache.del(k);
    }
    console.log(`[CACHE] Invalidated ${keys.length} keys with prefix: ${prefix}`);
}

/**
 * Get all cache keys (for monitoring)
 * @returns {string[]} - Array of cache keys
 */
function getKeys() {
    return cache.keys();
}

/**
 * Get cache statistics
 * @returns {Object} - { hits, misses, keys, ksize, vsize }
 */
function getStats() {
    const stats = cache.getStats();
    return {
        hits: stats.hits,
        misses: stats.misses,
        keys: stats.keys,
        ksize: stats.ksize,
        vsize: stats.vsize
    };
}

/**
 * Clear all cache
 */
function clearAll() {
    cache.flushAll();
    console.log('[CACHE] Cleared all entries');
}

module.exports = {
    getCached,
    invalidate,
    getKeys,
    getStats,
    clearAll,
    cache // Expose for direct access if needed
};
