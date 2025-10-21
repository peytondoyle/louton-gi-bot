// Daily Digests: AM Check-In & PM Recap Scheduler
// Sends automated daily messages to users for quick logging and summaries

const cron = require('node-cron');
const moment = require('moment-timezone');
const { buildEmbed, buttonsCheckIn } = require('../ui/components');
const { EMOJI, COLORS } = require('../constants/ux');
const { section, divider, kv, progressBar, trendChip } = require('../ui/formatters');

// Track which users have enabled digests (in production, use database)
// For now, enabled for all users who have interacted
const digestUsers = new Set();

/**
 * Register a user for daily digests
 * @param {string} userId - Discord user ID
 */
function enableDigests(userId) {
    digestUsers.add(userId);
}

/**
 * Unregister a user from daily digests
 * @param {string} userId - Discord user ID
 */
function disableDigests(userId) {
    digestUsers.delete(userId);
}

/**
 * Send morning check-in to a user
 * @param {Client} client - Discord client
 * @param {string} userId - Discord user ID
 */
async function sendMorningCheckIn(client, userId) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) return;

        const embed = buildEmbed({
            title: `${EMOJI.checkin} Morning Check-In`,
            description: 'How\'s your stomach today?\n\n*Quick tap to log your baseline*',
            color: COLORS.info,
            footer: moment().tz(process.env.TIMEZONE || 'America/Los_Angeles').format('dddd, MMMM D')
        });

        const components = buttonsCheckIn();

        await user.send({
            embeds: [embed],
            components: components
        });

        console.log(`📨 Sent morning check-in to ${user.tag}`);
    } catch (error) {
        console.error(`Failed to send morning check-in to ${userId}:`, error.message);
    }
}

/**
 * Send evening recap to a user
 * @param {Client} client - Discord client
 * @param {string} userId - Discord user ID
 * @param {Object} googleSheets - Google Sheets service
 */
async function sendEveningRecap(client, userId, googleSheets) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) return;

        // Get user's entries for today
        const entries = await googleSheets.getTodayEntries(user.tag);

        if (!entries || entries.length === 0) {
            // Skip if no entries today
            return;
        }

        // Calculate summary stats
        const foods = entries.filter(e => e.type === 'food').length;
        const drinks = entries.filter(e => e.type === 'drink').length;
        const symptoms = entries.filter(e => e.type === 'symptom' || e.type === 'reflux').length;

        // Build recap message
        const overview = section(
            'Today\'s Summary',
            `${kv('Logged', entries.length + ' entries')}\n${kv('Foods', foods)}\n${kv('Drinks', drinks)}\n${kv('Symptoms', symptoms)}`
        );

        const description = `${overview}\n\n${divider()}\n\n*Great job tracking today! Keep it up tomorrow* ${EMOJI.heart}`;

        const embed = buildEmbed({
            title: `${EMOJI.recap} Evening Recap`,
            description: description,
            color: symptoms === 0 ? COLORS.success : COLORS.info,
            footer: moment().tz(process.env.TIMEZONE || 'America/Los_Angeles').format('dddd, MMMM D')
        });

        await user.send({ embeds: [embed] });

        console.log(`📨 Sent evening recap to ${user.tag}`);
    } catch (error) {
        console.error(`Failed to send evening recap to ${userId}:`, error.message);
    }
}

/**
 * Handle morning check-in button response
 * Maps button response to severity and logs baseline symptom
 *
 * @param {Interaction} interaction - Discord button interaction
 * @param {Object} googleSheets - Google Sheets service
 * @param {Object} contextMemory - Context memory module
 * @returns {Promise<void>}
 */
async function handleCheckInResponse(interaction, googleSheets, contextMemory) {
    const buttonId = interaction.customId;
    const user = interaction.user;

    // Map check-in response to severity
    const severityMap = {
        'checkin_good': { severity: 'mild', severityNum: 1, message: 'Great to hear! Keep up the healthy habits 💚' },
        'checkin_okay': { severity: 'moderate', severityNum: 3, message: 'Alright! Hope your day gets even better 💛' },
        'checkin_bad': { severity: 'severe', severityNum: 6, message: 'Hang in there! Take it easy today 💙' }
    };

    const response = severityMap[buttonId];
    if (!response) return;

    try {
        // Log baseline check-in to sheets
        await googleSheets.appendRow({
            user: user.tag,
            type: 'symptom',
            value: 'morning check-in',
            severity: response.severity,
            notes: `Baseline check-in (${response.severityNum}/10)`,
            source: 'AM Check-In'
        });

        // Add to context memory
        contextMemory.push(user.id, {
            type: 'symptom',
            details: 'morning check-in',
            severity: response.severity,
            timestamp: Date.now()
        });

        // Send success response (ephemeral)
        await interaction.reply({
            content: `${EMOJI.success} ${response.message}`,
            ephemeral: true
        });

        console.log(`✅ Logged morning check-in for ${user.tag}: ${response.severity}`);
    } catch (error) {
        console.error(`Error logging check-in for ${user.tag}:`, error);
        await interaction.reply({
            content: `${EMOJI.error} Oops, I had trouble saving that. Mind trying again?`,
            ephemeral: true
        });
    }
}

/**
 * Register all digest schedules with the Discord client
 * Sets up cron jobs for AM check-in and PM recap
 *
 * @param {Client} client - Discord client
 * @param {Object} googleSheets - Google Sheets service (optional, for PM recap)
 */
function registerDigests(client, googleSheets = null) {
    const timezone = process.env.TIMEZONE || 'America/Los_Angeles';

    // Morning Check-In at 08:00 local time
    // Cron: "0 8 * * *" = At 08:00 every day
    const morningJob = cron.schedule('0 8 * * *', async () => {
        console.log(`🌅 Running morning check-in job (${moment().tz(timezone).format('HH:mm')})`);

        for (const userId of digestUsers) {
            await sendMorningCheckIn(client, userId);
            // Small delay between users to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }, {
        timezone: timezone
    });

    // Morning check-in scheduled silently

    // Evening Recap at 20:30 local time (optional)
    // Cron: "30 20 * * *" = At 20:30 every day
    if (googleSheets) {
        const eveningJob = cron.schedule('30 20 * * *', async () => {
            console.log(`🌙 Running evening recap job (${moment().tz(timezone).format('HH:mm')})`);

            for (const userId of digestUsers) {
                await sendEveningRecap(client, userId, googleSheets);
                // Small delay between users
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }, {
            timezone: timezone
        });

        // Evening recap scheduled silently
    }

    // Return control functions
    return {
        enableForUser: enableDigests,
        disableForUser: disableDigests,
        sendCheckInNow: (userId) => sendMorningCheckIn(client, userId),
        sendRecapNow: (userId) => sendEveningRecap(client, userId, googleSheets)
    };
}

/**
 * Auto-enable digests for users who have interacted
 * Call this when a user sends their first message
 *
 * @param {string} userId - Discord user ID
 */
function autoEnableForUser(userId) {
    if (!digestUsers.has(userId)) {
        enableDigests(userId);
        console.log(`📬 Auto-enabled digests for user ${userId}`);
    }
}

module.exports = {
    registerDigests,
    handleCheckInResponse,
    enableDigests,
    disableDigests,
    autoEnableForUser
};
