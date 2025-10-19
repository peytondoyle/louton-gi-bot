/**
 * NLU Postprocessing
 * Normalizes tokens, strips trailing phrases, builds canonical Notes format
 */

/**
 * Postprocess parse result
 * @param {Object} parseResult - Raw parse result from rules
 * @returns {Object} - Processed result with normalized tokens
 */
function postprocess(parseResult) {
    const { slots } = parseResult;

    // Strip trailing meal phrases from sides
    if (slots.sides) {
        slots.sides = stripMealPhrases(slots.sides);
    }

    // Normalize lists ("a, b & c")
    if (slots.sides) {
        slots.sides = normalizeLists(slots.sides);
    }

    // Clamp numeric ranges
    if (slots.severity) {
        slots.severity = Math.max(1, Math.min(10, parseInt(slots.severity, 10)));
    }
    if (slots.bristol) {
        slots.bristol = Math.max(1, Math.min(7, parseInt(slots.bristol, 10)));
    }

    // Build Notes tokens array
    const notesTokens = buildNotesTokens(slots);
    slots._notesTokens = notesTokens;

    return parseResult;
}

/**
 * Strip meal time phrases from text
 */
function stripMealPhrases(text) {
    return text
        .replace(/\s+(for|at|during)\s+(breakfast|lunch|dinner|snack)\b/gi, '')
        .trim();
}

/**
 * Normalize lists (comma/and cleanup)
 */
function normalizeLists(text) {
    return text
        .replace(/\s*,\s*/g, ', ')           // Normalize commas
        .replace(/\s+and\s+/g, ' & ')        // "and" → "&"
        .replace(/,\s*&/g, ' &')             // ", &" → " &"
        .trim();
}

/**
 * Build canonical Notes tokens from slots
 */
function buildNotesTokens(slots) {
    const tokens = [];

    // Meal/time
    if (slots.meal_time) tokens.push(`meal=${slots.meal_time}`);
    if (slots.time) tokens.push(`time=${slots.time}`);
    if (slots.time_approx) tokens.push(`time≈${slots.time_approx}`);

    // Portions
    if (slots.portion) tokens.push(`portion=${slots.portion}`);
    if (slots.portion_g) tokens.push(`portion_g=${slots.portion_g}`);
    if (slots.portion_ml) tokens.push(`portion_ml=${slots.portion_ml}`);

    // Brands
    if (slots.brand_variant) tokens.push(`brand_variant=${slots.brand_variant}`);
    if (slots.brand) tokens.push(`brand=${slots.brand}`);

    // Sides
    if (slots.sides) tokens.push(`sides=${slots.sides}`);

    // Flags
    if (slots.caffeine) tokens.push('caffeine');
    if (slots.decaf) tokens.push('decaf');
    if (slots.dairy) tokens.push('dairy');
    if (slots.non_dairy) tokens.push('non_dairy');

    // Severity/Bristol
    if (slots.severity) tokens.push(`severity=${slots.severity}`);
    if (slots.bristol) tokens.push(`bristol=${slots.bristol}`);

    // Notes
    if (slots.severity_note) tokens.push(slots.severity_note);
    if (slots.bristol_note) tokens.push(slots.bristol_note);
    if (slots.meal_time_note) tokens.push(slots.meal_time_note);

    return tokens;
}

module.exports = {
    postprocess,
    buildNotesTokens
};
