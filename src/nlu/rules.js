// Rules-Based NLU Parser
// Deterministic intent classification and slot extraction using regex, chrono-node, and compromise

const chrono = require('chrono-node');
const compromise = require('compromise');
const {
    SYNONYMS,
    INTENT_KEYWORDS,
    ITEM_BLACKLIST,
    containsSynonym,
    findSynonymGroup,
    extractSeverityFromAdjectives,
    getCurrentWindow,
    getWindowStartTime
} = require('./ontology');

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

    // 3. INTENT CLASSIFICATION (priority order: BM > Reflux > Symptom > Drink > Food)

    // 3a. BM Detection (highest priority)
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

    // 3b. Reflux Detection (very specific keywords)
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

    // 3c. Symptom Detection (other symptoms)
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

    // 4. ITEM EXTRACTION using compromise (for food/drink)
    const item = extractItem(t);
    if (item) {
        result.slots.item = item;
    }

    // 5. DRINK vs FOOD Classification
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

    // 6. FALLBACK - couldn't determine clear intent
    result.intent = "other";
    result.confidence = 0.3;
    result.missing.push("clarification_needed");

    return result;
}

/**
 * Extract food/drink item using compromise NLP
 * @param {string} text - Lowercased text
 * @returns {string|null} - Extracted item or null
 */
function extractItem(text) {
    try {
        const doc = compromise(text);

        // Get all noun phrases
        const nouns = doc.nouns().out('array');

        if (nouns.length === 0) return null;

        // Filter out blacklisted words and find longest valid noun phrase
        const validNouns = nouns
            .filter(noun => {
                const lowerNoun = noun.toLowerCase();
                return !ITEM_BLACKLIST.some(blacklisted => lowerNoun === blacklisted);
            })
            .sort((a, b) => b.length - a.length); // Prefer longer phrases

        if (validNouns.length > 0) {
            return validNouns[0];
        }

        return null;
    } catch (error) {
        console.error('Error extracting item with compromise:', error);
        return null;
    }
}

/**
 * Extract quantity/brand information from text
 * @param {string} text - Original text
 * @returns {Object} - { quantity, brand }
 */
function extractMetadata(text) {
    const metadata = {};

    // Extract quantity patterns (16oz, grande, large, small, etc.)
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
