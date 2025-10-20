// Context Memory: In-memory per-user rolling context tracker
// Tracks last N entries per user with TTL for empathetic follow-ups
// Includes lexicon learning and optional JSON persistence
// V2: Adds "same as yesterday" reference resolution

const { UX } = require('../constants/ux');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const time = require('./time');

// In-memory storage: userId -> { entries: [], warnings: Map, lexicon: Map, recentLogs: [] }
const userContexts = new Map();

// Lexicon persistence path (Replit-friendly)
const LEXICON_PATH = path.join(process.cwd(), '.data', 'lexicon.json');

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
            lexicon: new Map(), // phrase -> { intent, slots, learnedAt }
            // pendingContext: null, // For conversational follow-ups (migrated to services/pending.js)
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
 * Sets a pending context for the user, expecting a follow-up.
 * @param {string} userId - Discord user ID
 * @param {string} type - The type of follow-up expected (e.g., 'expecting_symptom').
 * @param {Object} data - Any data to associate with the context.
 * @param {number} ttl - Time-to-live in seconds.
 */
// function setPendingContext(userId, type, data, ttl = 300) { // 5 minute default TTL
//     const context = getContext(userId);
//     context.pendingContext = {
//         type,
//         data,
//         expiresAt: Date.now() + (ttl * 1000)
//     };
// }

/**
 * Retrieves and consumes a pending context if it exists and is not expired.
 * @param {string} userId - Discord user ID
 * @returns {Object|null} The pending context object, or null if none.
 */
// function getPendingContext(userId) {
//     const context = getContext(userId);
//     if (!context.pendingContext) {
//         return null;
//     }

//     if (Date.now() > context.pendingContext.expiresAt) {
//         context.pendingContext = null; // Expired
//         return null;
//     }

//     const pending = context.pendingContext;
//     context.pendingContext = null; // Consume on read
//     return pending;
// }


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

/**
 * Learn a phrase for a user (lexicon entry)
 * @param {string} userId - Discord user ID
 * @param {string} phrase - The exact phrase (will be lowercased/trimmed)
 * @param {string} intent - Intent to associate
 * @param {Object} slots - Partial slots to merge on lookup
 */
function learnPhrase(userId, phrase, intent, slots = {}) {
    const context = getContext(userId);
    const key = phrase.toLowerCase().trim();

    context.lexicon.set(key, {
        intent,
        slots,
        learnedAt: Date.now()
    });

    console.log(`📚 Learned phrase for user ${userId}: "${key}" → ${intent}`);

    // Persist lexicon asynchronously
    saveLexicon();
}

/**
 * Look up a learned phrase
 * @param {string} userId - Discord user ID
 * @param {string} phrase - The phrase to look up
 * @returns {Object|null} - { intent, slots } or null
 */
function lookupPhrase(userId, phrase) {
    const context = getContext(userId);
    const key = phrase.toLowerCase().trim();

    return context.lexicon.get(key) || null;
}

/**
 * Check if warning is muted for a trigger
 * @param {string} userId - Discord user ID
 * @param {string} trigger - Trigger name
 * @returns {boolean}
 */
function isWarningMuted(userId, trigger) {
    return !shouldWarn(userId, trigger);
}

/**
 * Set warning mute until timestamp
 * @param {string} userId - Discord user ID
 * @param {string} trigger - Trigger name
 * @param {number} untilTs - Timestamp until warning is muted
 */
function setWarningMute(userId, trigger, untilTs) {
    // For 24h mutes, just record the warning
    recordWarning(userId, trigger);
}

/**
 * Save lexicon to disk (async, fail-safe)
 */
function saveLexicon() {
    try {
        const lexiconData = {};

        for (const [userId, context] of userContexts.entries()) {
            if (context.lexicon.size > 0) {
                lexiconData[userId] = {};
                for (const [phrase, data] of context.lexicon.entries()) {
                    lexiconData[userId][phrase] = data;
                }
            }
        }

        const dir = path.dirname(LEXICON_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(LEXICON_PATH, JSON.stringify(lexiconData, null, 2), 'utf8');
    } catch (error) {
        // Silently ignore persistence errors
        console.error('Failed to save lexicon (non-fatal):', error.message);
    }
}

/**
 * Load lexicon from disk (on startup)
 */
function loadLexicon() {
    try {
        if (fs.existsSync(LEXICON_PATH)) {
            const data = fs.readFileSync(LEXICON_PATH, 'utf8');
            const lexiconData = JSON.parse(data);

            for (const [userId, phrases] of Object.entries(lexiconData)) {
                const context = getContext(userId);
                for (const [phrase, phraseData] of Object.entries(phrases)) {
                    context.lexicon.set(phrase, phraseData);
                }
            }

            console.log('📚 Loaded lexicon from disk');
        }
    } catch (error) {
        // Silently ignore load errors
        console.error('Failed to load lexicon (non-fatal):', error.message);
    }
}

// Load lexicon on module initialization
/**
 * V2: Resolve references like "same as yesterday"
 * @param {string} userId - Discord user ID
 * @param {string} text - Input text
 * @param {Object} googleSheets - Sheets service
 * @param {string} sheetName - User's sheet
 * @returns {Promise<Object|null>} - Referenced entry or null
 */
async function resolveReference(userId, text, googleSheets, sheetName) {
    const lower = text.toLowerCase();

    // Check for reference patterns
    const patterns = [
        /same (as |)yesterday/i,
        /same (as |)last time/i,
        /usual breakfast/i,
        /regular lunch/i,
        /same (thing|meal)/i
    ];

    const hasReference = patterns.some(p => p.test(text));
    if (!hasReference) return null;

    try {
        // Get yesterday's date
        const yesterday = time.now().subtract(1, 'day').format('YYYY-MM-DD');

        // Fetch rows from sheet
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success) return null;

        // Find yesterday's breakfast/lunch/dinner (based on current time)
        const currentMeal = time.now().hour() < 11 ? 'breakfast' :
                           time.now().hour() < 15 ? 'lunch' : 'dinner';

        const yesterdayEntry = result.rows.find(row => {
            if (row.Date !== yesterday) return false;
            if (row.Type !== 'food' && row.Type !== 'drink') return false;

            const notes = row.Notes || '';
            return notes.includes(`meal=${currentMeal}`);
        });

        if (yesterdayEntry) {
            console.log(`[CONTEXT] Resolved reference: ${yesterdayEntry.Details} from ${yesterday}`);
            return {
                item: yesterdayEntry.Details,
                notes: yesterdayEntry.Notes,
                date: yesterday,
                calories: yesterdayEntry.Calories
            };
        }

        return null;
    } catch (error) {
        console.error('[CONTEXT] Error resolving reference:', error);
        return null;
    }
}

loadLexicon();

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
    globalCleanup,
    learnPhrase,
    lookupPhrase,
    isWarningMuted,
    setWarningMute,
    // setPendingContext, // Removed as per edit hint
    // getPendingContext, // Removed as per edit hint
    resolveReference  // V2: Reference resolution
};
