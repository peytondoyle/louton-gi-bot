/**
 * Lightweight Spell Correction & Fuzzy Matching
 * Uses Jaro-Winkler distance for near-miss corrections
 */

/**
 * Calculate Jaro-Winkler distance between two strings
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} - Similarity score 0-1 (1 = exact match)
 */
function jaroWinkler(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    const len1 = s1.length;
    const len2 = s2.length;

    // Maximum allowed distance for matches
    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    if (matchWindow < 0) return 0.0;

    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < len1; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, len2);

        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1[i] !== s2[j]) continue;
            s1Matches[i] = true;
            s2Matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0.0;

    // Find transpositions
    let k = 0;
    for (let i = 0; i < len1; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
    }

    // Calculate Jaro similarity
    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

    // Jaro-Winkler: boost score if common prefix
    let prefixLen = 0;
    for (let i = 0; i < Math.min(4, len1, len2); i++) {
        if (s1[i] === s2[i]) prefixLen++;
        else break;
    }

    const jaroWinklerScore = jaro + (prefixLen * 0.1 * (1 - jaro));
    return jaroWinklerScore;
}

/**
 * Find closest match in dictionary using Jaro-Winkler
 * @param {string} word - Input word (possibly misspelled)
 * @param {string[]} dictionary - List of correct spellings
 * @param {number} threshold - Minimum similarity (default: 0.88)
 * @returns {string|null} - Corrected word or null if no match
 */
function findClosestMatch(word, dictionary, threshold = 0.88) {
    if (!word || dictionary.length === 0) return null;

    const lowerWord = word.toLowerCase();
    let bestMatch = null;
    let bestScore = threshold;

    for (const candidate of dictionary) {
        const score = jaroWinkler(lowerWord, candidate.toLowerCase());
        if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
        }
    }

    return bestMatch;
}

/**
 * Correct known brand/food spelling errors
 * @param {string} text - Input text
 * @param {Object} dictionaries - { brands, foods, beverages }
 * @returns {Object} - { corrected: string, corrections: Array }
 */
function correctTokens(text, dictionaries = {}) {
    let corrected = text;
    const corrections = [];

    const allDicts = {
        brands: dictionaries.brands || [],
        foods: dictionaries.foods || [],
        beverages: dictionaries.beverages || []
    };

    // Build combined dictionary
    const combined = [...allDicts.brands, ...allDicts.foods, ...allDicts.beverages];

    // Find and replace misspellings
    const words = text.split(/\s+/);
    const correctedWords = words.map(word => {
        // Skip very short words
        if (word.length < 3) return word;

        const match = findClosestMatch(word, combined, 0.88);
        if (match && match.toLowerCase() !== word.toLowerCase()) {
            corrections.push({ original: word, corrected: match });
            return match;
        }

        return word;
    });

    corrected = correctedWords.join(' ');

    return { corrected, corrections };
}

/**
 * Check if two strings are similar (for duplicate detection)
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @param {number} threshold - Similarity threshold (default: 0.90)
 * @returns {boolean} - True if similar
 */
function areSimilar(s1, s2, threshold = 0.90) {
    return jaroWinkler(s1, s2) >= threshold;
}

module.exports = {
    jaroWinkler,
    findClosestMatch,
    correctTokens,
    areSimilar
};
