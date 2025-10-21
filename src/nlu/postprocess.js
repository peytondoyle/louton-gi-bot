/**
 * NLU V2 Postprocessing
 * Normalizes tokens, strips trailing meal phrases, ensures canonical ordering
 */

/**
 * Postprocess NLU parse result
 * @param {Object} result - Parse result from rules or LLM
 * @returns {Object} - Normalized parse result
 */
function postprocess(result) {
    if (!result || !result.slots) {
        return result;
    }

    const normalized = { ...result };
    
    // Normalize item tokens
    if (normalized.slots.item) {
        normalized.slots.item = normalizeItemToken(normalized.slots.item);
    }
    
    // Normalize sides tokens
    if (normalized.slots.sides) {
        normalized.slots.sides = normalizeSides(normalized.slots.sides);
    }
    
    // Normalize symptom tokens
    if (normalized.slots.symptom_type) {
        normalized.slots.symptom_type = normalizeSymptomToken(normalized.slots.symptom_type);
    }
    
    // Clean up meal time references
    if (normalized.slots.meal_time) {
        normalized.slots.meal_time = normalizeMealTime(normalized.slots.meal_time);
    }
    
    // Ensure canonical ordering of slots
    normalized.slots = reorderSlots(normalized.slots);
    
    // Remove empty or null slots
    normalized.slots = cleanEmptySlots(normalized.slots);
    
    return normalized;
}

/**
 * Normalize item token by removing trailing meal phrases
 * @param {string} item - Raw item token
 * @returns {string} - Normalized item
 */
function normalizeItemToken(item) {
    if (!item || typeof item !== 'string') return item;
    
    let normalized = item.trim();
    
    // Remove trailing meal phrases
    const mealPhrases = [
        /\s+for\s+(breakfast|lunch|dinner|snack|meal)$/i,
        /\s+(breakfast|lunch|dinner|snack|meal)$/i,
        /\s+this\s+(morning|afternoon|evening|night)$/i,
        /\s+(morning|afternoon|evening|night)$/i
    ];
    
    for (const pattern of mealPhrases) {
        normalized = normalized.replace(pattern, '').trim();
    }
    
    // Remove trailing punctuation
    normalized = normalized.replace(/[.,!?;:]+$/, '').trim();
    
    // Handle common contractions
    normalized = normalized.replace(/\bI\s+had\s+/i, '');
    normalized = normalized.replace(/\bI\s+ate\s+/i, '');
    normalized = normalized.replace(/\bI\s+drank\s+/i, '');
    
    return normalized || item;
}

/**
 * Normalize sides token
 * @param {string} sides - Raw sides token
 * @returns {string} - Normalized sides
 */
function normalizeSidesToken(sides) {
    if (!sides || typeof sides !== 'string') return sides;
    
    let normalized = sides.trim();
    
    // Remove leading connectors
    normalized = normalized.replace(/^(with|and|&|plus)\s+/i, '');
    
    // Remove trailing meal phrases
    const mealPhrases = [
        /\s+for\s+(breakfast|lunch|dinner|snack|meal)$/i,
        /\s+(breakfast|lunch|dinner|snack|meal)$/i
    ];
    
    for (const pattern of mealPhrases) {
        normalized = normalized.replace(pattern, '').trim();
    }
    
    return normalized || sides;
}

/**
 * Canonicalize and deduplicate sides
 * @param {string} csv - Comma-separated sides string
 * @returns {string} - Canonicalized and deduplicated sides
 */
function normalizeSides(csv) {
    if (!csv || typeof csv !== 'string') return csv;
    
    const ALIASES = { 
        'blueberries': 'blueberry', 
        'blueberrie': 'blueberry', 
        'strawberries': 'strawberry' 
    };
    
    function canon(s) {
        const t = s.toLowerCase().trim();
        return ALIASES[t] || t;
    }
    
    const uniq = new Set();
    for (const raw of csv.split(',')) {
        const c = canon(raw);
        if (!c) continue;
        // drop trivial fragments if a longer phrase already exists (milk vs almond milk)
        const exists = [...uniq].some(u => u.includes(c) || c.includes(u));
        if (!exists) uniq.add(c);
    }
    return [...uniq].join(', ');
}

/**
 * Normalize symptom token
 * @param {string} symptom - Raw symptom token
 * @returns {string} - Normalized symptom
 */
