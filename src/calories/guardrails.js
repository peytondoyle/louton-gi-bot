/**
 * Daily Goal Guardrails System
 * Monitors daily progress and sends proactive nudges
 */

const { shouldEnableCalorieFeatures } = require('../auth/scope');
const { calculateDailyTotals, getDailyKcalTarget } = require('./estimate');
const { deliverNotification } = require('../notify/channelOrDM');

/**
 * Check if user needs a guardrail nudge
 * @param {string} userId - User ID
 * @param {Object} dailyTotals - Daily calorie totals
 * @param {number} target - Daily calorie target
 * @param {Date} currentTime - Current time
 * @returns {Object|null} - Guardrail recommendation or null
 */
function checkGuardrailNeeded(userId, dailyTotals, target, currentTime) {
    // Only for calorie users
    if (!shouldEnableCalorieFeatures(userId)) return null;
    
    const progress = dailyTotals.calories / target;
    const hour = currentTime.getHours();
    
    // Check if user is trending high by mid-day
    if (hour >= 13 && hour <= 15) { // 1-3 PM
        if (progress >= 0.85) {
            return {
                type: 'high_intake_midday',
                severity: 'warning',
                message: generateMiddayNudge(dailyTotals, target, progress),
                suggestedAction: 'higher_protein_dinner'
            };
        }
    }
    
    // Check if user is way over target
    if (progress >= 1.2) {
        return {
            type: 'over_target',
            severity: 'alert',
            message: generateOverTargetMessage(dailyTotals, target, progress),
            suggestedAction: 'adjust_plan'
        };
    }
    
    // Check if user is significantly under target by evening
    if (hour >= 18 && hour <= 20) { // 6-8 PM
        if (progress <= 0.6) {
            return {
                type: 'low_intake_evening',
                severity: 'info',
                message: generateEveningNudge(dailyTotals, target, progress),
                suggestedAction: 'add_snack'
            };
        }
    }
    
    return null;
}

/**
 * Generate midday high-intake nudge
 * @param {Object} totals - Daily totals
 * @param {number} target - Daily target
 * @param {number} progress - Progress percentage
 * @returns {string} - Nudge message
 */
function generateMiddayNudge(totals, target, progress) {
    const percentage = Math.round(progress * 100);
    const remaining = target - totals.calories;
    
    return `📊 **Daily Progress Alert**\n\n` +
           `You're at ${percentage}% of today's ${target.toLocaleString()} kcal target.\n` +
           `Only ${remaining.toLocaleString()} kcal remaining for the day.\n\n` +
           `💡 **Suggestion**: Plan a higher-protein dinner to stay satisfied with fewer calories.`;
}

/**
 * Generate over-target message
 * @param {Object} totals - Daily totals
 * @param {number} target - Daily target
 * @param {number} progress - Progress percentage
 * @returns {string} - Alert message
 */
function generateOverTargetMessage(totals, target, progress) {
    const overage = totals.calories - target;
    const percentage = Math.round(progress * 100);
    
    return `⚠️ **Target Exceeded**\n\n` +
           `You're at ${percentage}% of your daily target (+${overage.toLocaleString()} kcal over).\n\n` +
           `💡 **Suggestion**: Consider lighter meals tomorrow or adjust your target if this is intentional.`;
}

/**
 * Generate evening low-intake nudge
 * @param {Object} totals - Daily totals
 * @param {number} target - Daily target
 * @param {number} progress - Progress percentage
 * @returns {string} - Nudge message
 */
function generateEveningNudge(totals, target, progress) {
    const percentage = Math.round(progress * 100);
    const remaining = target - totals.calories;
    
    return `📊 **Evening Check-in**\n\n` +
           `You're at ${percentage}% of today's target with ${remaining.toLocaleString()} kcal remaining.\n\n` +
           `💡 **Suggestion**: Consider a healthy snack if you're still hungry.`;
}

/**
 * Get guardrail status for user
 * @param {string} userId - User ID
 * @param {Array} todayEntries - Today's food entries
 * @param {Date} currentTime - Current time
 * @returns {Object} - Guardrail status
 */
