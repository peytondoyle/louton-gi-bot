// NLU Entry Point: Understand natural language with lexicon override
// Applies rules-based parsing with user-specific learned phrases

const { rulesParse } = require('./rules');

/**
 * Understand user input with context awareness
 * @param {string} text - User message
 * @param {Object} userCtx - User context from contextMemory
 * @param {Object} contextMemory - Context memory module
 * @returns {Promise<ParseResult>}
 */
async function understand(text, userCtx, contextMemory) {
    // 1. Run deterministic rules-based parse
    const result = rulesParse(text);

    // 2. Apply lexicon override if phrase is known for this user
    if (contextMemory && userCtx && userCtx.userId) {
        const learned = contextMemory.lookupPhrase(userCtx.userId, text.toLowerCase().trim());

        if (learned) {
            // Merge learned slots and boost confidence
            result.intent = learned.intent || result.intent;
            result.confidence = Math.min(1.0, result.confidence + 0.15); // Confidence boost

            // Merge learned slots with parsed slots (learned takes precedence)
            result.slots = {
                ...result.slots,
                ...learned.slots
            };

            // Remove missing slots that were filled by lexicon
            result.missing = result.missing.filter(slot => !learned.slots || !learned.slots[slot]);

            console.log(`📚 Lexicon match for user ${userCtx.userId}: boosted confidence to ${result.confidence}`);
        }
    }

    // 3. Return final result
    return result;
}

/**
 * Format parse result for logging
 * @param {ParseResult} result
 * @returns {string}
 */
function formatParseResult(result) {
    return `Intent: ${result.intent} (${Math.round(result.confidence * 100)}%), ` +
           `Slots: ${JSON.stringify(result.slots)}, ` +
           `Missing: [${result.missing.join(', ')}]`;
}

module.exports = {
    understand,
    formatParseResult
};
