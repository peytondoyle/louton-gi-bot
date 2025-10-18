// LLM Pinch - Tiny, Fast, JSON-Only Fallback for Ambiguous Messages
// Only called when rules-based NLU has low confidence or missing critical slots
// Hard timeout: 800ms, Temperature: 0, Max tokens: 64

const { OpenAI } = require('openai');
const { llmCache } = require('./cache');

// Initialize OpenAI client (lazy - only if API key exists)
let client = null;
function getClient() {
    if (!client && process.env.OPENAI_API_KEY) {
        client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 800 // Hard 800ms timeout
        });
    }
    return client;
}

// System prompt - strict JSON extractor, no prose
const SYSTEM_PROMPT = `You are a strict information extractor for GI tracking. Return ONLY strict JSON with this exact schema:
{"intent":"food|drink|symptom|reflux|bm|checkin|other","slots":{},"confidence":0.0,"missing":[]}

Rules:
- Choose ONE intent only (food, drink, symptom, reflux, bm, checkin, or other)
- For food/drink: slots {item, meal_time?, quantity?, brand?, time?}
- For symptom: slots {symptom_type ∈ "reflux"|"pain"|"bloat"|"nausea"|"general", severity 1..10?, time?}
- For reflux: slots {severity 1..10?, time?}
- For bm: slots {bristol 1..7?, time?}
- Return confidence 0.0-1.0
- List missing critical slots in "missing" array
- NO prose, NO explanations, NO markdown
- Temperature 0 for consistency`;

/**
 * Normalize text for cache key
 * @param {string} text - Raw user message
 * @returns {string} Normalized cache key
 */
function normalizeForCache(text) {
    return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * LLM Pinch - Fast fallback when rules are uncertain
 * @param {string} text - User message
 * @returns {Promise<Object|null>} Parsed result or null on failure
 */
async function llmPinch(text) {
    // Check if OpenAI is configured
    const openai = getClient();
    if (!openai) {
        console.log('[LLM-PINCH] ⚠️  OPENAI_API_KEY not set, skipping LLM fallback');
        return null;
    }

    // Check cache first
    const cacheKey = normalizeForCache(text);
    const cached = llmCache.get(cacheKey);
    if (cached) {
        console.log('[LLM-PINCH] ⚡ Cache hit');
        return cached;
    }

    // Create abort controller for hard timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.log('[LLM-PINCH] ⏱️  Timeout (800ms exceeded)');
        controller.abort();
    }, 800);

    try {
        console.log('[LLM-PINCH] 🤖 Calling gpt-4o-mini...');
        const startTime = Date.now();

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',           // Fast & cheap
            temperature: 0,                  // Deterministic
            max_tokens: 64,                  // Tiny response
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: text }
            ],
            response_format: { type: 'json_object' },  // Force JSON
            signal: controller.signal
        });

        const elapsed = Date.now() - startTime;
        clearTimeout(timeoutId);

        // Parse JSON response
        const content = response.choices[0]?.message?.content;
        if (!content) {
            console.log('[LLM-PINCH] ❌ Empty response');
            return null;
        }

        const parsed = JSON.parse(content);

        // Validate response structure
        if (!parsed || typeof parsed !== 'object' || !parsed.intent) {
            console.log('[LLM-PINCH] ❌ Invalid JSON structure');
            return null;
        }

        console.log(`[LLM-PINCH] ✅ Success (${elapsed}ms) - intent: ${parsed.intent}, confidence: ${parsed.confidence}`);

        // Cache the result
        llmCache.set(cacheKey, parsed);

        return parsed;

    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            console.log('[LLM-PINCH] ⏱️  Request aborted (timeout)');
        } else {
            console.log(`[LLM-PINCH] ❌ Error: ${error.message}`);
        }

        return null; // Fail soft - continue with rules-only result
    }
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
    return {
        size: llmCache.size,
        max: llmCache.max,
        hitRate: llmCache.size > 0 ? 'warming up' : 'empty'
    };
}

module.exports = {
    llmPinch,
    getCacheStats
};
