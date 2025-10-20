/**
 * Get Sheet Name Utility
 * Determines the appropriate Google Sheet name for a user
 */

/**
 * Get the sheet name for a user based on their ID
 * @param {string} userId - Discord user ID
 * @param {string} userTag - Discord user tag (username#discriminator)
 * @returns {string} - Sheet name for the user
 */
function getSheetName(userId, userTag) {
    const PEYTON_ID = process.env.PEYTON_ID || "552563833814646806";
    const LOUIS_ID = process.env.LOUIS_ID || "552563833814646807";

    if (userId === PEYTON_ID) return "Peyton";
    if (userId === LOUIS_ID) return "Louis";
    
    // For other users, use a sanitized version of their username
    // Remove special characters and limit length
    const sanitizedTag = userTag
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 20);
    
    return sanitizedTag || "General";
}

module.exports = {
    getSheetName
};