async function getGuardrailStatus(userId, todayEntries, currentTime) {
    if (!shouldEnableCalorieFeatures(userId)) {
        return { enabled: false, reason: 'not_calorie_user' };
    }
    
    const totals = calculateDailyTotals(todayEntries);
    const target = await getDailyKcalTarget(userId);
    const progress = totals.calories / target;
    
    const status = {
        enabled: true,
        currentProgress: Math.round(progress * 100),
        caloriesConsumed: totals.calories,
        caloriesRemaining: target - totals.calories,
        target: target,
        hour: currentTime.getHours(),
        status: getProgressStatus(progress, currentTime.getHours())
    };
    
    return status;
}

/**
 * Get progress status based on time and percentage
 * @param {number} progress - Progress percentage (0-1)
 * @param {number} hour - Current hour
 * @returns {string} - Status description
 */
function getProgressStatus(progress, hour) {
    if (progress >= 1.2) return 'over_target';
    if (progress >= 1.0) return 'at_target';
    if (progress >= 0.85) return 'approaching_target';
    if (progress >= 0.6) return 'on_track';
    if (progress >= 0.4) return 'behind_pace';
    return 'significantly_behind';
}

/**
 * Check if guardrail should be throttled (once per day)
 * @param {string} userId - User ID
 * @param {string} guardrailType - Type of guardrail
 * @param {Object} userProfile - User profile data
 * @returns {boolean} - Whether guardrail should be sent
 */
function shouldSendGuardrail(userId, guardrailType, userProfile) {
    const today = new Date().toISOString().slice(0, 10);
    const lastSent = userProfile.guardrails?.[guardrailType]?.lastSent;
    
    if (lastSent === today) {
        return false; // Already sent today
    }
    
    return true;
}

/**
 * Record guardrail sent
 * @param {string} userId - User ID
 * @param {string} guardrailType - Type of guardrail
 * @param {Object} userProfile - User profile data
 * @returns {Object} - Updated user profile
 */
function recordGuardrailSent(userId, guardrailType, userProfile) {
    const today = new Date().toISOString().slice(0, 10);
    
    if (!userProfile.guardrails) {
        userProfile.guardrails = {};
    }
    
    userProfile.guardrails[guardrailType] = {
        lastSent: today,
        count: (userProfile.guardrails[guardrailType]?.count || 0) + 1
    };
    
    return userProfile;
}

/**
 * Generate guardrail components (buttons)
 * @param {string} guardrailType - Type of guardrail
 * @returns {Array} - Discord components
 */
function generateGuardrailComponents(guardrailType) {
    const components = [];
    
    switch (guardrailType) {
        case 'high_intake_midday':
            components.push({
                type: 1, // ActionRow
                components: [
                    {
                        type: 2, // Button
                        style: 1, // Primary
                        label: 'Plan Protein Dinner',
                        custom_id: 'guardrail:plan_dinner',
                        emoji: { name: '🥩' }
                    },
                    {
                        type: 2, // Button
                        style: 2, // Secondary
                        label: 'Adjust Target',
                        custom_id: 'guardrail:adjust_target',
                        emoji: { name: '⚙️' }
                    },
                    {
                        type: 2, // Button
                        style: 3, // Success
                        label: 'Dismiss',
                        custom_id: 'guardrail:dismiss',
                        emoji: { name: '✅' }
                    }
                ]
            });
            break;
            
        case 'over_target':
            components.push({
                type: 1, // ActionRow
                components: [
                    {
                        type: 2, // Button
                        style: 1, // Primary
                        label: 'Adjust Target',
                        custom_id: 'guardrail:adjust_target',
                        emoji: { name: '⚙️' }
                    },
                    {
                        type: 2, // Button
                        style: 2, // Secondary
                        label: 'Log Exercise',
                        custom_id: 'guardrail:log_exercise',
                        emoji: { name: '🏃' }
                    },
                    {
                        type: 2, // Button
                        style: 3, // Success
                        label: 'Dismiss',
                        custom_id: 'guardrail:dismiss',
                        emoji: { name: '✅' }
                    }
                ]
            });
            break;
    }
    
    return components;
}

module.exports = {
    checkGuardrailNeeded,
    getGuardrailStatus,
    shouldSendGuardrail,
    recordGuardrailSent,
    generateGuardrailComponents
};
