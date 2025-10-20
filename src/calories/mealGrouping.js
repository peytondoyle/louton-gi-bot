/**
 * Meal Grouping & Quick-Add System
 * Groups food entries within time windows and provides quick-add functionality
 */

const time = require('../utils/time');

/**
 * Group food entries by time windows
 * @param {Array} foodEntries - Array of food entries
 * @param {number} windowMinutes - Time window in minutes (default: 60)
 * @returns {Array} - Array of meal groups
 */
function groupFoodEntries(foodEntries, windowMinutes = 60) {
    if (!foodEntries || foodEntries.length === 0) return [];
    
    // Sort entries by timestamp
    const sortedEntries = foodEntries
        .filter(entry => entry.Type === 'food' || entry.Type === 'drink')
        .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
    
    const groups = [];
    let currentGroup = null;
    
    for (const entry of sortedEntries) {
        const entryTime = new Date(entry.Timestamp);
        
        if (!currentGroup) {
            // Start first group
            currentGroup = {
                id: generateMealId(entryTime),
                startTime: entryTime,
                endTime: entryTime,
                entries: [entry],
                totalCalories: parseFloat(entry.Calories) || 0,
                totalProtein: parseFloat(entry.Protein) || 0,
                totalCarbs: parseFloat(entry.Carbs) || 0,
                totalFat: parseFloat(entry.Fat) || 0
            };
        } else {
            const timeDiff = entryTime - currentGroup.startTime;
            const diffMinutes = timeDiff / (1000 * 60);
            
            if (diffMinutes <= windowMinutes) {
                // Add to current group
                currentGroup.entries.push(entry);
                currentGroup.endTime = entryTime;
                currentGroup.totalCalories += parseFloat(entry.Calories) || 0;
                currentGroup.totalProtein += parseFloat(entry.Protein) || 0;
                currentGroup.totalCarbs += parseFloat(entry.Carbs) || 0;
                currentGroup.totalFat += parseFloat(entry.Fat) || 0;
            } else {
                // Start new group
                groups.push(currentGroup);
                currentGroup = {
                    id: generateMealId(entryTime),
                    startTime: entryTime,
                    endTime: entryTime,
                    entries: [entry],
                    totalCalories: parseFloat(entry.Calories) || 0,
                    totalProtein: parseFloat(entry.Protein) || 0,
                    totalCarbs: parseFloat(entry.Carbs) || 0,
                    totalFat: parseFloat(entry.Fat) || 0
                };
            }
        }
    }
    
    // Add the last group
    if (currentGroup) {
        groups.push(currentGroup);
    }
    
    return groups;
}

/**
 * Generate a unique meal ID
 * @param {Date} timestamp - Meal timestamp
 * @returns {string} - Meal ID in format YYYYMMDD-HHMM
 */
function generateMealId(timestamp) {
    const date = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
    const time = timestamp.toISOString().slice(11, 16).replace(':', '');
    return `${date}-${time}`;
}

/**
 * Format meal group for display
 * @param {Object} mealGroup - Meal group object
 * @returns {string} - Formatted meal description
 */
function formatMealGroup(mealGroup) {
    const startTime = time.format(mealGroup.startTime, 'h:mm a');
    const mealType = inferMealType(mealGroup.startTime);
    const itemCount = mealGroup.entries.length;
    
    return `${mealType} @ ${startTime} (${itemCount} items)`;
}

/**
 * Infer meal type from timestamp
 * @param {Date} timestamp - Meal timestamp
 * @returns {string} - Meal type
 */
function inferMealType(timestamp) {
    const hour = timestamp.getHours();
    
    if (hour >= 5 && hour < 11) return 'Breakfast';
    if (hour >= 11 && hour < 15) return 'Lunch';
    if (hour >= 15 && hour < 22) return 'Dinner';
    return 'Snack';
}

/**
 * Create synthetic meal total entry
 * @param {Object} mealGroup - Meal group object
 * @param {string} userId - User ID
 * @returns {Object} - Synthetic meal total entry
 */
function createMealTotalEntry(mealGroup, userId) {
    const now = new Date();
    
    return {
        Timestamp: now.toISOString(),
        Date: now.toISOString().slice(0, 10),
        Time: now.toISOString().slice(11, 19),
        User: userId,
        Type: 'meal_total',
        Item: `Meal Total - ${formatMealGroup(mealGroup)}`,
        Calories: Math.round(mealGroup.totalCalories),
        Protein: Math.round(mealGroup.totalProtein * 10) / 10,
        Carbs: Math.round(mealGroup.totalCarbs * 10) / 10,
        Fat: Math.round(mealGroup.totalFat * 10) / 10,
        Notes: `meal_id=${mealGroup.id}; grouped_entries=${mealGroup.entries.length}`,
        Source: 'meal_grouping'
    };
}

/**
 * Check if meal grouping should be offered
 * @param {Array} recentEntries - Recent food entries
 * @param {number} windowMinutes - Time window in minutes
 * @returns {Object|null} - Meal group to offer or null
 */
function shouldOfferMealGrouping(recentEntries, windowMinutes = 60) {
    const groups = groupFoodEntries(recentEntries, windowMinutes);
    
    // Look for groups with 2+ entries
    const eligibleGroups = groups.filter(group => 
        group.entries.length >= 2 && 
        group.entries.some(entry => !entry.Calories || entry.Calories === '')
    );
    
    if (eligibleGroups.length === 0) return null;
    
    // Return the most recent eligible group
    return eligibleGroups[eligibleGroups.length - 1];
}

/**
 * Generate meal grouping message
 * @param {Object} mealGroup - Meal group to offer
 * @returns {string} - User message
 */
function generateMealGroupingMessage(mealGroup) {
    const mealDesc = formatMealGroup(mealGroup);
    const totalCalories = Math.round(mealGroup.totalCalories);
    const itemCount = mealGroup.entries.length;
    
    return `🍽️ **Meal Grouping Available**\n\n` +
           `I found ${itemCount} items for ${mealDesc}.\n` +
           `Total: ~${totalCalories} kcal\n\n` +
           `Would you like to log this as a combined meal?`;
}

/**
 * Get meal group summary
 * @param {Object} mealGroup - Meal group object
 * @returns {Object} - Summary statistics
 */
function getMealGroupSummary(mealGroup) {
    return {
        itemCount: mealGroup.entries.length,
        totalCalories: Math.round(mealGroup.totalCalories),
        totalProtein: Math.round(mealGroup.totalProtein * 10) / 10,
        totalCarbs: Math.round(mealGroup.totalCarbs * 10) / 10,
        totalFat: Math.round(mealGroup.totalFat * 10) / 10,
        duration: Math.round((mealGroup.endTime - mealGroup.startTime) / (1000 * 60)),
        mealType: inferMealType(mealGroup.startTime)
    };
}

module.exports = {
    groupFoodEntries,
    generateMealId,
    formatMealGroup,
    createMealTotalEntry,
    shouldOfferMealGrouping,
    generateMealGroupingMessage,
    getMealGroupSummary
};
