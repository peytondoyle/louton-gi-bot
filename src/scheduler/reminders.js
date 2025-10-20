// Proactive Reminders - Timezone-aware per-user cron scheduler
// Supports morning check-ins, evening recaps, and inactivity nudges
// Phase 4.1: Integrated with adaptive shifts and response watchers

const cron = require('node-cron');
const moment = require('moment-timezone');
const { getUserProfile, updateUserProfile } = require('../../services/userProfile');
const { shouldSuppressNow, computeNextSend } = require('../reminders/adaptive');
const { startResponseWatcher } = require('../reminders/responseWatcher');
const {
    isWithinDND,
    getSnoozeUntil,
    getReminderCooldown
} = require('../reminders/dnd');
const time = require('../utils/time');

// Active cron tasks per user: Map<userId, { morning, evening, inactivity }>
const tasks = new Map();
const scheduledJobs = new Map(); // Global registry for cron jobs

/**
 * Stop all cron tasks in a bucket
 * @param {Object} bucket - Object with cron tasks
 */
function _stopBucket(bucket) {
    if (!bucket) return;
    Object.values(bucket).forEach(task => {
        if (task && typeof task.stop === 'function') {
            task.stop();
        }
    });
}

/**
 * Send DM to user with error handling
 * @param {Object} client - Discord client
 * @param {string} userId - Discord user ID
 * @param {string} text - Message text or embed object
 * @param {Object} helpers - Helper functions
 * @returns {Promise<Object|null>} Sent message or null if failed
 */
async function sendDM(client, userId, text, helpers) {
    try {
        const user = await client.users.fetch(userId);
        const sentMessage = await user.send(text);
        console.log(`[REMINDER] ✅ Sent DM to user ${userId}`);
        return sentMessage;
    } catch (error) {
        console.log(`[REMINDER] ❌ DM failed for user ${userId}: ${error.message}`);
        // Turn off reminders if DM fails (user has DMs closed)
        try {
            await helpers.setUserPrefs(userId, { DM: 'off' }, helpers.googleSheets);
            console.log(`[REMINDER] 🔕 Disabled reminders for user ${userId} (DMs closed)`);
        } catch (prefError) {
            console.error(`[REMINDER] Failed to update prefs for user ${userId}:`, prefError);
        }
        return null;
    }
}

/**
 * Schedule reminders for a single user
 * @param {Object} client - Discord client
 * @param {Object} googleSheets - Google Sheets service
 * @param {string} userId - Discord user ID
 * @param {Object} prefs - User preferences
 * @param {Object} helpers - Helper functions (getLogSheetNameForUser, getTodayEntries, setUserPrefs)
 */
