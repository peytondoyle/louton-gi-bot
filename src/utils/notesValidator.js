/**
 * Notes Validator & Canonical Formatter
 * Ensures all Notes tokens are valid, ordered, and version-tagged
 * Version: 2.1
 */

const {
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
} = require('../nlu/ontologyNotes');

// Metrics
let validationMetrics = {
    validated: 0,
    invalid: 0,
    unknownKeys: {},
    lastReset: Date.now()
};

/**
 * Parse Notes string into tokens
 * @param {string} notesStr - Raw Notes string
 * @returns {Map} - Map of key → value
 */
function parseNotes(notesStr) {
    const tokens = new Map();

    if (!notesStr || typeof notesStr !== 'string') {
        return tokens;
    }

    // Split by semicolon or comma
    const parts = notesStr.split(/[;,]+/);

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Check for key=value
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            tokens.set(key, value);
        } else {
            // Standalone flag
            tokens.set(trimmed, true);
        }
    }

    return tokens;
}

/**
 * Validate and canonicalize Notes tokens
 * @param {string|Object} input - Notes string or tokens object
 * @returns {string} - Canonical Notes string
 */
function validateNotes(input) {
    validationMetrics.validated++;

    let tokens;

    // Parse input
    if (typeof input === 'string') {
        tokens = parseNotes(input);
    } else if (typeof input === 'object') {
        tokens = new Map(Object.entries(input));
    } else {
        return 'notes_v=2.1';
    }

    // Filter and validate
    const validTokens = new Map();

    for (const [key, value] of tokens.entries()) {
        // Skip empty values
        if (value === '' || value === null || value === undefined) {
            continue;
        }

        // Validate value if validator exists
        if (!isValidValue(key, value)) {
            validationMetrics.invalid++;
            console.warn(`[NOTES] Invalid value for ${key}: ${value}`);
            continue;
        }

        // Track unknown keys
        if (!CANONICAL_ORDER.includes(key) && !key.startsWith('photo')) {
            validationMetrics.unknownKeys[key] = (validationMetrics.unknownKeys[key] || 0) + 1;
        }

        validTokens.set(key, value);
    }

    // Ensure notes_v present
    if (!validTokens.has('notes_v')) {
        validTokens.set('notes_v', '2.1');
    }

    // Sort by canonical order
    const sortedEntries = Array.from(validTokens.entries()).sort((a, b) => {
        return getCanonicalPosition(a[0]) - getCanonicalPosition(b[0]);
    });

    // Build canonical string
    const parts = sortedEntries.map(([key, value]) => {
        if (value === true) {
            return key; // Flag only
        }
        return `${key}=${value}`;
    });

    return parts.join('; ');
}

/**
 * Build Notes from slots object (from NLU)
 * @param {Object} slots - Slots from parse result
 * @param {Object} metadata - Additional metadata
 * @returns {string} - Canonical Notes string
 */
function buildNotesFromSlots(slots, metadata = {}) {
    const tokens = {};

    // Version
    tokens.notes_v = '2.1';

    // Meal/time
    if (slots.meal_time) tokens.meal = slots.meal_time;
    if (slots.time) tokens.time = slots.time;
    if (slots.time_approx) tokens['time≈'] = slots.time_approx;

    // Classification (from metadata)
    if (metadata.category) tokens.category = metadata.category;
    if (metadata.prep) tokens.prep = metadata.prep;
    if (metadata.cuisine) tokens.cuisine = metadata.cuisine;
    if (metadata.context) tokens.context = metadata.context;

    // Portions
    if (metadata.size) tokens.size = metadata.size;
    if (slots.portion) tokens.portion = slots.portion;
    if (slots.portion_g) tokens.portion_g = slots.portion_g;
    if (slots.portion_ml) tokens.portion_ml = slots.portion_ml;

    // Brands
    if (metadata.brand) tokens.brand = metadata.brand;
    if (metadata.brand_variant) tokens.brand_variant = metadata.brand_variant;
    if (metadata.variant) tokens.variant = metadata.variant;

    // Flags
    if (slots.dairy) tokens.dairy = 'dairy';
    if (slots.non_dairy) tokens.dairy = 'non_dairy';
    if (slots.caffeine) tokens.caffeine = true;
    if (slots.decaf) tokens.decaf = true;

    // Sides
    if (slots.sides) tokens.sides = slots.sides;
    if (metadata.sweetener) tokens.sweetener = metadata.sweetener;

    // Symptoms
    if (slots.severity) tokens.severity = slots.severity;
    if (slots.bristol) tokens.bristol = slots.bristol;
    if (slots.symptom_type) tokens.symptom_type = slots.symptom_type;

    // Confidence
    if (metadata.confidence) tokens.confidence = metadata.confidence;

    // Notes
    if (slots.severity_note) tokens.severity_note = slots.severity_note;
    if (slots.bristol_note) tokens.bristol_note = slots.bristol_note;
    if (slots.meal_time_note) tokens.meal_time_note = slots.meal_time_note;

    return validateNotes(tokens);
}

/**
 * Get validation metrics
 */
function getValidationMetrics() {
    const unknownKeysArray = Object.entries(validationMetrics.unknownKeys)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => `${key}(${count})`);

    return {
        validated: validationMetrics.validated,
        invalid: validationMetrics.invalid,
        invalidRate: validationMetrics.validated > 0
            ? ((validationMetrics.invalid / validationMetrics.validated) * 100).toFixed(2) + '%'
            : '0%',
        topUnknownKeys: unknownKeysArray.join(', ') || 'None',
        uptime: ((Date.now() - validationMetrics.lastReset) / (1000 * 60 * 60)).toFixed(1) + 'h'
    };
}

/**
 * Reset validation metrics
 */
function resetValidationMetrics() {
    validationMetrics = {
        validated: 0,
        invalid: 0,
        unknownKeys: {},
        lastReset: Date.now()
    };
}

/**
 * Log coverage report (call every 500 validations)
 */
function logCoverageReport() {
    if (validationMetrics.validated % 500 === 0 && validationMetrics.validated > 0) {
        const metrics = getValidationMetrics();
        console.log(`[NOTES] Validated=${metrics.validated}, Invalid=${metrics.invalid}, Version=2.1`);
        console.log(`[NOTES] Top unknown keys: ${metrics.topUnknownKeys}`);

        // Warn if invalid rate > 2%
        const invalidPct = parseFloat(metrics.invalidRate);
        if (invalidPct > 2.0) {
            console.warn(`[NOTES] ⚠️ High invalid rate: ${metrics.invalidRate}`);
        }
    }
}

module.exports = {
    parseNotes,
    validateNotes,
    buildNotesFromSlots,
    getValidationMetrics,
    resetValidationMetrics,
    logCoverageReport
};
