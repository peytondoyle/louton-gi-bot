/**
 * Portion/serving parser and normalizer - V2
 * Extracts portion sizes from text and converts to grams/ml
 * Enhanced with ontology-v2 for density-based estimation
 */

// Import from ontology-v2 for consistency
const { UNICODE_FRACTIONS, CAFE_SIZES, UNITS, DENSITY_MAP } = require('../nlu/ontology-v2');

// Backward compatibility: merge with existing fractions
const FRACTIONS = {
    ...UNICODE_FRACTIONS,
    '1/4': 0.25,
    '1/2': 0.5,
    '3/4': 0.75,
    '1/3': 0.33,
    '2/3': 0.67,
    '1/8': 0.125,
    '3/8': 0.375,
    '5/8': 0.625,
    '7/8': 0.875
};

// Starbucks/coffee size mappings (in ml)
const COFFEE_SIZES = {
    'short': 236,
    'tall': 355,
    'grande': 473,
    'venti': 591,
    'trenta': 887
};

// Volume conversions to ml
const VOLUME_TO_ML = {
    'ml': 1,
    'milliliter': 1,
    'milliliters': 1,
    'l': 1000,
    'liter': 1000,
    'liters': 1000,
    'oz': 29.5735,
    'fl oz': 29.5735,
    'fluid ounce': 29.5735,
    'fluid ounces': 29.5735,
    'cup': 236.588,
    'cups': 236.588,
    'c': 236.588,
    'tbsp': 14.7868,
    'tablespoon': 14.7868,
    'tablespoons': 14.7868,
    'tsp': 4.92892,
    'teaspoon': 4.92892,
    'teaspoons': 4.92892,
    'pint': 473.176,
    'pints': 473.176,
    'quart': 946.353,
    'quarts': 946.353,
    'gallon': 3785.41,
    'gallons': 3785.41
};

// Approximate weight conversions (item-specific, in grams)
const PORTION_TO_GRAMS = {
    // Bread/grain
    'slice': 28,
    'slices': 28,
    'piece': 30,
    'pieces': 30,
    'bowl': 150,
    'bowls': 150,

    // Servings
    'serving': 100,
    'servings': 100,
    'portion': 100,
    'portions': 100,

    // Handfuls
    'handful': 30,
    'handfuls': 30,
    'scoop': 50,
    'scoops': 50,

    // Eggs
    'egg': 50,
    'eggs': 50
};

/**
 * Parse portion from text and normalize to grams/ml
 * @param {string} text - Input text (e.g., "2 slices", "16oz", "grande")
 * @param {string} itemType - Type of item ('food' or 'drink') for context
 * @returns {Object} - { raw, normalized_g, normalized_ml, multiplier }
 */
function parsePortion(text, itemType = 'food') {
    const result = {
        raw: null,
        normalized_g: null,
        normalized_ml: null,
        multiplier: 1.0
    };

    const t = text.toLowerCase().trim();

    // Pattern 1: Coffee sizes (grande, venti, tall)
    for (const [size, ml] of Object.entries(COFFEE_SIZES)) {
        if (new RegExp(`\\b${size}\\b`, 'i').test(t)) {
            result.raw = size;
            result.normalized_ml = ml;
            result.multiplier = ml / 236; // Normalize to 1 cup = 236ml
            return result;
        }
    }

    // Pattern 2: Number + unit (e.g., "16oz", "2 cups", "½ cup")
    // Support both unicode fractions and ASCII fractions
    const volumePattern = /(\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+)\s*(ml|milliliters?|l|liters?|oz|fl\s*oz|fluid\s*ounces?|cups?|c|tbsp|tablespoons?|tsp|teaspoons?|pints?|quarts?|gallons?)\b/i;
    const weightPattern = /(\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+)\s*(slices?|pieces?|bowls?|servings?|portions?|handfuls?|scoops?|eggs?)\b/i;

    let match = t.match(volumePattern);
    if (match) {
        const quantity = parseFraction(match[1]);
        const unit = match[2].toLowerCase().replace(/\s+/g, ' ');
        const mlPerUnit = findClosestUnit(unit, VOLUME_TO_ML);

        if (mlPerUnit) {
            const totalMl = quantity * mlPerUnit;
            result.raw = `${match[1]} ${match[2]}`;
            result.normalized_ml = Math.round(totalMl);
            result.multiplier = totalMl / 236; // Normalize to 1 cup
            return result;
        }
    }

    match = t.match(weightPattern);
    if (match) {
        const quantity = parseFraction(match[1]);
        const unit = match[2].toLowerCase();
        const gramsPerUnit = PORTION_TO_GRAMS[unit] || PORTION_TO_GRAMS[unit + 's'] || PORTION_TO_GRAMS[unit.replace(/s$/, '')];

        if (gramsPerUnit) {
            const totalGrams = quantity * gramsPerUnit;
            result.raw = `${match[1]} ${match[2]}`;
            result.normalized_g = Math.round(totalGrams);
            result.multiplier = totalGrams / 100; // Normalize to 100g serving
            return result;
        }
    }

    // Pattern 3: Just a number (assume serving)
    const justNumberPattern = /^(\d+(?:\.\d+)?)\s*$/;
    match = t.match(justNumberPattern);
    if (match) {
        const quantity = parseFloat(match[1]);
        result.raw = `${quantity}`;
        result.multiplier = quantity;
        return result;
    }

    return result;
}

