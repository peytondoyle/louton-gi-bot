/**
 * DM Health Monitor
 * Monitors DM delivery success and manages fallback strategies
 */

const { tryDM, deliverNotification } = require('./channelOrDM');
const { shouldEnableCalorieFeatures } = require('../auth/scope');

/**
 * Send nightly heartbeat DM
 * @param {Object} client - Discord client
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Delivery result
 */
async function sendHeartbeatDM(client, userId) {
    if (!shouldEnableCalorieFeatures(userId)) {
        return { success: false, reason: 'not_calorie_user' };
    }
    
    const heartbeatMessage = '✅ **Notifications OK**\n\n' +
        'Your calorie reminders are working properly. ' +
        'I\'ll continue sending them as scheduled.';
    
    try {
        const result = await tryDM(client, userId, heartbeatMessage);
        
        if (result.ok) {
            console.log(`[HEARTBEAT] ✅ DM delivered to user ${userId}`);
            return {
                success: true,
                method: 'dm',
                timestamp: new Date().toISOString()
            };
        } else {
            console.log(`[HEARTBEAT] ❌ DM failed for user ${userId}: ${result.error}`);
            return {
                success: false,
                method: 'dm',
                error: result.error,
                timestamp: new Date().toISOString()
            };
        }
    } catch (error) {
        console.error(`[HEARTBEAT] Error sending heartbeat to user ${userId}:`, error);
        return {
            success: false,
            method: 'dm',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Check DM health for a user
 * @param {string} userId - User ID
 * @param {Object} userProfile - User profile data
 * @returns {Object} - DM health status
 */
function checkDMHealth(userId, userProfile) {
    if (!shouldEnableCalorieFeatures(userId)) {
        return { enabled: false, reason: 'not_calorie_user' };
    }
    
    const dmHealth = userProfile.dmHealth || {
        consecutiveFailures: 0,
        lastSuccess: null,
        lastFailure: null,
        fallbackMode: false,
        heartbeatSent: false
    };
    
    return {
        enabled: true,
        consecutiveFailures: dmHealth.consecutiveFailures,
        lastSuccess: dmHealth.lastSuccess,
        lastFailure: dmHealth.lastFailure,
        fallbackMode: dmHealth.fallbackMode,
        heartbeatSent: dmHealth.heartbeatSent,
        status: getDMStatus(dmHealth)
    };
}

/**
 * Get DM status description
 * @param {Object} dmHealth - DM health data
 * @returns {string} - Status description
 */
function getDMStatus(dmHealth) {
    if (dmHealth.fallbackMode) return 'fallback_mode';
    if (dmHealth.consecutiveFailures >= 2) return 'unhealthy';
    if (dmHealth.consecutiveFailures === 1) return 'warning';
    if (dmHealth.lastSuccess) return 'healthy';
    return 'unknown';
}

/**
 * Record DM delivery result
 * @param {string} userId - User ID
 * @param {boolean} success - Whether delivery succeeded
 * @param {string} method - Delivery method used
 * @param {Object} userProfile - User profile data
 * @returns {Object} - Updated user profile
 */
function recordDMResult(userId, success, method, userProfile) {
    if (!userProfile.dmHealth) {
        userProfile.dmHealth = {
            consecutiveFailures: 0,
            lastSuccess: null,
            lastFailure: null,
            fallbackMode: false,
            heartbeatSent: false
        };
    }
    
    const now = new Date().toISOString();
    
    if (success) {
        userProfile.dmHealth.consecutiveFailures = 0;
        userProfile.dmHealth.lastSuccess = now;
        userProfile.dmHealth.fallbackMode = false;
    } else {
        userProfile.dmHealth.consecutiveFailures += 1;
        userProfile.dmHealth.lastFailure = now;
        
        // Enable fallback mode after 2 consecutive failures
        if (userProfile.dmHealth.consecutiveFailures >= 2) {
            userProfile.dmHealth.fallbackMode = true;
        }
    }
    
    return userProfile;
}

/**
 * Check if user needs fallback notification
 * @param {string} userId - User ID
 * @param {Object} userProfile - User profile data
 * @returns {boolean} - Whether fallback is needed
 */
function needsFallbackNotification(userId, userProfile) {
    if (!shouldEnableCalorieFeatures(userId)) return false;
    
    const dmHealth = userProfile.dmHealth;
    if (!dmHealth) return false;
    
    return dmHealth.fallbackMode || dmHealth.consecutiveFailures >= 2;
}

/**
 * Generate fallback notification message
 * @param {string} userId - User ID
 * @param {Object} userProfile - User profile data
 * @returns {string} - Fallback message
 */
function generateFallbackMessage(userId, userProfile) {
    const dmHealth = userProfile.dmHealth;
    const failureCount = dmHealth?.consecutiveFailures || 0;
    
    return `📱 **Notification Update**\n\n` +
           `I've had trouble delivering DMs to you (${failureCount} recent failures).\n\n` +
           `I'll now send calorie reminders in this channel instead.\n\n` +
           `💡 **To restore DMs**: Enable "Allow direct messages from server members" in your Discord settings.`;
}

/**
 * Generate DM restoration message
 * @param {string} userId - User ID
 * @returns {string} - Restoration message
 */
function generateDMRestorationMessage(userId) {
    return `✅ **DMs Restored!**\n\n` +
           `Great! I can now send you direct messages again.\n\n` +
           `I'll switch back to DM delivery for your calorie reminders.`;
}

/**
 * Schedule nightly heartbeat
 * @param {Object} client - Discord client
 * @param {Function} getUserProfile - Function to get user profile
 * @param {Function} updateUserProfile - Function to update user profile
 */
function scheduleNightlyHeartbeat(client, getUserProfile, updateUserProfile) {
    // Schedule for 9 PM daily
    const cron = require('node-cron');
    
    cron.schedule('0 21 * * *', async () => {
        console.log('[HEARTBEAT] Starting nightly DM health check...');
        
        try {
            // Get all calorie users (this would need to be implemented)
            const calorieUsers = await getCalorieUsers();
            
            for (const userId of calorieUsers) {
                try {
                    const userProfile = await getUserProfile(userId);
                    const dmHealth = checkDMHealth(userId, userProfile);
                    
                    if (dmHealth.enabled && !dmHealth.fallbackMode) {
                        const result = await sendHeartbeatDM(client, userId);
                        
                        // Update user profile with result
                        const updatedProfile = recordDMResult(userId, result.success, result.method, userProfile);
                        await updateUserProfile(userId, updatedProfile);
                        
                        if (result.success) {
                            console.log(`[HEARTBEAT] ✅ User ${userId} DM health OK`);
                        } else {
                            console.log(`[HEARTBEAT] ❌ User ${userId} DM health issue: ${result.error}`);
                        }
                    }
                } catch (error) {
                    console.error(`[HEARTBEAT] Error checking user ${userId}:`, error);
                }
            }
        } catch (error) {
            console.error('[HEARTBEAT] Error in nightly heartbeat:', error);
        }
    });
    
    console.log('[HEARTBEAT] Nightly heartbeat scheduled for 9 PM');
}

/**
 * Get all calorie users (placeholder - would need proper implementation)
 * @returns {Promise<Array>} - Array of user IDs
 */
async function getCalorieUsers() {
    // This would need to be implemented based on your user management system
    // For now, return empty array
    return [];
}

/**
 * Handle DM restoration attempt
 * @param {Object} client - Discord client
 * @param {string} userId - User ID
 * @param {Object} userProfile - User profile data
 * @returns {Promise<Object>} - Restoration result
 */
async function attemptDMRestoration(client, userId, userProfile) {
    const testMessage = '🔄 **Testing DM Delivery**\n\n' +
        'This is a test message to check if DMs are working again.';
    
    try {
        const result = await tryDM(client, userId, testMessage);
        
        if (result.ok) {
            // DMs are working again
            const updatedProfile = recordDMResult(userId, true, 'dm', userProfile);
            return {
                success: true,
                message: generateDMRestorationMessage(userId),
                profile: updatedProfile
            };
        } else {
            // DMs still not working
            return {
                success: false,
                message: 'DMs are still not working. Please check your Discord settings.',
                error: result.error
            };
        }
    } catch (error) {
        return {
            success: false,
            message: 'Error testing DM delivery.',
            error: error.message
        };
    }
}

module.exports = {
    sendHeartbeatDM,
    checkDMHealth,
    recordDMResult,
    needsFallbackNotification,
    generateFallbackMessage,
    generateDMRestorationMessage,
    scheduleNightlyHeartbeat,
    attemptDMRestoration
};