function scheduleForUser(client, googleSheets, userId, prefs, helpers) {
    // Stop existing tasks for this user
    if (tasks.has(userId)) {
        _stopBucket(tasks.get(userId));
        tasks.delete(userId);
    }

    // Skip if reminders are off
    if (!prefs || String(prefs.DM || 'off').toLowerCase() !== 'on') {
        console.log(`[REMINDER] Skipping user ${userId} (reminders off)`);
        return;
    }

    // Check snooze status
    const snoozeUntil = prefs.SnoozeUntil && moment.tz(prefs.SnoozeUntil, prefs.TZ || 'UTC');
    if (snoozeUntil && moment().tz(prefs.TZ || 'UTC').isBefore(snoozeUntil)) {
        console.log(`[REMINDER] User ${userId} is snoozed until ${snoozeUntil.format()}`);
        return;
    }

    const bucket = {};
    const tz = prefs.TZ || 'America/Los_Angeles';

    // Phase 4.1: Compute adaptive times
    const adaptiveShiftMin = prefs.AdaptiveShiftMin || 0;
    console.log(`[REMINDER] Scheduling reminders for user ${userId} (TZ: ${tz}, shift: ${adaptiveShiftMin}min)`);

    /**
     * Create a timezone-gated cron job with adaptive shift
     * @param {string} baseHhmm - Base time in HH:MM format
     * @param {Function} fn - Function to execute at that time
     * @param {string} type - Reminder type (for logging)
     * @returns {Object|null} Cron task or null
     */
    const gate = (baseHhmm, fn, type) => {
        if (!baseHhmm || baseHhmm === '') return null;

        try {
            // Phase 4.1: Apply adaptive shift
            const effectiveHhmm = computeNextSend(baseHhmm, { tz, adaptiveShiftMin });
            const [H, M] = effectiveHhmm.split(':').map(Number);

            if (isNaN(H) || isNaN(M) || H < 0 || H > 23 || M < 0 || M > 59) {
                console.error(`[REMINDER] Invalid time format: ${effectiveHhmm}`);
                return null;
            }

            // Run every minute, check if current time matches target
            const job = cron.schedule('* * * * *', async () => {
                const now = moment().tz(tz);
                if (now.hour() === H && now.minute() === M) {
                    try {
                        // Phase 4.1: Check suppression at send time
                        const freshPrefs = await getUserPrefs(userId, helpers.googleSheets);
                        if (shouldSuppressNow({ userPrefs: freshPrefs, nowZoned: now })) {
                            console.log(`[REMINDERS] Suppressed ${type} for user ${userId} (DND/snooze)`);
                            return;
                        }

                        // Execute reminder
                        await fn(freshPrefs);
                    } catch (error) {
                        console.error(`[REMINDER] Error in cron job:`, error);
                    }
                }
            });

            job.start();
            const shiftNote = adaptiveShiftMin !== 0 ? ` (adaptive ${adaptiveShiftMin > 0 ? '+' : ''}${adaptiveShiftMin}m)` : '';
            console.log(`[REMINDER] ✅ Scheduled ${type} at ${effectiveHhmm}${shiftNote} for user ${userId}`);
            return job;
        } catch (error) {
            console.error(`[REMINDER] Failed to create cron job for ${baseHhmm}:`, error);
            return null;
        }
    };

    // Morning check-in
    if (prefs.MorningHHMM) {
        bucket.morning = gate(prefs.MorningHHMM, async (freshPrefs) => {
            const sentMessage = await sendDM(
                client,
                userId,
                '🌞 **Morning check-in** — how are you feeling?\n\n' +
                '• Type `good`, `okay`, or `bad`\n' +
                '• Or just tell me: "oatmeal with banana", "mild heartburn"…\n\n' +
                '_Reply with `!reminders off` to stop these check-ins._',
                helpers
            );

            // Phase 4.1: Start response watcher
            if (sentMessage) {
                startResponseWatcher(userId, 'morning', sentMessage.id, freshPrefs, helpers.googleSheets);
            }
        }, 'morning');
    }

    // Evening recap
    if (prefs.EveningHHMM) {
        bucket.evening = gate(prefs.EveningHHMM, async (freshPrefs) => {
            try {
                const sheetName = helpers.getLogSheetNameForUser(userId);
                const entries = await helpers.getTodayEntries('', sheetName);

                const foods = entries.filter(e => String(e.type || e.Type).toLowerCase() === 'food').length;
                const drinks = entries.filter(e => String(e.type || e.Type).toLowerCase() === 'drink').length;
                const reflux = entries.filter(e => String(e.type || e.Type).toLowerCase() === 'reflux').length;
                const symptoms = entries.filter(e => String(e.type || e.Type).toLowerCase() === 'symptom').length;

                const sentMessage = await sendDM(
                    client,
                    userId,
                    `🌙 **Daily recap**\n\n` +
                    `🍽️  Meals: ${foods}\n` +
                    `🥤 Drinks: ${drinks}\n` +
                    `🔥 Reflux events: ${reflux}\n` +
                    `🩺 Other symptoms: ${symptoms}\n\n` +
                    `Type \`!today\` for full details.`,
                    helpers
                );

                // Phase 4.1: Start response watcher
                if (sentMessage) {
                    startResponseWatcher(userId, 'evening', sentMessage.id, freshPrefs, helpers.googleSheets);
                }
            } catch (error) {
                console.error('[REMINDER] Evening recap failed:', error);
            }
        }, 'evening');
    }

    // Inactivity nudge
    if (prefs.InactivityHHMM) {
        bucket.inactivity = gate(prefs.InactivityHHMM, async (freshPrefs) => {
            try {
                // Phase 4.1: Check 24h cooldown
                const nowISO = moment().tz(tz).toISOString();
                if (await isOnCooldown(userId, 'inactivity', nowISO, helpers.googleSheets)) {
                    console.log(`[REMINDER] Inactivity nudge on cooldown for user ${userId}`);
                    return;
                }

                const sheetName = helpers.getLogSheetNameForUser(userId);
                const entries = await helpers.getTodayEntries('', sheetName);

                // Filter out soft-deleted rows
                const activeEntries = entries.filter(e => !e.notes?.includes('deleted=true'));

                if (!activeEntries || activeEntries.length === 0) {
                    const sentMessage = await sendDM(
                        client,
                        userId,
                        '👋 **Haven\'t seen a log yet today** — want to add lunch or a check-in?\n\n' +
                        '• "chicken salad for lunch"\n' +
                        '• "feeling bloated"\n' +
                        '• "good day so far"',
                        helpers
                    );

                    // Phase 4.1: Start response watcher
                    if (sentMessage) {
                        startResponseWatcher(userId, 'inactivity', sentMessage.id, freshPrefs, helpers.googleSheets);

                        // Set 24h cooldown
                        const { setCooldown } = require('../../services/prefs');
                        const cooldownUntil = moment().tz(tz).add(24, 'hours').toISOString();
                        await setCooldown(userId, 'inactivity', cooldownUntil, helpers.googleSheets);
                    }
                }
            } catch (error) {
                console.error('[REMINDER] Inactivity nudge failed:', error);
            }
        }, 'inactivity');
    }

    tasks.set(userId, bucket);
    console.log(`[REMINDER] ✅ User ${userId} reminders scheduled`);
}