/**
 * Parse fraction string to decimal
 * @param {string} fractionStr - Fraction string (e.g., "½", "1/2", "2.5")
 * @returns {number} - Decimal value
 */
function parseFraction(fractionStr) {
    // Check if it's a unicode fraction
    if (FRACTIONS[fractionStr]) {
        return FRACTIONS[fractionStr];
    }

    // Check if it's an ASCII fraction like "1/2"
    if (fractionStr.includes('/')) {
        const parts = fractionStr.split('/');
        if (parts.length === 2) {
            const num = parseFloat(parts[0]);
            const denom = parseFloat(parts[1]);
            if (!isNaN(num) && !isNaN(denom) && denom !== 0) {
                return num / denom;
            }
        }
    }

    // Otherwise parse as decimal
    return parseFloat(fractionStr) || 1.0;
}

/**
 * Find closest matching unit in conversion map (fuzzy match)
 * @param {string} unit - Unit string from text
 * @param {Object} conversionMap - Map of unit -> conversion factor
 * @returns {number|null} - Conversion factor or null
 */
function findClosestUnit(unit, conversionMap) {
    // Exact match first
    if (conversionMap[unit]) {
        return conversionMap[unit];
    }

    // Fuzzy match (remove spaces, try singular/plural)
    const normalized = unit.replace(/\s+/g, '');
    for (const [key, value] of Object.entries(conversionMap)) {
        const normKey = key.replace(/\s+/g, '');
        if (normKey === normalized || normKey === normalized + 's' || normKey + 's' === normalized) {
            return value;
        }
    }

    return null;
}

/**
 * Extract portion info from full message text
 * @param {string} text - Full message text
 * @param {string} itemType - Type of item ('food' or 'drink')
 * @returns {Object|null} - Parsed portion or null if not found
 */
function extractPortion(text, itemType = 'food') {
    const portion = parsePortion(text, itemType);

    if (portion.raw) {
        return portion;
    }

    return null;
}

/**
 * Infer portion in grams/ml by category using density map
 * @param {string} item - Item name (e.g., "cereal", "rice", "yogurt")
 * @param {string} unit - Unit (e.g., "cup", "bowl")
 * @param {number} qty - Quantity
 * @returns {Object|null} - { portion_g, portion_ml, category } or null
 */
function inferByCategory(item, unit, qty = 1) {
    const itemLower = item.toLowerCase();

    // Find matching category in density map
    let density = null;
    let category = null;

    for (const [cat, gramsPerUnit] of Object.entries(DENSITY_MAP)) {
        if (itemLower.includes(cat)) {
            density = gramsPerUnit;
            category = cat;
            break;
        }
    }

    if (!density) return null;

    // Check if unit is volume-based (cup, bowl, etc.)
    const isVolume = ['cup', 'cups', 'bowl', 'bowls', 'c'].includes(unit.toLowerCase());

    if (isVolume) {
        return {
            portion_g: Math.round(density * qty),
            portion_ml: null,
            category,
            source: 'density_map'
        };
    }

    return null;
}

module.exports = {
    parsePortion,
    extractPortion,
    parseFraction,
    inferByCategory,  // NEW in V2
    COFFEE_SIZES,
    VOLUME_TO_ML,
    PORTION_TO_GRAMS,
    FRACTIONS  // Expose enhanced fractions
};
