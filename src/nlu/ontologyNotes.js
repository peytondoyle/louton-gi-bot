/**
 * Notes System Ontology - Controlled Vocabularies
 * Defines valid tokens for structured metadata in Notes column
 * Version: 2.1
 */

// ========== CONTROLLED VOCABULARIES ==========

/**
 * Meal periods (when food/drink was consumed)
 */
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'late'];

/**
 * Food/drink categories (primary classification)
 */
const CATEGORIES = [
    'grain',      // oats, rice, cereal, toast, pasta
    'protein',    // eggs, chicken, fish, tofu
    'dairy',      // milk, yogurt, cheese
    'non_dairy',  // oat milk, almond milk
    'veg',        // vegetables, salad
    'fruit',      // banana, apple, berries
    'caffeine',   // coffee, tea, energy drinks
    'sweet',      // desserts, candy, chocolate
    'fat'         // butter, oil, nuts
];

/**
 * Preparation methods
 */
const PREP_METHODS = [
    'raw',
    'baked',
    'fried',
    'boiled',
    'steamed',
    'roasted',
    'grilled',
    'sauteed',
    'iced',
    'hot'
];

/**
 * Cuisine types
 */
const CUISINES = [
    'american',
    'mexican',
    'italian',
    'indian',
    'japanese',
    'thai',
    'chinese',
    'mediterranean',
    'other'
];

/**
 * Consumption context
 */
const CONTEXTS = [
    'default',
    'on_the_go',
    'social',
    'post_workout',
    'late',
    'travel'
];

/**
 * Confidence sources
 */
const CONFIDENCE_SOURCES = [
    'rules',      // Rules-based NLU
    'llm',        // LLM pinch
    'merged',     // Rules + LLM merged
    'manual'      // User override/correction
];

/**
 * Time approximations
 */
const TIME_APPROX = [
    'morning',
    'midday',
    'afternoon',
    'evening',
    'night',
    'late'
];

// ========== CANONICAL KEY ORDERING ==========
// Defines the order in which tokens appear in Notes string
const CANONICAL_ORDER = [
    // Version (always first)
    'notes_v',

    // Time & Meal
    'meal',
    'time',
    'time≈',

    // Classification
    'category',
    'prep',
    'cuisine',
    'context',

    // Portions
    'size',
    'portion',
    'portion_g',
    'portion_ml',

    // Brands
    'brand',
    'brand_variant',
    'variant',

    // Flags
    'dairy',
    'non_dairy',
    'caffeine',
    'decaf',

    // Sides & additions
    'sides',
    'sweetener',

    // Symptoms (if applicable)
    'severity',
    'bristol',
    'symptom_type',

    // Metadata
    'confidence',
    'suspected_trigger',

    // Notes (freeform)
    'severity_note',
    'bristol_note',
    'meal_time_note',

    // System flags (last)
    'deleted',
    'photo',
    'photo1',
    'photo2',
    'photo3'
];

// ========== VALIDATION HELPERS ==========

/**
 * Check if value is valid for a given key
 * @param {string} key - Token key
 * @param {*} value - Token value
 * @returns {boolean} - True if valid
 */
function isValidValue(key, value) {
    const validators = {
        meal: (v) => MEALS.includes(v),
        category: (v) => CATEGORIES.includes(v),
        prep: (v) => PREP_METHODS.includes(v),
        cuisine: (v) => CUISINES.includes(v),
        context: (v) => CONTEXTS.includes(v),
        confidence: (v) => CONFIDENCE_SOURCES.includes(v),
        'time≈': (v) => TIME_APPROX.includes(v),
        time: (v) => /^\d{2}:\d{2}(:\d{2})?$/.test(v),
        severity: (v) => {
            const num = parseInt(v, 10);
            return !isNaN(num) && num >= 1 && num <= 10;
        },
        bristol: (v) => {
            const num = parseInt(v, 10);
            return !isNaN(num) && num >= 1 && num <= 7;
        }
    };

    const validator = validators[key];
    if (!validator) return true; // Unknown keys are allowed (for extensibility)

    return validator(value);
}

/**
 * Get canonical position for a key
 * @param {string} key - Token key
 * @returns {number} - Position index
 */
function getCanonicalPosition(key) {
    const idx = CANONICAL_ORDER.indexOf(key);
    return idx >= 0 ? idx : 999; // Unknown keys go to end
}

module.exports = {
    MEALS,
    CATEGORIES,
    PREP_METHODS,
    CUISINES,
    CONTEXTS,
    CONFIDENCE_SOURCES,
    TIME_APPROX,
    CANONICAL_ORDER,
    isValidValue,
    getCanonicalPosition
};
