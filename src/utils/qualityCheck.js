/**
 * Quality validation for NLU parse results
 * Prevents low-quality entries from being logged without confirmation
 */

const compromise = require('compromise');

/**
 * Check if parse result is high quality enough to log without confirmation
 * @param {Object} parseResult - NLU parse result with intent, slots, confidence
 * @returns {Object} - { isValid: boolean, reason: string|null }
 */
function validateQuality(parseResult) {
    const { intent, slots } = parseResult;

    // Only validate food/drink intents
    if (!['food', 'drink'].includes(intent)) {
        return { isValid: true, reason: null };
    }

    const item = slots.item || '';

    // Check 1: Item too short (< 3 characters)
    if (item.length > 0 && item.length < 3) {
        return {
            isValid: false,
            reason: `The item "${item}" seems too short. Can you provide more details?`
        };
    }

    // Check 2: No noun detected in item
    if (item.length > 0 && !hasNoun(item)) {
        return {
            isValid: false,
            reason: `I didn't catch what you ate/drank. Can you be more specific about the item?`
        };
    }

    // Check 3: Empty item for food/drink intent
    if (!item || item.trim().length === 0) {
        return {
            isValid: false,
            reason: `What did you have? Please tell me the food or drink.`
        };
    }

    return { isValid: true, reason: null };
}

/**
 * Check if text contains a noun
 * @param {string} text - Text to check
 * @returns {boolean} - True if contains noun, false otherwise
 */
function hasNoun(text) {
    try {
        const doc = compromise(text);
        const nouns = doc.nouns().out('array');
        return nouns.length > 0;
    } catch (error) {
        console.error('[QUALITY] Error checking for nouns:', error);
        // If compromise fails, assume it's valid (fail open)
        return true;
    }
}

module.exports = {
    validateQuality,
    hasNoun
};
