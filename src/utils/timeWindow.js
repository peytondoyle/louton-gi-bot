/**
 * Time Window Calculator
 * Maps clock time to meal periods (breakfast, lunch, dinner, snack, late)
 */

const moment = require('moment-timezone');

// Meal window definitions (24-hour format)
const MEAL_WINDOWS = {
    breakfast: { start: 5, end: 11, label: 'breakfast', approx: 'morning' },
    lunch: { start: 11, end: 15, label: 'lunch', approx: 'midday' },
    snack: { start: 15, end: 17, label: 'snack', approx: 'afternoon' },
    dinner: { start: 17, end: 22, label: 'dinner', approx: 'evening' },
    late: { start: 22, end: 2, label: 'late', approx: 'night' } // Overnight: 22:00-02:00
};

/**
 * Get meal period from time
 * @param {Date|string} time - Time object or ISO string
 * @param {string} tz - Timezone
 * @returns {Object} - { meal, approx }
 */
function getMealPeriod(time = new Date(), tz = 'America/Los_Angeles') {
    const m = moment(time).tz(tz);
    const hour = m.hour();

    // Check each window
    for (const [key, window] of Object.entries(MEAL_WINDOWS)) {
        // Handle overnight window (late: 22-02)
        if (window.start > window.end) {
            if (hour >= window.start || hour < window.end) {
                return {
                    meal: window.label,
                    approx: window.approx
                };
            }
        } else {
            if (hour >= window.start && hour < window.end) {
                return {
                    meal: window.label,
                    approx: window.approx
                };
            }
        }
    }

    // Fallback (shouldn't happen with full coverage)
    return { meal: 'snack', approx: 'afternoon' };
}

/**
 * Get current meal period
 * @param {string} tz - Timezone
 * @returns {Object} - { meal, approx }
 */
function getCurrentMealPeriod(tz = 'America/Los_Angeles') {
    return getMealPeriod(new Date(), tz);
}

/**
 * Check if time is in specific meal window
 * @param {Date|string} time - Time to check
 * @param {string} mealType - Meal type to check against
 * @param {string} tz - Timezone
 * @returns {boolean}
 */
function isInMealWindow(time, mealType, tz = 'America/Los_Angeles') {
    const { meal } = getMealPeriod(time, tz);
    return meal === mealType;
}

module.exports = {
    MEAL_WINDOWS,
    getMealPeriod,
    getCurrentMealPeriod,
    isInMealWindow
};
