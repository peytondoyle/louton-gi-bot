/**
 * Adaptive Reminder Logic
 * Pure functions for computing adaptive send times and DND checks
 */

const moment = require('moment-timezone');

const MAX_ADAPTIVE_SHIFT_MIN = 120; // Max 2 hours
const IGNORED_THRESHOLD = 3; // Nudges after 3 consecutive ignores

/**
 * Check if current time is in DND window or snoozed
 * @param {Object} options - { userPrefs, nowZoned }
 * @returns {boolean} - True if should suppress
 */
function shouldSuppressNow({ userPrefs, nowZoned }) {
    // Check snooze
    if (userPrefs.SnoozeUntil && nowZoned.toISOString() < userPrefs.SnoozeUntil) {
        return true;
    }

    // Check DND window
    if (userPrefs.DNDWindow) {
        return inQuietHours({ dndWindow: userPrefs.DNDWindow, nowZoned });
    }

    return false;
}

/**
 * Check if current time is within DND window
 * @param {Object} options - { dndWindow, nowZoned }
 * @returns {boolean} - True if in quiet hours
 */
function inQuietHours({ dndWindow, nowZoned }) {
    if (!dndWindow || !dndWindow.includes('-')) return false;

    const [startStr, endStr] = dndWindow.split('-').map(s => s.trim());
    if (!startStr || !endStr) return false;

    // Parse HH:mm format
    const [startH, startM] = startStr.split(':').map(n => parseInt(n, 10));
    const [endH, endM] = endStr.split(':').map(n => parseInt(n, 10));

    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false;

    // Convert current time to minutes since midnight
    const nowMinutes = nowZoned.hour() * 60 + nowZoned.minute();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight window (e.g., 22:00-07:00)
    if (startMinutes > endMinutes) {
        // Overnight: in window if after start OR before end
        return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    } else {
        // Same day: in window if between start and end
        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }
}

/**
 * Compute next send time with adaptive shift
 * @param {string} baseHHmm - Base time in HH:mm format
 * @param {Object} options - { tz, adaptiveShiftMin }
 * @returns {string} - Adjusted time in HH:mm format
 */
function computeNextSend(baseHHmm, { tz, adaptiveShiftMin = 0 }) {
    if (!baseHHmm) return '';

    const [h, m] = baseHHmm.split(':').map(n => parseInt(n, 10));
    if (isNaN(h) || isNaN(m)) return baseHHmm;

    // Apply shift (bounded to ±90 min for safety)
    const boundedShift = Math.max(-90, Math.min(90, adaptiveShiftMin));

    // Create moment object for today at base time
    const base = moment().tz(tz).hour(h).minute(m).second(0);

    // Add shift
    const adjusted = base.add(boundedShift, 'minutes');

    return adjusted.format('HH:mm');
}

/**
 * Records the outcome of a reminder and updates adaptive settings.
 * @param {Object} options - { userId, profile, outcome, googleSheets, updateUserProfile }
 */
async function recordReminderOutcome({ userId, profile, outcome, googleSheets, updateUserProfile }) {
    let { IgnoredCount = 0, AdaptiveShiftMin = 0 } = profile.prefs;

    if (outcome === 'interacted') {
        IgnoredCount = 0;
        AdaptiveShiftMin = Math.max(0, AdaptiveShiftMin - 15); // Recover 15 min
    } else if (outcome === 'ignored') {
        IgnoredCount++;
        if (IgnoredCount >= IGNORED_THRESHOLD) {
            AdaptiveShiftMin = Math.min(MAX_ADAPTIVE_SHIFT_MIN, AdaptiveShiftMin + 30); // Delay by 30 min
        }
    }

    // Update the profile
    profile.prefs.IgnoredCount = IgnoredCount;
    profile.prefs.AdaptiveShiftMin = AdaptiveShiftMin;
    await updateUserProfile(userId, profile, googleSheets);

    console.log(`[ADAPTIVE] User ${userId} outcome: ${outcome}. New state - Ignored: ${IgnoredCount}, Shift: ${AdaptiveShiftMin}m`);
}

/**
 * Create a response watcher for a reminder
 * Monitors for interactions within a time window
 * @param {Object} options - { userId, windowMs, onOutcome }
 * @returns {Object} - { checkInteraction, cancel }
 */
function createResponseWatcher({ userId, windowMs = 20 * 60 * 1000, onOutcome }) {
    const startTime = Date.now();
    let interacted = false;
    let cancelled = false;

    // Timer to mark as ignored after window
    const timeout = setTimeout(() => {
        if (!interacted && !cancelled) {
            onOutcome('ignored');
        }
    }, windowMs);

    return {
        // Call this when user interacts
        checkInteraction: (interactionUserId) => {
            if (interactionUserId === userId && !cancelled) {
                interacted = true;
                clearTimeout(timeout);
                onOutcome('interacted');
                return true;
            }
            return false;
        },

        // Cancel watcher
        cancel: () => {
            cancelled = true;
            clearTimeout(timeout);
        },

        // Check if window is still open
        isActive: () => {
            return Date.now() - startTime < windowMs && !cancelled;
        }
    };
}

module.exports = {
    shouldSuppressNow,
    inQuietHours,
    computeNextSend,
    recordReminderOutcome,
    createResponseWatcher
};
