// Context Memory: In-memory per-user rolling context tracker
// Tracks last N entries per user with TTL for empathetic follow-ups

const { UX } = require('../constants/ux');

// In-memory storage: userId -> { entries: [], warnings: Map }
const userContexts = new Map();

/**
 * Get or initialize context for a user
 * @param {string} userId - Discord user ID
 * @returns {Object} User context object
 */
function getContext(userId) {
    if (!userContexts.has(userId)) {
        userContexts.set(userId, {
            entries: [],
            warnings: new Map(), // trigger -> timestamp of last warning
            lastCleanup: Date.now()
        });
    }
    return userContexts.get(userId);
}

/**
 * Push a new entry to user's context memory
 * Keeps only last N entries (rolling window)
 *
 * @param {string} userId - Discord user ID
 * @param {Object} entry - Entry object
 * @param {string} entry.type - Entry type (food, drink, symptom, etc.)
 * @param {string} entry.details - Entry details/value
 * @param {string} entry.severity - Severity level (if applicable)
 * @param {number} entry.timestamp - Unix timestamp
 *
 * @example
 * push('12345', {
 *   type: 'symptom',
 *   details: 'reflux',
 *   severity: 'moderate',
 *   timestamp: Date.now()
 * })
 */
function push(userId, entry) {
    const context = getContext(userId);

    // Add timestamp if not provided
    if (!entry.timestamp) {
        entry.timestamp = Date.now();
    }

    // Add to front of array
    context.entries.unshift(entry);

    // Keep only last N entries
    if (context.entries.length > UX.CONTEXT_MEMORY_SIZE) {
        context.entries = context.entries.slice(0, UX.CONTEXT_MEMORY_SIZE);
    }

    // Cleanup expired data if needed
    cleanupExpired(userId);
}

/**
 * Get recent entries for a user
 * @param {string} userId - Discord user ID
 * @param {number} count - Number of entries to return (default: all)
 * @returns {Array} Recent entries, newest first
 *
 * @example
 * const recent = getRecent('12345', 2)
 * // Returns last 2 entries
 */
function getRecent(userId, count = null) {
    const context = getContext(userId);

    // Cleanup before returning
    cleanupExpired(userId);

    if (count) {
        return context.entries.slice(0, count);
    }
    return context.entries;
}

/**
 * Check if user has had multiple symptoms within a time window
 * Used to detect "rough patches"
 *
 * @param {string} userId - Discord user ID
 * @param {number} windowMs - Time window in milliseconds (default: 8 hours)
 * @param {number} threshold - Number of symptoms to trigger (default: 2)
 * @returns {boolean} True if rough patch detected
 */
function hasRoughPatch(userId, windowMs = UX.ROUGH_PATCH_WINDOW, threshold = 2) {
    const context = getContext(userId);
    const now = Date.now();

    const recentSymptoms = context.entries.filter(entry => {
        const isSymptom = entry.type === 'symptom' || entry.type === 'reflux';
        const isRecent = (now - entry.timestamp) <= windowMs;
        return isSymptom && isRecent;
    });

    return recentSymptoms.length >= threshold;
}

/**
 * Check if a warning for a trigger should be shown
 * Implements 24h cooldown to avoid spam
 *
 * @param {string} userId - Discord user ID
 * @param {string} trigger - Trigger name
 * @returns {boolean} True if warning should be shown
 */
function shouldWarn(userId, trigger) {
    const context = getContext(userId);
    const lastWarning = context.warnings.get(trigger);

    if (!lastWarning) return true;

    const timeSinceWarning = Date.now() - lastWarning;
    return timeSinceWarning > UX.WARNING_COOLDOWN;
}

/**
 * Record that a warning was shown for a trigger
 * @param {string} userId - Discord user ID
 * @param {string} trigger - Trigger name
 */
function recordWarning(userId, trigger) {
    const context = getContext(userId);
    context.warnings.set(trigger, Date.now());
}

/**
 * Dismiss/suppress warnings for a specific trigger
 * Same effect as recordWarning but semantically clear
 *
 * @param {string} userId - Discord user ID
 * @param {string} trigger - Trigger name
 */
function dismissWarning(userId, trigger) {
    recordWarning(userId, trigger);
}

/**
 * Clean up expired entries and warnings for a user
 * Removes entries older than TTL
 *
 * @param {string} userId - Discord user ID
 */
function cleanupExpired(userId) {
    const context = getContext(userId);
    const now = Date.now();

    // Only cleanup if it's been a while since last cleanup
    if (now - context.lastCleanup < 60000) return; // 1 minute

    // Remove entries older than TTL
    context.entries = context.entries.filter(entry => {
        return (now - entry.timestamp) <= UX.CONTEXT_MEMORY_TTL;
    });

    // Remove expired warnings
    for (const [trigger, timestamp] of context.warnings.entries()) {
        if (now - timestamp > UX.WARNING_COOLDOWN) {
            context.warnings.delete(trigger);
        }
    }

    context.lastCleanup = now;
}

/**
 * Clear all context for a user
 * Used for testing or user request
 *
 * @param {string} userId - Discord user ID
 */
function clear(userId) {
    userContexts.delete(userId);
}

/**
 * Get summary stats about user's context
 * @param {string} userId - Discord user ID
 * @returns {Object} Summary statistics
 */
function getStats(userId) {
    const context = getContext(userId);
    cleanupExpired(userId);

    const entryTypes = {};
    context.entries.forEach(entry => {
        entryTypes[entry.type] = (entryTypes[entry.type] || 0) + 1;
    });

    return {
        totalEntries: context.entries.length,
        entryTypes,
        activeWarnings: context.warnings.size,
        oldestEntry: context.entries.length > 0 ?
            context.entries[context.entries.length - 1].timestamp : null
    };
}

/**
 * Periodic cleanup job
 * Should be called every few minutes to prevent memory bloat
 */
function globalCleanup() {
    const now = Date.now();
    for (const [userId, context] of userContexts.entries()) {
        // If user has no recent activity, remove entirely
        const hasRecentActivity = context.entries.some(entry =>
            (now - entry.timestamp) <= UX.CONTEXT_MEMORY_TTL
        );

        if (!hasRecentActivity && context.warnings.size === 0) {
            userContexts.delete(userId);
        } else {
            cleanupExpired(userId);
        }
    }
}

// Run global cleanup every 10 minutes
setInterval(globalCleanup, 10 * 60 * 1000);

module.exports = {
    push,
    getRecent,
    hasRoughPatch,
    shouldWarn,
    recordWarning,
    dismissWarning,
    clear,
    getStats,
    globalCleanup
};
