/**
 * Job Runner
 * Processes scheduled jobs from the queue
 */

const jobsStore = require('./jobsStore');
const { shouldEnableCalorieFeatures } = require('../auth/scope');

/**
 * Send after-meal calorie reminder
 * @param {Object} job - Job data
 * @param {Object} client - Discord client
 */
async function sendAfterMealDM(job, client) {
    const { userId, payload } = job;
    
    // Check if user is authorized for calorie features
    if (!shouldEnableCalorieFeatures(userId)) {
        console.log(`[JOBS] Skipping calorie reminder for unauthorized user ${userId}`);
        return;
    }
    
    try {
        const user = await client.users.fetch(userId);
        if (!user) {
            console.warn(`[JOBS] User ${userId} not found`);
            return;
        }
        
        const { item, mealType, originalMessage } = payload;
        
        // Create reminder message
        const embed = {
            title: "🍽️ Calorie Reminder",
            description: `Want to add calories for **${item}** from ${mealType}?`,
            color: 0x57F287, // Green
            fields: [
                {
                    name: "Options",
                    value: "• **+Estimate** - I'll estimate calories\n• **Enter Calories** - Manual entry\n• **Skip** - No calories needed",
                    inline: false
                }
            ],
            footer: {
                text: "This helps track your daily nutrition goals"
            }
        };
        
        // Create buttons
        const components = [
            {
                type: 1, // ActionRow
                components: [
                    {
                        type: 2, // Button
                        style: 1, // Primary
                        label: "+Estimate",
                        custom_id: `calorie:estimate:${job.id}`,
                        emoji: { name: "🧮" }
                    },
                    {
                        type: 2, // Button
                        style: 2, // Secondary
                        label: "Enter Calories",
                        custom_id: `calorie:manual:${job.id}`,
                        emoji: { name: "✏️" }
                    },
                    {
                        type: 2, // Button
                        style: 3, // Success
                        label: "Skip",
                        custom_id: `calorie:skip:${job.id}`,
                        emoji: { name: "⏭️" }
                    }
                ]
            }
        ];
        
        await user.send({ embeds: [embed], components });
        console.log(`[JOBS] Sent calorie reminder to user ${userId} for ${item}`);
        
    } catch (error) {
        if (error.code === 50007) { // Cannot send messages to this user
            console.log(`[JOBS] Cannot send DM to user ${userId} - DMs may be disabled`);
            // TODO: Fall back to channel notification
        } else {
            console.error(`[JOBS] Failed to send reminder to user ${userId}:`, error);
        }
    }
}

/**
 * Process a single job
 * @param {Object} job - Job to process
 * @param {Object} client - Discord client
 */
async function processJob(job, client) {
    const { type, id } = job;
    
    try {
        switch (type) {
            case 'after_meal_ping':
                await sendAfterMealDM(job, client);
                break;
            default:
                console.warn(`[JOBS] Unknown job type: ${type}`);
        }
        
        // Mark job as completed
        await jobsStore.markDone(id);
        
    } catch (error) {
        console.error(`[JOBS] Error processing job ${id}:`, error);
        // Don't mark as done if there was an error
    }
}

/**
 * Start the job runner
 * @param {Object} client - Discord client
 */
function start(client) {
    console.log('[JOBS] Starting job runner...');
    
    // Run every 15 seconds
    const interval = setInterval(async () => {
        try {
            const now = new Date().toISOString();
            const dueJobs = await jobsStore.pullDue(now);
            
            if (dueJobs.length > 0) {
                console.log(`[JOBS] Processing ${dueJobs.length} due jobs`);
                
                for (const job of dueJobs) {
                    await processJob(job, client);
                }
            }
        } catch (error) {
            console.error('[JOBS] Error in job runner:', error);
        }
    }, 15000);
    
    // Store interval ID for cleanup
    jobsStore._interval = interval;
    
    console.log('[JOBS] Job runner started (15s interval)');
}

/**
 * Stop the job runner
 */
function stop() {
    if (jobsStore._interval) {
        clearInterval(jobsStore._interval);
        jobsStore._interval = null;
        console.log('[JOBS] Job runner stopped');
    }
}

/**
 * Process overdue jobs on startup
 * @param {Object} client - Discord client
 */
async function processOverdueJobs(client) {
    console.log('[JOBS] Processing overdue jobs on startup...');
    
    try {
        const now = new Date().toISOString();
        const overdueJobs = await jobsStore.pullDue(now);
        
        if (overdueJobs.length > 0) {
            console.log(`[JOBS] Found ${overdueJobs.length} overdue jobs`);
            
            for (const job of overdueJobs) {
                await processJob(job, client);
            }
        }
    } catch (error) {
        console.error('[JOBS] Error processing overdue jobs:', error);
    }
}

module.exports = {
    start,
    stop,
    processOverdueJobs
};
