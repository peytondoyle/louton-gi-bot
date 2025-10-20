/**
 * Preferences Compatibility Layer
 * Provides backward compatibility for old prefs.js functions
 */

const { getUserProfile, updateUserProfile } = require('./userProfile');

/**
 * Get user preferences (compatibility function)
 * @param {string} userId - User ID
 * @param {Object} googleSheets - Google Sheets service
 * @returns {Promise<Object>} - User preferences
 */
async function getUserPrefs(userId, googleSheets) {
    const profile = await getUserProfile(userId, googleSheets);
    return profile.prefs || {};
}

/**
 * Set user preferences (compatibility function)
 * @param {string} userId - User ID
 * @param {Object} prefs - Preferences to set
 * @param {Object} googleSheets - Google Sheets service
 * @returns {Promise<void>}
 */
async function setUserPrefs(userId, prefs, googleSheets) {
    const profile = await getUserProfile(userId, googleSheets);
    profile.prefs = { ...profile.prefs, ...prefs };
    await updateUserProfile(userId, profile, googleSheets);
}

/**
 * List all preferences (compatibility function)
 * @param {Object} googleSheets - Google Sheets service
 * @returns {Promise<Array>} - List of all user preferences
 */
async function listAllPrefs(googleSheets) {
    // This is a simplified implementation
    // In a real scenario, you'd query all users
    return [];
}

/**
 * Check if user is on cooldown (compatibility function)
 * @param {string} userId - User ID
 * @param {string} type - Cooldown type
 * @param {string} nowISO - Current time
 * @param {Object} googleSheets - Google Sheets service
 * @returns {Promise<boolean>} - Whether user is on cooldown
 */
async function isOnCooldown(userId, type, nowISO, googleSheets) {
    const profile = await getUserProfile(userId, googleSheets);
    const cooldowns = profile.cooldowns || {};
    const cooldownUntil = cooldowns[type];
    
    if (!cooldownUntil) return false;
    
    return new Date(nowISO) < new Date(cooldownUntil);
}

/**
 * Set cooldown (compatibility function)
 * @param {string} userId - User ID
 * @param {string} type - Cooldown type
 * @param {string} untilISO - Cooldown end time
 * @param {Object} googleSheets - Google Sheets service
 * @returns {Promise<void>}
 */
async function setCooldown(userId, type, untilISO, googleSheets) {
    const profile = await getUserProfile(userId, googleSheets);
    if (!profile.cooldowns) profile.cooldowns = {};
    profile.cooldowns[type] = untilISO;
    await updateUserProfile(userId, profile, googleSheets);
}

module.exports = {
    getUserPrefs,
    setUserPrefs,
    listAllPrefs,
    isOnCooldown,
    setCooldown
};
