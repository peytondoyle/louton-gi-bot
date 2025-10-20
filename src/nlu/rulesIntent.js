/**
 * Natural Language Intent Rules
 * Parses complex user intents from natural language
 */

/**
 * Parse reminder intent from natural language
 * Examples:
 * - "ask me 30 min after every meal to log calories"
 * - "remind me 15 minutes after breakfast to add calories"
 * - "ping me 45 min after dinner to log calories"
 * 
 * @param {string} text - User input text
 * @returns {Object|null} - Parsed reminder rule or null if no match
 */
function parseReminderIntent(text) {
    const t = text.toLowerCase().trim();
    
    // Pattern: (ask|remind|ping) me (\d+) min(?:ute)?s? after (every )?(meal|breakfast|lunch|dinner) to (log|enter|add) cal(or(?:ies)?)?
    const match = t.match(/(ask|remind|ping)\s+me\s+(\d+)\s*min(?:ute)?s?\s+after\s+(every\s+)?(meal|breakfast|lunch|dinner)\s+to\s+(log|enter|add)\s+cal(or(?:ies)?)?/);
    
    if (!match) return null;
    
    const [, action, delayMin, everyPrefix, mealType, logAction, calSuffix] = match;
    
    return {
        kind: "after_meal_ping",
        delayMin: parseInt(delayMin, 10),
        scope: everyPrefix ? "every_meal" : mealType,
        action: action,
        logAction: logAction
    };
}

/**
 * Parse stop reminder intent
 * Examples:
 * - "stop meal reminders"
 * - "turn off calorie reminders"
 * - "disable meal pings"
 * 
 * @param {string} text - User input text
 * @returns {Object|null} - Parsed stop rule or null if no match
 */
function parseStopReminderIntent(text) {
    const t = text.toLowerCase().trim();
    
    // Pattern: (stop|turn off|disable) (meal|calorie) (reminders|pings)
    const match = t.match(/(stop|turn\s+off|disable)\s+(meal|calorie)\s+(reminders|pings)/);
    
    if (!match) return null;
    
    const [, action, type, target] = match;
    
    return {
        kind: "stop_meal_reminders",
        action: action,
        type: type,
        target: target
    };
}

/**
 * Parse calorie target intent
 * Examples:
 * - "set my calorie target to 2500"
 * - "change daily calories to 2000"
 * - "update target to 1800 calories"
 * 
 * @param {string} text - User input text
 * @returns {Object|null} - Parsed target rule or null if no match
 */
function parseCalorieTargetIntent(text) {
    const t = text.toLowerCase().trim();
    
    // Pattern: (set|change|update) (my|daily) (calorie|cal) target to (\d+)
    const match = t.match(/(set|change|update)\s+(my\s+)?(daily\s+)?(calorie|cal)\s+target\s+to\s+(\d+)/);
    
    if (!match) return null;
    
    const [, action, myPrefix, dailyPrefix, calPrefix, target] = match;
    
    return {
        kind: "set_calorie_target",
        action: action,
        target: parseInt(target, 10)
    };
}

/**
 * Main intent parser - tries all rule parsers
 * @param {string} text - User input text
 * @returns {Object|null} - First matching intent or null
 */
function parseComplexIntent(text) {
    // Try reminder intent first (most specific)
    const reminder = parseReminderIntent(text);
    if (reminder) return reminder;
    
    // Try stop reminder intent
    const stopReminder = parseStopReminderIntent(text);
    if (stopReminder) return stopReminder;
    
    // Try calorie target intent
    const target = parseCalorieTargetIntent(text);
    if (target) return target;
    
    return null;
}

module.exports = {
    parseReminderIntent,
    parseStopReminderIntent,
    parseCalorieTargetIntent,
    parseComplexIntent
};
