// LRU Cache for LLM Results
// Caches normalized user messages → LLM parse results
// TTL: 3 days, Max: 500 entries

const { LRUCache } = require('lru-cache');

// Create cache instance
const llmCache = new LRUCache({
    max: 500,                          // Maximum 500 cached entries
    ttl: 1000 * 60 * 60 * 24 * 3,     // 3 days in milliseconds
    updateAgeOnGet: true,              // Refresh TTL on cache hit
    updateAgeOnHas: false
});

module.exports = { llmCache };
