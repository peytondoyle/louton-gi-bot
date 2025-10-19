// Proactive Reminders - Timezone-aware per-user cron scheduler
// Supports morning check-ins, evening recaps, and inactivity nudges

const cron = require('node-cron');
const moment = require('moment-timezone');
const { getUserPrefs, listAllPrefs, setUserPrefs } = require('../../services/prefs');

// Active cron tasks per user: Map<userId, { morning, evening, inactivity }>
const tasks = new Map();

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
 * @param {string} text - Message text
 * @param {Object} helpers - Helper functions
 * @returns {Promise<boolean>} Success status
 */
async function sendDM(client, userId, text, helpers) {
    try {
        const user = await client.users.fetch(userId);
        await user.send(text);
        console.log(`[REMINDER] ✅ Sent DM to user ${userId}`);
        return true;
    } catch (error) {
        console.log(`[REMINDER] ❌ DM failed for user ${userId}: ${error.message}`);
        // Turn off reminders if DM fails (user has DMs closed)
        try {
            await helpers.setUserPrefs(userId, { DM: 'off' });
            console.log(`[REMINDER] 🔕 Disabled reminders for user ${userId} (DMs closed)`);
        } catch (prefError) {
            console.error(`[REMINDER] Failed to update prefs for user ${userId}:`, prefError);
        }
        return false;
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

    console.log(`[REMINDER] Scheduling reminders for user ${userId} (TZ: ${tz})`);

    /**
     * Create a timezone-gated cron job
     * @param {string} hhmm - Time in HH:MM format
     * @param {Function} fn - Function to execute at that time
     * @returns {Object|null} Cron task or null
     */
    const gate = (hhmm, fn) => {
        if (!hhmm || hhmm === '') return null;

        try {
            const [H, M] = hhmm.split(':').map(Number);

            if (isNaN(H) || isNaN(M) || H < 0 || H > 23 || M < 0 || M > 59) {
                console.error(`[REMINDER] Invalid time format: ${hhmm}`);
                return null;
            }

            // Run every minute, check if current time matches target
            const job = cron.schedule('* * * * *', async () => {
                const now = moment().tz(tz);
                if (now.hour() === H && now.minute() === M) {
                    try {
                        await fn();
                    } catch (error) {
                        console.error(`[REMINDER] Error in cron job:`, error);
                    }
                }
            });

            job.start();
            console.log(`[REMINDER] ✅ Scheduled job at ${hhmm} for user ${userId}`);
            return job;
        } catch (error) {
            console.error(`[REMINDER] Failed to create cron job for ${hhmm}:`, error);
            return null;
        }
    };

    // Morning check-in
    if (prefs.MorningHHMM) {
        bucket.morning = gate(prefs.MorningHHMM, async () => {
            await sendDM(
                client,
                userId,
                '🌞 **Morning check-in** — how are you feeling?\n\n' +
                '• Type `good`, `okay`, or `bad`\n' +
                '• Or just tell me: "oatmeal with banana", "mild heartburn"…\n\n' +
                '_Reply with `!reminders off` to stop these check-ins._',
                helpers
            );
        });
    }

    // Evening recap
    if (prefs.EveningHHMM) {
        bucket.evening = gate(prefs.EveningHHMM, async () => {
            try {
                const sheetName = helpers.getLogSheetNameForUser(userId);
                const entries = await helpers.getTodayEntries('', sheetName);

                const foods = entries.filter(e => String(e.type || e.Type).toLowerCase() === 'food').length;
                const drinks = entries.filter(e => String(e.type || e.Type).toLowerCase() === 'drink').length;
                const reflux = entries.filter(e => String(e.type || e.Type).toLowerCase() === 'reflux').length;
                const symptoms = entries.filter(e => String(e.type || e.Type).toLowerCase() === 'symptom').length;

                await sendDM(
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
            } catch (error) {
                console.error('[REMINDER] Evening recap failed:', error);
            }
        });
    }

    // Inactivity nudge
    if (prefs.InactivityHHMM) {
        bucket.inactivity = gate(prefs.InactivityHHMM, async () => {
            try {
                const sheetName = helpers.getLogSheetNameForUser(userId);
                const entries = await helpers.getTodayEntries('', sheetName);

                if (!entries || entries.length === 0) {
                    await sendDM(
                        client,
                        userId,
                        '👋 **Haven\'t seen a log yet today** — want to add lunch or a check-in?\n\n' +
                        '• "chicken salad for lunch"\n' +
                        '• "feeling bloated"\n' +
                        '• "good day so far"',
                        helpers
                    );
                }
            } catch (error) {
                console.error('[REMINDER] Inactivity nudge failed:', error);
            }
        });
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