/**
 * Schedule reminders for all users with preferences
 * @param {Object} client - Discord client
 * @param {Object} googleSheets - Google Sheets service
 * @param {Object} helpers - Helper functions
 */
async function scheduleAll(client, googleSheets, helpers) {
    console.log('[REMINDER] 📅 Scheduling reminders for all users...');

    try {
        const prefsList = await listAllPrefs(googleSheets);
        console.log(`[REMINDER] Found ${prefsList.length} user preferences`);

        for (const prefs of prefsList) {
            if (prefs.UserId) {
                scheduleForUser(client, googleSheets, prefs.UserId, prefs, helpers);
            }
        }

        console.log('[REMINDER] ✅ All reminders scheduled');
    } catch (error) {
        console.error('[REMINDER] ❌ Failed to schedule reminders:', error);
    }
}

/**
 * Update schedule for a single user (call when prefs change)
 * @param {Object} client - Discord client
 * @param {Object} googleSheets - Google Sheets service
 * @param {string} userId - Discord user ID
 * @param {Object} helpers - Helper functions
 */
async function updateUserSchedule(client, googleSheets, userId, helpers) {
    console.log(`[REMINDER] 🔄 Updating schedule for user ${userId}`);

    try {
        const prefs = await getUserPrefs(userId, googleSheets);
        scheduleForUser(client, googleSheets, userId, prefs, helpers);
    } catch (error) {
        console.error(`[REMINDER] Failed to update schedule for user ${userId}:`, error);
    }
}

/**
 * Get count of active reminder tasks
 * @returns {number} Number of users with active reminders
 */
function getActiveCount() {
    return tasks.size;
}

module.exports = {
    scheduleAll,
    updateUserSchedule,
    scheduleForUser,
    getActiveCount
};
