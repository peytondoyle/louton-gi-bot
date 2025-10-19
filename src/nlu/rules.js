// Rules-Based NLU Parser
// Deterministic intent classification and slot extraction using regex, chrono-node, and compromise

const chrono = require('chrono-node');
const compromise = require('compromise');
const {
    SYNONYMS,
    INTENT_KEYWORDS,
    ITEM_BLACKLIST,
    HEAD_NOUNS,
    CEREAL_BRANDS,
    containsSynonym,
    findSynonymGroup,
    extractSeverityFromAdjectives,
    getCurrentWindow,
    getWindowStartTime
} = require('./ontology');
const { extractPortion } = require('../nutrition/portionParser');
const { findBrandInfo, checkCaffeine } = require('../nutrition/brandLexicon');

/**
 * @typedef {Object} ParseResult
 * @property {'food'|'drink'|'symptom'|'reflux'|'bm'|'checkin'|'other'} intent
 * @property {number} confidence - 0 to 1
 * @property {Object} slots - Extracted fields
 * @property {string[]} missing - Which slots need clarification
 */

/**
 * Parse natural language text into structured intent and slots
 * @param {string} text - User input
 * @returns {ParseResult}
 */
function rulesParse(text) {
    const t = text.toLowerCase().trim();

    const result = {
        intent: "other",
        confidence: 0.3,
        slots: {},
        missing: []
    };

    // 1. TIME EXTRACTION using chrono-node
    const parsedDates = chrono.parse(t);
    if (parsedDates.length > 0) {
        const date = parsedDates[0].start.date();
        result.slots.time = date.toISOString();
    }

    // 2. MEAL TIME EXTRACTION from keywords
    for (const [mealType, synonyms] of Object.entries(SYNONYMS.mealTime)) {
        if (containsSynonym(t, synonyms)) {
            result.slots.meal_time = mealType;
            break;
        }
    }

    // 3. CONVERSATIONAL INTENTS (should not be logged to Sheets)

    // 3a. Greeting detection
    if (/^(good\s*morning|good\s*evening|good\s*afternoon|hey|hi|hello|yo|sup|what'?s\s*up)/i.test(t)) {
        result.intent = "greeting";
        result.confidence = 0.95;
        return result;
    }

    // 3b. Thanks/appreciation detection
    if (/^(thanks|thank\s*you|ty|thx|appreciate|cheers)/i.test(t)) {
        result.intent = "thanks";
        result.confidence = 0.95;
        return result;
    }

    // 3c. General chit-chat (short casual responses)
    if (/^(lol|haha|ok|okay|cool|nice|awesome|great|perfect|got\s*it|sure|yep|yeah|nope|nah)/i.test(t)) {
        result.intent = "chit_chat";
        result.confidence = 0.9;
        return result;
    }

    // 3d. Farewell detection
    if (/^(bye|goodbye|good\s*bye|see\s*ya|see\s*you|later|night|good\s*night|gn|ttyl|talk\s*later)/i.test(t)) {
        result.intent = "farewell";
        result.confidence = 0.95;
        return result;
    }

    // 4. LOGGABLE INTENTS (priority order: BM > Reflux > Symptom > Drink > Food)

    // 4a. BM Detection (highest priority)
    if (containsSynonym(t, INTENT_KEYWORDS.bm)) {
        result.intent = "bm";
        result.confidence = 0.85;

        // BM quick defaults from descriptors
        const bmType = findSynonymGroup(t, SYNONYMS.bm);
        if (bmType === "loose") {
            result.slots.bristol = "6";
            result.slots.bristol_note = "auto-detected from loose/diarrhea";
        } else if (bmType === "hard") {
            result.slots.bristol = "2";
            result.slots.bristol_note = "auto-detected from hard/constipated";
        } else if (bmType === "normal") {
            result.slots.bristol = "4";
            result.slots.bristol_note = "auto-detected from normal";
        }

        // Still ask for confirmation if we auto-set bristol
        if (!result.slots.bristol) {
            result.missing.push("bristol");
        }

        return result;
    }

    // 4b. Reflux Detection (very specific keywords)
    if (containsSynonym(t, SYNONYMS.symptoms.reflux)) {
        result.intent = "reflux";
        result.confidence = 0.9;

        // Extract severity from adjectives
        const severity = extractSeverityFromAdjectives(t);
        if (severity) {
            result.slots.severity = severity;
            result.slots.severity_note = "auto-detected from adjective";
        } else {
            result.missing.push("severity");
        }

        return result;
    }

    // 4c. Symptom Detection (other symptoms)
    const symptomType = findSynonymGroup(t, SYNONYMS.symptoms);
    if (symptomType && symptomType !== "reflux") {
        result.intent = "symptom";
        result.confidence = 0.8;
        result.slots.symptom_type = symptomType;

        // Extract severity
        const severity = extractSeverityFromAdjectives(t);
        if (severity) {
            result.slots.severity = severity;
            result.slots.severity_note = "auto-detected from adjective";
        } else {
            result.missing.push("severity");
        }

        return result;
    }

    // Check for general feeling keywords that indicate symptoms
    if (containsSynonym(t, SYNONYMS.symptoms.general)) {
        result.intent = "symptom";
        result.confidence = 0.7;
        result.slots.symptom_type = "general";

        const severity = extractSeverityFromAdjectives(t);
        if (severity) {
            result.slots.severity = severity;
            result.slots.severity_note = "auto-detected from adjective";
        } else {
            result.missing.push("severity");
        }

        return result;
    }

    // 5. ITEM EXTRACTION using head-noun + "with" heuristic (for food/drink)
    const extracted = extractItem(t);
    if (extracted.item) {
        result.slots.item = extracted.item;
    }
    if (extracted.sides) {
        result.slots.sides = extracted.sides;
    }

    // 6. DRINK vs FOOD Classification
    // Prefer drink if strong drink indicators present
    const drinkType = findSynonymGroup(t, SYNONYMS.drinks);
    const hasDrinkAction = containsSynonym(t, INTENT_KEYWORDS.drink);
    const hasFoodAction = containsSynonym(t, INTENT_KEYWORDS.food);

    if (drinkType || (hasDrinkAction && !hasFoodAction)) {
        result.intent = "drink";
        result.confidence = 0.75;

        if (!result.slots.item && drinkType) {
            result.slots.item = drinkType;
        }

        // Check for missing slots
        if (!result.slots.item) {
            result.missing.push("item");
        }
        // Meal time or time optional but helpful
        if (!result.slots.meal_time && !result.slots.time) {
            // Infer from current time window
            const currentWindow = getCurrentWindow();
            result.slots.meal_time = currentWindow;
            result.slots.meal_time_note = "inferred from current time";
        }

        return result;
    }

    // Default to food if we have an item or food action words
    if (result.slots.item || hasFoodAction || containsSynonym(t, INTENT_KEYWORDS.food)) {
        result.intent = "food";
        result.confidence = 0.7;

        if (!result.slots.item) {
            result.missing.push("item");
        }

        // Meal time or time optional but helpful
        if (!result.slots.meal_time && !result.slots.time) {
            const currentWindow = getCurrentWindow();
            result.slots.meal_time = currentWindow;
            result.slots.meal_time_note = "inferred from current time";
        }

        return result;
    }

    // 7. FALLBACK - couldn't determine clear intent
    result.intent = "other";
    result.confidence = 0.3;
    result.missing.push("clarification_needed");

    return result;
}

/**
 * Extract food/drink item using head-noun + "with" sides heuristic
 * @param {string} text - Lowercased text
 * @returns {Object} - {item, sides} object
 */
function extractItem(text) {
    try {
        // 0. Strip meal time phrases (for breakfast, at lunch, etc.) before processing
        const MEAL_TIME_SUFFIX_RE = /\s+(for|at|during|after|before)\s+(breakfast|lunch|dinner|snack|brunch)\b.*$/i;
        const cleanedText = text.replace(MEAL_TIME_SUFFIX_RE, '').trim();

        // 1. Split on "with" to separate main item from sides
        const WITH_RE = /\bwith\b/i;
        let mainChunk = null;
        let sideChunk = null;

        if (WITH_RE.test(cleanedText)) {
            const parts = cleanedText.split(WITH_RE);
            mainChunk = (parts[0] || '').trim();
            sideChunk = (parts[1] || '').trim();
        } else {
            mainChunk = cleanedText;
        }

        // 2. Brand-aware cereal capture (Brand + cereal) or ProperNoun + cereal
        function captureCereal(srcFull) {
            if (!srcFull) return null;

            // Try brand regex first (e.g., "Life cereal", "Cheerios")
            const brandRegex = new RegExp(`\\b(${CEREAL_BRANDS.join('|')})\\b(?:\\s+cereal)?`, 'i');
            let m = srcFull.match(brandRegex);
            if (m) {
                // If "cereal" follows brand, include it; otherwise just brand name
                if (srcFull.toLowerCase().includes(m[1].toLowerCase() + ' cereal')) {
                    return `${m[1]} cereal`;
                }
                return m[1]; // Brand implies cereal
            }

            // Proper-noun + cereal (e.g., "Kix cereal", "Life cereal")
            m = srcFull.match(/\b([A-Z][A-Za-z'']+)\s+cereal\b/);
            if (m) return `${m[1]} cereal`;

            // Just "cereal" alone
            if (/\bcereal\b/i.test(srcFull)) return 'cereal';

            return null;
        }

        // 3. Head-noun anchor (e.g., "oatmeal", "salad", "pizza")
        function chooseItemFromHeadNoun(src) {
            if (!src) return null;
            const lower = src.toLowerCase();

            // Find which head noun is present
            const hit = HEAD_NOUNS.find(h => lower.includes(h));
            if (!hit) return null;

            // Capture up to 2 tokens before the head noun + the noun itself
            const tokens = src.split(/\s+/);
            const idx = tokens.findIndex(t => t.toLowerCase().includes(hit));
            if (idx < 0) return hit;

            const start = Math.max(0, idx - 2);
            return tokens.slice(start, idx + 1).join(' ').trim();
        }

        let chosen = null;

        // 4. Priority 1: If "cereal" appears, try brand capture first
        const cerealItem = captureCereal(mainChunk || cleanedText);
        if (cerealItem) chosen = cerealItem;

        // 5. Priority 2: Use head-noun picker on mainChunk, then cleaned text
        if (!chosen) chosen = chooseItemFromHeadNoun(mainChunk);
        if (!chosen) chosen = chooseItemFromHeadNoun(cleanedText);

        // 6. Fallback: Use compromise noun-phrase extractor
        if (!chosen) {
            const doc = compromise(mainChunk || cleanedText);
            const nouns = doc.nouns().out('array');

            if (nouns.length > 0) {
                const validNouns = nouns
                    .filter(noun => {
                        const lowerNoun = noun.toLowerCase();
                        return !ITEM_BLACKLIST.some(blacklisted => lowerNoun === blacklisted);
                    })
                    .sort((a, b) => b.length - a.length); // Prefer longer phrases

                if (validNouns.length > 0) {
                    chosen = validNouns[0];
                }
            }
        }

        // 7. Return item + sides
        // If we have both item and sides, include the full phrase for readability
        if (chosen && sideChunk) {
            return {
                item: `${chosen} with ${sideChunk}`,
                sides: sideChunk
            };
        }

        return {
            item: chosen,
            sides: sideChunk
        };

    } catch (error) {
        console.error('Error extracting item:', error);
        return { item: null, sides: null };
    }
}

/**
 * Extract quantity/brand/portion information from text
 * @param {string} text - Original text
 * @param {string} itemType - Type of item ('food' or 'drink')
 * @returns {Object} - { quantity, brand, portion, brandInfo, caffeine }
 */
function extractMetadata(text, itemType = 'food') {
    const metadata = {};

    // Extract portion using new parser
    const portion = extractPortion(text, itemType);
    if (portion) {
        metadata.portion = portion;
    }

    // Brand-specific detection (oat milk, chai, coffee, cereal variants)
    const brandInfo = findBrandInfo(text);
    if (brandInfo) {
        metadata.brandInfo = brandInfo;
    }

    // Caffeine detection
    if (itemType === 'drink') {
        const caffeine = checkCaffeine(text);
        if (caffeine.hasCaffeine || caffeine.isDecaf) {
            metadata.caffeine = caffeine;
        }
    }

    // Legacy quantity extraction (kept for backward compatibility)
    // Will be superseded by portion parser
    if (!metadata.portion) {
        const quantityPatterns = [
            /(\d+\s?oz)/i,
            /(\d+\s?ml)/i,
            /(grande|venti|tall|large|medium|small)/i,
            /(\d+\s?cups?)/i,
            /(\d+\s?servings?)/i
        ];

        for (const pattern of quantityPatterns) {
            const match = text.match(pattern);
            if (match) {
                metadata.quantity = match[1];
                break;
            }
        }
    }

    // Extract brand names (capitalized words that aren't at start)
    const brandPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const brands = [];
    let match;
    while ((match = brandPattern.exec(text)) !== null) {
        // Exclude if it's the first word (likely start of sentence)
        if (match.index > 0) {
            brands.push(match[1]);
        }
    }

    if (brands.length > 0) {
        metadata.brand = brands.join(', ');
    }

    return metadata;
}

module.exports = {
    rulesParse,
    extractItem,
    extractMetadata
};
