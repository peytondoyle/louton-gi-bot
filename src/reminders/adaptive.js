/**
 * Adaptive Reminder Logic
 * Pure functions for computing adaptive send times and DND checks
 */

const moment = require('moment-timezone');

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
 * Record reminder outcome and update adaptive shift
 * @param {Object} options - { userId, prefs, outcome, setUserPrefs, googleSheets }
 * @returns {Promise<void>}
 */
async function recordReminderOutcome({ userId, prefs, outcome, setUserPrefs, googleSheets }) {
    if (outcome === 'ignored') {
        // Increment ignored count and shift later by 15 min
        const newIgnoredCount = (prefs.IgnoredCount || 0) + 1;
        const newShift = Math.min((prefs.AdaptiveShiftMin || 0) + 15, 90);

        await setUserPrefs(userId, {
            IgnoredCount: newIgnoredCount,
            AdaptiveShiftMin: newShift
        }, googleSheets);

        console.log(`[ADAPTIVE] User ${userId} ignored reminder → shift now ${newShift}min (ignored: ${newIgnoredCount})`);
    } else if (outcome === 'interacted') {
        // Reset ignored count and shift earlier by 10 min
        const newShift = Math.max((prefs.AdaptiveShiftMin || 0) - 10, -60);

        await setUserPrefs(userId, {
            IgnoredCount: 0,
            AdaptiveShiftMin: newShift
        }, googleSheets);

        console.log(`[ADAPTIVE] User ${userId} interacted → shift now ${newShift}min (reset ignored count)`);
    }
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
