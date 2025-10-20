/**
 * User Authorization & Feature Scoping
 * Controls which users have access to calorie tracking features
 */

// Parse allowed calorie users from environment variable
// Format: "123456789,987654321" (Discord user IDs)
const ALLOWED_CAL_USERS = new Set(
    (process.env.ALLOWED_CAL_USERS || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean)
);

/**
 * Check if a user is authorized for calorie tracking features
 * @param {string} userId - Discord user ID
 * @returns {boolean} - True if user can access calorie features
 */
function isCalorieUser(userId) {
    return ALLOWED_CAL_USERS.has(userId);
}

/**
 * Get list of authorized calorie users (for debugging)
 * @returns {Array<string>} - Array of authorized user IDs
 */
function getCalorieUsers() {
    return Array.from(ALLOWED_CAL_USERS);
}

/**
 * Check if calorie features should be enabled for a user
 * This is the main gate for all calorie-related functionality
 * @param {string} userId - Discord user ID
 * @returns {boolean} - True if calorie features should be enabled
 */
function shouldEnableCalorieFeatures(userId) {
    return isCalorieUser(userId);
}

module.exports = {
    isCalorieUser,
    getCalorieUsers,
    shouldEnableCalorieFeatures
};
