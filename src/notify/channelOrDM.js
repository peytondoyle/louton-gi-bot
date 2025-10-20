/**
 * Notification System
 * Handles DM delivery with fallback to channel notifications
 */

/**
 * Try to send a DM to a user
 * @param {Object} client - Discord client
 * @param {string} userId - Discord user ID
 * @param {string} content - Message content
 * @param {Array} [components] - Discord components (buttons, etc.)
 * @returns {Promise<Object>} - { ok: boolean, method: string, error?: string }
 */
async function tryDM(client, userId, content, components = []) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) {
            return { ok: false, method: 'dm', error: 'User not found' };
        }
        
        const messageOptions = { content };
        if (components.length > 0) {
            messageOptions.components = components;
        }
        
        await user.send(messageOptions);
        return { ok: true, method: 'dm' };
        
    } catch (error) {
        if (error.code === 50007) {
            return { 
                ok: false, 
                method: 'dm', 
                error: 'Cannot send messages to this user - DMs disabled' 
            };
        } else {
            return { 
                ok: false, 
                method: 'dm', 
                error: error.message 
            };
        }
    }
}

/**
 * Send notification to a channel as fallback
 * @param {Object} client - Discord client
 * @param {string} channelId - Discord channel ID
 * @param {string} userId - Discord user ID (for ping)
 * @param {string} content - Message content
 * @param {Array} [components] - Discord components
 * @returns {Promise<Object>} - { ok: boolean, method: string, error?: string }
 */
async function sendChannelNotification(client, channelId, userId, content, components = []) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            return { ok: false, method: 'channel', error: 'Channel not found' };
        }
        
        const messageOptions = { 
            content: `<@${userId}> ${content}` 
        };
        if (components.length > 0) {
            messageOptions.components = components;
        }
        
        await channel.send(messageOptions);
        return { ok: true, method: 'channel' };
        
    } catch (error) {
        return { 
            ok: false, 
            method: 'channel', 
            error: error.message 
        };
    }
}

/**
 * Smart notification delivery
 * Tries DM first, falls back to channel if DMs are disabled
 * @param {Object} client - Discord client
 * @param {string} userId - Discord user ID
 * @param {string} channelId - Fallback channel ID
 * @param {string} content - Message content
 * @param {Array} [components] - Discord components
 * @returns {Promise<Object>} - Delivery result
 */
async function deliverNotification(client, userId, channelId, content, components = []) {
    // Try DM first
    const dmResult = await tryDM(client, userId, content, components);
    
    if (dmResult.ok) {
        console.log(`[NOTIFY] Delivered DM to user ${userId}`);
        return dmResult;
    }
    
    // Fall back to channel notification
    console.log(`[NOTIFY] DM failed for user ${userId}, trying channel notification`);
    const channelResult = await sendChannelNotification(client, channelId, userId, content, components);
    
    if (channelResult.ok) {
        console.log(`[NOTIFY] Delivered channel notification to user ${userId}`);
        return channelResult;
    }
    
    // Both methods failed
    console.error(`[NOTIFY] Failed to deliver notification to user ${userId}:`, {
        dmError: dmResult.error,
        channelError: channelResult.error
    });
    
    return { 
        ok: false, 
        method: 'none', 
        error: 'Both DM and channel delivery failed' 
    };
}

/**
 * Test DM handshake for a user
 * Used to check if DMs are enabled when setting up reminders
 * @param {Object} client - Discord client
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object>} - Handshake result
 */
async function testDMHandshake(client, userId) {
    const testContent = "🔧 Testing DM delivery for calorie reminders...";
    
    const result = await tryDM(client, userId, testContent);
    
    if (result.ok) {
        return {
            success: true,
            message: "✅ DMs are enabled! I can send you calorie reminders directly."
        };
    } else {
        return {
            success: false,
            message: `❌ DMs are disabled. Please enable "Allow direct messages from server members" in your Discord settings (User Settings → Privacy & Safety). I'll use channel notifications as a fallback.`
        };
    }
}

/**
 * Get user's preferred notification channel
 * @param {string} userId - Discord user ID
 * @returns {Promise<string|null>} - Channel ID or null
 */
async function getUserNotificationChannel(userId) {
    // This could be stored in user preferences
    // For now, return null to use a default channel
    return null;
}

module.exports = {
    tryDM,
    sendChannelNotification,
    deliverNotification,
    testDMHandshake,
    getUserNotificationChannel
};