function normalizeSymptomToken(symptom) {
    if (!symptom || typeof symptom !== 'string') return symptom;
    
    let normalized = symptom.trim().toLowerCase();
    
    // Standardize common symptom terms
    const symptomMap = {
        'stomach ache': 'stomach pain',
        'stomach pain': 'stomach pain',
        'belly ache': 'stomach pain',
        'tummy ache': 'stomach pain',
        'heart burn': 'heartburn',
        'heartburn': 'heartburn',
        'acid reflux': 'reflux',
        'reflux': 'reflux',
        'bloating': 'bloating',
        'bloated': 'bloating',
        'gas': 'gas',
        'gassy': 'gas',
        'nausea': 'nausea',
        'nauseous': 'nausea',
        'cramps': 'cramps',
        'cramping': 'cramps'
    };
    
    return symptomMap[normalized] || symptom;
}

/**
 * Normalize meal time token
 * @param {string} mealTime - Raw meal time token
 * @returns {string} - Normalized meal time
 */
function normalizeMealTime(mealTime) {
    if (!mealTime || typeof mealTime !== 'string') return mealTime;
    
    let normalized = mealTime.trim().toLowerCase();
    
    // Standardize meal time references
    const mealTimeMap = {
        'morning': 'breakfast',
        'breakfast': 'breakfast',
        'brunch': 'breakfast',
        'lunch': 'lunch',
        'afternoon': 'lunch',
        'dinner': 'dinner',
        'evening': 'dinner',
        'night': 'dinner',
        'late night': 'dinner',
        'snack': 'snack',
        'snacks': 'snack'
    };
    
    return mealTimeMap[normalized] || mealTime;
}

/**
 * Reorder slots in canonical order
 * @param {Object} slots - Raw slots object
 * @returns {Object} - Reordered slots
 */
function reorderSlots(slots) {
    const canonicalOrder = [
        'item',
        'sides', 
        'symptom_type',
        'severity',
        'meal_time',
        'time',
        'date',
        'quantity',
        'unit',
        'prep_method',
        'dairy_type',
        'caffeine_type',
        'category',
        'brand',
        'variant',
        'notes'
    ];
    
    const reordered = {};
    
    // Add slots in canonical order
    for (const key of canonicalOrder) {
        if (slots[key] !== undefined && slots[key] !== null && slots[key] !== '') {
            reordered[key] = slots[key];
        }
    }
    
    // Add any remaining slots not in canonical order
    for (const [key, value] of Object.entries(slots)) {
        if (!canonicalOrder.includes(key) && value !== undefined && value !== null && value !== '') {
            reordered[key] = value;
        }
    }
    
    return reordered;
}

/**
 * Remove empty or null slots
 * @param {Object} slots - Raw slots object
 * @returns {Object} - Cleaned slots
 */
function cleanEmptySlots(slots) {
    const cleaned = {};
    
    for (const [key, value] of Object.entries(slots)) {
        if (value !== undefined && value !== null && value !== '' && value !== 'null' && value !== 'undefined') {
            cleaned[key] = value;
        }
    }
    
    return cleaned;
}

/**
 * Extract secondary intents from complex messages
 * @param {Object} result - Parse result
 * @returns {Object} - Result with secondary intents
 */
function extractSecondaryIntents(result) {
    if (!result || !result.slots) {
        return result;
    }
    
    const secondary = [];
    
    // Check for secondary beverages in sides
    if (result.slots.sides) {
        const beverageKeywords = ['tea', 'coffee', 'water', 'juice', 'soda', 'milk', 'smoothie', 'chai'];
        const sides = result.slots.sides.toLowerCase();
        
        for (const keyword of beverageKeywords) {
            if (sides.includes(keyword)) {
                secondary.push({
                    intent: 'drink',
                    item: keyword,
                    confidence: 0.8
                });
            }
        }
    }
    
    // Check for secondary symptoms
    if (result.slots.symptom_type) {
        const symptomKeywords = ['pain', 'ache', 'burning', 'cramping', 'nausea'];
        const symptom = result.slots.symptom_type.toLowerCase();
        
        for (const keyword of symptomKeywords) {
            if (symptom.includes(keyword) && !symptom.includes('no') && !symptom.includes('not')) {
                secondary.push({
                    intent: 'symptom',
                    symptom_type: keyword,
                    confidence: 0.7
                });
            }
        }
    }
    
    if (secondary.length > 0) {
        result.secondary = secondary;
    }
    
    return result;
}

module.exports = {
    postprocess,
    normalizeItemToken,
    normalizeSidesToken,
    normalizeSides,
    normalizeSymptomToken,
    normalizeMealTime,
    reorderSlots,
    cleanEmptySlots,
    extractSecondaryIntents
};