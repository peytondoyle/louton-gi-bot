const cron = require('node-cron');
const ProactiveAnalyst = require('../insights/proactiveAnalyst');
const { EMOJI } = require('../constants/ux');

let proactiveJob = null;

const ProactiveScheduler = {
    /**
     * Starts the daily proactive analysis job.
     * @param {import('discord.js').Client} client - The Discord client.
     * @param {object} services - { googleSheets, getUserProfile }
     */
    start(client, services) {
        // Run daily at 10:00 AM server time. This can be personalized later.
        proactiveJob = cron.schedule('0 10 * * *', async () => {
            console.log('[PROACTIVE] ☀️  Running daily proactive analysis...');

            // In a multi-user bot, you'd loop through all active users.
            // For now, we'll focus on the primary user.
            const userId = process.env.PEYTON_ID;
            if (!userId) return;

            try {
                const correlations = await ProactiveAnalyst.findFoodSymptomCorrelations(userId, services);

                if (correlations.length > 0) {
                    // We found something! Let's notify the user.
                    // For now, we'll just take the most significant one.
                    const topCorrelation = correlations.sort((a, b) => b.count - a.count)[0];
                    
                    const message = `
${EMOJI.thinking} **Just a thought...**
I noticed a potential pattern in your logs. On **${topCorrelation.count}** different occasions, you logged **${topCorrelation.symptom}** a few hours after eating **${topCorrelation.food}**.

This might be a connection worth keeping an eye on!
                    `;

                    const user = await client.users.fetch(userId);
                    await user.send(message.trim());
                    console.log(`[PROACTIVE] ✅  Sent proactive insight to user ${userId} about ${topCorrelation.food} and ${topCorrelation.symptom}.`);
                } else {
                    console.log(`[PROACTIVE] ✅  No new significant patterns found for user ${userId}.`);
                }
            } catch (error) {
                console.error(`[PROACTIVE] ❌  Error during proactive analysis for user ${userId}:`, error);
            }
        });

        // Proactive scheduler started silently
    },

    /**
     * Stops the proactive analysis job.
     */
    stop() {
        if (proactiveJob) {
            proactiveJob.stop();
            console.log('[PROACTIVE] ⏹️  Proactive analysis scheduler stopped.');
        }
    }
};

module.exports = ProactiveScheduler;
