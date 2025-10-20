/**
 * Canonical Notes Builder
 * Safe fallback for building Notes from parse results
 * Always produces valid notes_v=2.1 format
 */

/**
 * Build Notes string from parse result
 * @param {Object} parse - Parse result with slots
 * @returns {string} - Canonical Notes string
 */
function buildNotesFromParse(parse) {
    const parts = ['notes_v=2.1'];
    const s = parse?.slots || {};

    // Meal
    if (s.meal_time) parts.push(`meal=${String(s.meal_time).trim()}`);

    // Time (approximate vs exact)
    if (s.time_approx) parts.push(`time≈=${String(s.time_approx).trim()}`);
    if (s.time) parts.push(`time=${String(s.time).trim()}`);

    // Bristol & BM
    if (s.bristol != null) parts.push(`bristol=${s.bristol}`);
    if (s.bristol_note) parts.push(`bristol_note=${String(s.bristol_note).trim()}`);

    // Food/drink specifics
    if (s.sides) parts.push(`sides=${String(s.sides).trim()}`);
    if (s.portion) parts.push(`portion=${String(s.portion).trim()}`);
    if (s.portion_g != null) parts.push(`portion_g=${s.portion_g}`);
    if (s.portion_ml != null) parts.push(`portion_ml=${s.portion_ml}`);

    // Brands
    if (s.brand_variant) parts.push(`brand_variant=${String(s.brand_variant).trim()}`);
    if (s.brand) parts.push(`brand=${String(s.brand).trim()}`);
    if (s.variant) parts.push(`variant=${String(s.variant).trim()}`);

    // Flags
    if (s.caffeine) parts.push('caffeine');
    if (s.decaf) parts.push('decaf');
    if (s.dairy) parts.push('dairy');
    if (s.non_dairy) parts.push('non_dairy');

    // Photos
    if (s.photo) parts.push(`photo=${String(s.photo).trim()}`);
    if (s.photo1) parts.push(`photo1=${String(s.photo1).trim()}`);
    if (s.photo2) parts.push(`photo2=${String(s.photo2).trim()}`);

    // Severity & symptoms
    if (s.severity != null) parts.push(`severity=${s.severity}`);
    if (s.severity_note) parts.push(`severity_note=${String(s.severity_note).trim()}`);
    if (s.symptom_type) parts.push(`symptom_type=${String(s.symptom_type).trim()}`);

    // Confidence source
    const source = parse?.decision?.includes('llm') ? 'llm' :
                   parse?.decision?.includes('merged') ? 'merged' : 'rules';
    parts.push(`confidence=${source}`);

    // Meal time note
    if (s.meal_time_note) parts.push(`meal_time_note=${String(s.meal_time_note).trim()}`);

    return parts.join('; ');
}

module.exports = {
    buildNotesFromParse
};
