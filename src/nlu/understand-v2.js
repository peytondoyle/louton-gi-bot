/**
 * NLU Understanding Layer V2
 * Decision logic with strict/lenient gating, LLM pinch, and secondary intent support
 *
 * Confidence Tiers:
 * - Strict (≥0.80): Accept immediately
 * - Lenient (≥0.72): Accept if has head noun + time/meal
 * - Rescue (≥0.65): Try rescue strategies
 * - Reject (<0.65): Request clarification
 */

const { rulesParse } = require('./rules-v2');
const { CONFIDENCE_THRESHOLDS, isMinimalCoreFood } = require('./ontology-v2');

// Metrics tracking
let metrics = {
    total: 0,
    strict: 0,
    lenient: 0,
    rescued: { swap: 0, beverage: 0, llm: 0 },
    clarified: 0,
    rejected: 0
};

/**
 * Understand user input with V2 enhancements
 * @param {string} text - User input
 * @param {Object} options - { userId, tz }
 * @param {Object} contextMemory - Context memory service (optional)
 * @returns {Promise<Object>} - Parse result
 */
async function understand(text, options = {}, contextMemory = null) {
    metrics.total++;

    const tz = options.tz || 'America/Los_Angeles';

    // Run rules-based parser
    const rulesResult = rulesParse(text, { tz });

    console.log(`[NLU-V2] Rules parse: intent=${rulesResult.intent}, conf=${rulesResult.confidence.toFixed(2)}, hasHeadNoun=${rulesResult.meta.hasHeadNoun}`);

    // Critical slots per intent
    const CRITICAL_SLOTS = {
        food: ['item'],
        drink: ['item'],
        symptom: ['severity'],
        reflux: ['severity'],
        bm: ['bristol']
    };

    const criticalMissing = CRITICAL_SLOTS[rulesResult.intent] || [];
    const hasCriticalMissing = criticalMissing.some(slot => rulesResult.missing.includes(slot));

    // ========== DECISION TREE ==========

    // 1. Strict Accept (≥0.80 confidence, no missing critical)
    if (rulesResult.confidence >= CONFIDENCE_THRESHOLDS.strict && !hasCriticalMissing) {
        metrics.strict++;
        console.log(`[NLU-V2] Strict accept (conf=${rulesResult.confidence.toFixed(2)})`);
        return formatResult(rulesResult, 'strict');
    }

    // 2. Lenient Accept (≥0.72 with head noun + time/meal)
    const hasTimeContext = rulesResult.slots.meal_time || rulesResult.slots.time;
    if (rulesResult.confidence >= CONFIDENCE_THRESHOLDS.lenient &&
        rulesResult.meta.hasHeadNoun &&
        hasTimeContext &&
        !hasCriticalMissing) {
        metrics.lenient++;
        console.log(`[NLU-V2] Lenient accept (conf=${rulesResult.confidence.toFixed(2)}, hasHeadNoun=true, hasTime=true)`);
        return formatResult(rulesResult, 'lenient');
    }

    // 3. Minimal Core Food Whitelist
    if (rulesResult.meta.minimalCoreFood && hasTimeContext) {
        metrics.lenient++;
        console.log(`[NLU-V2] Minimal core food accept: ${rulesResult.slots.item}`);
        return formatResult(rulesResult, 'minimal_core');
    }

    // 4. Rescued by Swap/Promote
    if (rulesResult.meta.rescuedBy) {
        const rescueType = rulesResult.meta.rescuedBy;
        if (rescueType === 'swap_sides') metrics.rescued.swap++;
        if (rescueType === 'promote_beverage') metrics.rescued.beverage++;

        console.log(`[NLU-V2] Rescued by ${rescueType}`);
        return formatResult(rulesResult, `rescued_${rescueType}`);
    }

    // 5. Try LLM Pinch (if confidence ≥0.65 and not conversational)
    if (rulesResult.confidence >= CONFIDENCE_THRESHOLDS.rescue &&
        rulesResult.intent !== 'other' &&
        hasCriticalMissing) {
        console.log(`[NLU-V2] Attempting LLM pinch for missing slots...`);

        try {
            const { llmPinch } = require('./llmPinch');
            const llmResult = await llmPinch(text, {
                timeout: 800,
                cache: true
            });

            if (llmResult && llmResult.intent) {
                // Merge LLM results (rules override)
                const merged = mergeLLMResults(rulesResult, llmResult);
                metrics.rescued.llm++;
                console.log(`[NLU-V2] LLM pinch succeeded, filled ${Object.keys(llmResult).length} slots`);
                return formatResult(merged, 'rescued_llm');
            }
        } catch (error) {
            console.log(`[NLU-V2] LLM pinch failed:`, error.message);
        }
    }

    // 6. Request Clarification (missing critical slots)
    if (hasCriticalMissing) {
        metrics.clarified++;
        console.log(`[NLU-V2] Requesting clarification for: ${rulesResult.missing.join(', ')}`);
        return formatResult(rulesResult, 'needs_clarification');
    }

    // 7. Low Confidence Reject
    if (rulesResult.confidence < CONFIDENCE_THRESHOLDS.reject) {
        metrics.rejected++;
        console.log(`[NLU-V2] Rejected (conf=${rulesResult.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLDS.reject})`);
        return formatResult(rulesResult, 'rejected');
    }

    // Default: return as-is
    return formatResult(rulesResult, 'default');
}

/**
 * Format result with decision metadata
 */
function formatResult(rulesResult, decision) {
    return {
        ...rulesResult,
        decision,
        timestamp: new Date().toISOString()
    };
}

/**
 * Merge LLM results with rules results (rules win on conflicts)
 */
function mergeLLMResults(rulesResult, llmResult) {
    const merged = { ...rulesResult };

    // Merge slots (rules override)
    merged.slots = {
        ...llmResult.slots,
        ...rulesResult.slots // Rules win
    };

    // Update missing array
    const CRITICAL_SLOTS = {
        food: ['item'],
        drink: ['item'],
        symptom: ['severity'],
        reflux: ['severity'],
        bm: ['bristol']
    };

    const criticalForIntent = CRITICAL_SLOTS[merged.intent] || [];
    merged.missing = criticalForIntent.filter(slot => !merged.slots[slot]);

    // Use higher confidence
    if (llmResult.confidence > rulesResult.confidence) {
        merged.confidence = Math.min(llmResult.confidence, 0.85); // Cap LLM confidence
    }

    return merged;
}

/**
 * Get coverage metrics
 */
function getMetrics() {
    return {
        ...metrics,
        strictPct: metrics.total > 0 ? ((metrics.strict / metrics.total) * 100).toFixed(1) : 0,
        lenientPct: metrics.total > 0 ? ((metrics.lenient / metrics.total) * 100).toFixed(1) : 0,
        rescuedPct: metrics.total > 0 ? (((metrics.rescued.swap + metrics.rescued.beverage + metrics.rescued.llm) / metrics.total) * 100).toFixed(1) : 0,
        clarifiedPct: metrics.total > 0 ? ((metrics.clarified / metrics.total) * 100).toFixed(1) : 0,
        rejectedPct: metrics.total > 0 ? ((metrics.rejected / metrics.total) * 100).toFixed(1) : 0
    };
}

/**
 * Reset metrics
 */
function resetMetrics() {
    metrics = {
        total: 0,
        strict: 0,
        lenient: 0,
        rescued: { swap: 0, beverage: 0, llm: 0 },
        clarified: 0,
        rejected: 0
    };
}

module.exports = {
    understand,
    getMetrics,
    resetMetrics
};
