/**
 * Response Watcher System
 * Tracks user interactions after reminder DMs to adjust adaptive timing
 */

const { recordReminderOutcome } = require('./adaptive');
const { updateUserProfile, getUserProfile } = require('../../services/userProfile');

// In-memory active watchers: userId -> { type, messageId, expiresAt, timeout }
const activeWatchers = new Map();

// Track for 20 minutes
const WATCH_WINDOW_MS = 20 * 60 * 1000;

/**
 * Start watching for user response after reminder DM
 * @param {string} userId - Discord user ID
 * @param {string} type - Reminder type (morning, evening, inactivity)
 * @param {string} messageId - Sent message ID (optional, for tracking)
 * @param {Object} prefs - User preferences
 * @param {Object} googleSheets - Sheets service for persisting outcome
 */
function startResponseWatcher(userId, type, messageId, prefs, googleSheets) {
    // Clear any existing watcher for this user
    clearWatcher(userId);

    const expiresAt = Date.now() + WATCH_WINDOW_MS;

    // Set timeout for 20 minutes
    const timeout = setTimeout(async () => {
        console.log(`[ADAPTIVE] Watcher expired for user ${userId} (${type}) → marking as ignored`);

        try {
            await recordReminderOutcome({
                userId,
                prefs,
                outcome: 'ignored',
                setUserPrefs: require('../../services/prefs').setUserPrefs,
                googleSheets
            });
        } catch (error) {
            console.error(`[ADAPTIVE] Failed to record ignored outcome for ${userId}:`, error);
        }

        activeWatchers.delete(userId);
    }, WATCH_WINDOW_MS);

    activeWatchers.set(userId, {
        type,
        messageId,
        expiresAt,
        timeout
    });

    console.log(`[ADAPTIVE] Started ${WATCH_WINDOW_MS / 60000}-min response watcher for user ${userId} (${type})`);
}

/**
 * Clear watcher for a user (cancel timeout)
 * @param {string} userId - Discord user ID
 */
function clearWatcher(userId) {
    const existing = activeWatchers.get(userId);
    if (existing) {
        clearTimeout(existing.timeout);
        activeWatchers.delete(userId);
        console.log(`[ADAPTIVE] Cleared watcher for user ${userId}`);
    }
}

/**
 * Marks a user as having responded to a reminder.
 * @param {string} userId - The Discord user ID.
 * @param {object} prefs - The user's preferences object.
 * @param {object} googleSheets - The Google Sheets service instance.
 */
async function markInteracted(userId, prefs, googleSheets) {
    const watcher = activeWatchers.get(userId);
    if (!watcher) return; // Not under watch

    // Clear timeout
    clearWatcher(userId);

    // Record interaction outcome
    try {
        await recordReminderOutcome({
            userId,
            prefs,
            outcome: 'interacted',
            setUserPrefs: require('../../services/prefs').setUserPrefs,
            googleSheets
        });

        // Update profile directly instead of separate prefs
        const profile = await getUserProfile(userId, googleSheets);
        profile.prefs.IgnoredCount = 0;
        profile.prefs.AdaptiveShiftMin = 0;
        await updateUserProfile(userId, profile, googleSheets);

        console.log(`[WATCHER] User ${userId} interacted. Resetting ignored count.`);
    } catch (error) {
        console.error(`[ADAPTIVE] Failed to record interacted outcome for ${userId}:`, error);
    }
}

/**
 * Check if user is currently under watch
 * @param {string} userId - Discord user ID
 * @returns {boolean} - True if active watcher exists
 */
function isUnderWatch(userId) {
    const watcher = activeWatchers.get(userId);
    if (!watcher) return false;

    // Check if expired (safety check)
    if (Date.now() > watcher.expiresAt) {
        clearWatcher(userId);
        return false;
    }

    return true;
}

/**
 * Get active watcher count (for monitoring)
 * @returns {number} - Number of active watchers
 */
function getActiveWatcherCount() {
    return activeWatchers.size;
}

module.exports = {
    startResponseWatcher,
    markInteracted,
    isUnderWatch,
    clearWatcher,
    getActiveWatcherCount
};
