/**
 * Time Parsing Utilities
 * Handles absolute times ("at 10am"), relative ("this morning"), and meal windows
 */

const chrono = require('chrono-node');
const moment = require('moment-timezone');

/**
 * Parse absolute time from text
 * @param {string} text - Input text (e.g., "at 10am", "7:30 pm")
 * @param {string} tz - Timezone
 * @returns {Object|null} - { time: "HH:mm:ss", timestamp: ISO } or null
 */
function parseAbsolute(text, tz = 'America/Los_Angeles') {
    const parsed = chrono.parse(text);
    if (parsed.length === 0) return null;

    const date = parsed[0].start.date();
    const m = moment(date).tz(tz);

    return {
        time: m.format('HH:mm:ss'),
        timestamp: m.toISOString(),
        source: 'absolute'
    };
}

/**
 * Parse relative time phrases (dayparts)
 * @param {string} text - Input text (e.g., "this morning", "earlier", "tonight")
 * @param {string} tz - Timezone
 * @returns {Object|null} - { approx: "morning", meal_time: "breakfast" } or null
 * NOTE: Returns approx only, NOT exact time (fixes "this morning" → 23:00 bug)
 */
function parseRelative(text, tz = 'America/Los_Angeles') {
    const lower = text.toLowerCase();

    // Map relative phrases to approximate time buckets
    const relativeMap = {
        'this morning': { approx: 'morning', meal_time: 'breakfast' },
        'earlier': { approx: 'earlier', meal_time: null },
        'tonight': { approx: 'night', meal_time: 'dinner' },
        'this evening': { approx: 'evening', meal_time: 'dinner' },
        'this afternoon': { approx: 'afternoon', meal_time: 'lunch' },
        'at night': { approx: 'night', meal_time: 'late' },
        'late night': { approx: 'late', meal_time: 'late' },
        'at lunch': { approx: 'midday', meal_time: 'lunch' }
    };

    for (const [phrase, result] of Object.entries(relativeMap)) {
        if (lower.includes(phrase)) {
            return {
                approx: result.approx,
                meal_time: result.meal_time,
                source: 'relative',
                // Do NOT include exact time - it's approximate only
                isApproximate: true
            };
        }
    }

    return null;
}

/**
 * Infer meal window from current time
 * @param {string} tz - Timezone
 * @returns {Object} - { meal_time: string, inferred: true }
 */
function inferMealWindow(tz = 'America/Los_Angeles') {
    const now = moment().tz(tz);
    const hour = now.hour();

    if (hour >= 5 && hour < 11) return { meal_time: 'breakfast', inferred: true };
    if (hour >= 11 && hour < 15) return { meal_time: 'lunch', inferred: true };
    if (hour >= 15 && hour < 17) return { meal_time: 'snack', inferred: true };
    if (hour >= 17 && hour < 22) return { meal_time: 'dinner', inferred: true };
    if (hour >= 22 || hour < 2) return { meal_time: 'late', inferred: true };

    return { meal_time: 'snack', inferred: true };
}

/**
 * Parse all time information from text
 * @param {string} text - Input text
 * @param {string} tz - Timezone
 * @returns {Object} - { time, timestamp, meal_time, approx, source }
 */
function parseTimeInfo(text, tz = 'America/Los_Angeles') {
    const result = {
        time: null,
        timestamp: null,
        meal_time: null,
        approx: null,
        source: null
    };

    // Try absolute time first
    const absolute = parseAbsolute(text, tz);
    if (absolute) {
        result.time = absolute.time;
        result.timestamp = absolute.timestamp;
        result.source = 'absolute';
        return result;
    }

    // Try relative phrases
    const relative = parseRelative(text, tz);
    if (relative) {
        result.approx = relative.approx;
        result.meal_time = relative.meal_time;
        result.source = 'relative';
        return result;
    }

    // Check for meal time keywords
    const mealKeywords = {
        'breakfast': ['breakfast', 'brekkie', 'for breakfast'],
        'lunch': ['lunch', 'for lunch'],
        'dinner': ['dinner', 'supper', 'for dinner'],
        'snack': ['snack', 'for snack']
    };

    const lower = text.toLowerCase();
    for (const [meal, keywords] of Object.entries(mealKeywords)) {
        if (keywords.some(kw => lower.includes(kw))) {
            result.meal_time = meal;
            result.source = 'keyword';
            return result;
        }
    }

    // Fallback: infer from current time
    const inferred = inferMealWindow(tz);
    result.meal_time = inferred.meal_time;
    result.source = 'inferred';

    return result;
}

module.exports = {
    parseAbsolute,
    parseRelative,
    inferMealWindow,
    parseTimeInfo
};
