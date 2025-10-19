// NLU Entry Point: Understand natural language with lexicon override + LLM pinch
// Applies rules-based parsing with user-specific learned phrases
// Falls back to LLM only when rules are uncertain or missing critical slots

const { rulesParse } = require('./rules');
const { llmPinch } = require('./llmPinch');

// Critical slots required for each intent type
const CRITICAL_SLOTS = {
    food: ['item'],
    drink: ['item'],
    symptom: ['symptom_type', 'severity'],
    reflux: ['severity'],
    bm: ['bristol']
};

/**
 * Check if LLM pinch is needed
 * @param {ParseResult} result - Rules-based parse result
 * @returns {boolean} True if LLM should be called
 */
function needsPinch(result) {
    if (!result) return true;

    // Skip LLM if high confidence and no missing slots
    if (result.confidence >= 0.8 && (result.missing || []).length === 0) {
        return false;
    }

    // Check if critical slots are missing
    const criticalSlots = CRITICAL_SLOTS[result.intent] || [];
    const hasMissingCritical = criticalSlots.some(slot =>
        (result.missing || []).includes(slot)
    );

    // Call LLM only if: (low confidence AND missing critical) OR intent unknown
    // Don't waste time on LLM for decent food/drink intents with all slots
    if (result.intent === 'food' || result.intent === 'drink') {
        // For food/drink: only call LLM if missing critical item or very uncertain
        return result.confidence < 0.6 || hasMissingCritical;
    }

    // For other intents: call LLM if confidence < 0.75 OR missing critical slots
    return result.confidence < 0.75 || hasMissingCritical;
}

/**
 * Merge slots from rules and LLM (rules take precedence)
 * @param {Object} rulesSlots - Slots from rules-based parser
 * @param {Object} llmSlots - Slots from LLM fallback
 * @returns {Object} Merged slots
 */
function mergeSlots(rulesSlots, llmSlots) {
    // Rules win on conflicts; LLM fills gaps
    return {
        ...(llmSlots || {}),
        ...(rulesSlots || {})
    };
}

/**
 * Understand user input with context awareness
 * @param {string} text - User message
 * @param {Object} userCtx - User context from contextMemory
 * @param {Object} contextMemory - Context memory module
 * @returns {Promise<ParseResult>}
 */
async function understand(text, userCtx, contextMemory) {
    // 1. Run deterministic rules-based parse
    const rulesResult = rulesParse(text);

    // 2. Apply lexicon override if phrase is known for this user
    if (contextMemory && userCtx && userCtx.userId) {
        const learned = contextMemory.lookupPhrase(userCtx.userId, text.toLowerCase().trim());

        if (learned) {
            // Merge learned slots and boost confidence
            rulesResult.intent = learned.intent || rulesResult.intent;
            rulesResult.confidence = Math.min(1.0, rulesResult.confidence + 0.15); // Confidence boost

            // Merge learned slots with parsed slots (learned takes precedence)
            rulesResult.slots = {
                ...rulesResult.slots,
                ...learned.slots
            };

            // Remove missing slots that were filled by lexicon
            rulesResult.missing = rulesResult.missing.filter(slot => !learned.slots || !learned.slots[slot]);

            console.log(`📚 Lexicon match for user ${userCtx.userId}: boosted confidence to ${rulesResult.confidence}`);
        }
    }

    // 3. Check if LLM pinch is needed
    if (!needsPinch(rulesResult)) {
        console.log(`[NLU] ✅ Rules confident (${(rulesResult.confidence * 100).toFixed(0)}%), skipping LLM`);
        return rulesResult;
    }

    // 4. Call LLM pinch fallback
    console.log(`[NLU] 🤔 Rules uncertain (${(rulesResult.confidence * 100).toFixed(0)}%), trying LLM pinch...`);
    const llmResult = await llmPinch(text);

    // 5. If LLM failed, return rules result
    if (!llmResult) {
        console.log('[NLU] ⚠️  LLM pinch failed, using rules result');
        return rulesResult;
    }

    // 6. Merge results: rules win on conflicts, LLM fills gaps
    const intent = rulesResult.intent === 'other' && llmResult.intent ? llmResult.intent : rulesResult.intent;
    const slots = mergeSlots(rulesResult.slots, llmResult.slots);

    // 7. Recalculate missing slots
    const allMissing = [...new Set([...(rulesResult.missing || []), ...(llmResult.missing || [])])];
    const missing = allMissing
        .filter(Boolean)
        .filter(slotKey => slots[slotKey] == null || slots[slotKey] === undefined);

    // 8. Boost confidence if LLM filled critical slots
    let confidence = rulesResult.confidence;
    const criticalSlots = CRITICAL_SLOTS[intent] || [];
    const filledCriticalSlots = criticalSlots.some(slotKey =>
        (rulesResult.missing || []).includes(slotKey) && slots[slotKey] != null
    );

    if (filledCriticalSlots) {
        confidence = Math.max(confidence, 0.85);
        console.log(`[NLU] ✨ LLM filled critical slots, boosted confidence to ${(confidence * 100).toFixed(0)}%`);
    }

    // 9. Return merged result
    return {
        intent,
        slots,
        missing,
        confidence
    };
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
