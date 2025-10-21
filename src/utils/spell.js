/**
 * Lightweight Spell Correction & Fuzzy Matching
 * Uses Jaro-Winkler distance for near-miss corrections
 * V2: Domain-aware to prevent BM → food/drink false corrections
 */

// Protected BM vocabulary (NEVER spell-correct these)
const BM_PROTECTED = new Set([
    'poop', 'poops', 'pooping', 'pooped',
    'bm', 'stool', 'stools',
    'bowel', 'bowels', 'bowel-movement',
    'constipation', 'constipated',
    'diarrhea', 'diarrhoea',
    'loose', 'watery',
    'hard', 'pellet', 'pellets', 'pebbles',
    'bristol', 'toilet', 'bathroom'
]);

// Global deny list (never correct these words)
const SPELL_DENY = new Set(['poop', 'poops', 'bm', 'stool', 'poo']);

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

/**
 * Safe spell correction with domain awareness
 * Prevents BM words from being corrected to food/drink
 * @param {string} token - Word to potentially correct
 * @param {Object} context - { vocab, candidateDomains, activeDomain, domainIndex }
 * @returns {string} - Original or corrected token
 */
function safeCorrectToken(token, context = {}) {
    const raw = (token || '').toLowerCase().trim();
    if (!raw || raw.length < 3) return token;

    // 1. Hard deny list
    if (SPELL_DENY.has(raw)) {
        return token; // Never correct
    }

    // 2. BM-protected vocabulary
    if (BM_PROTECTED.has(raw)) {
        return token; // Never correct BM words
    }

    // 3. Try to find correction
    const { vocab = [], candidateDomains = [], activeDomain = null } = context;
    const correction = findClosestMatch(raw, vocab, 0.88);

    if (!correction || correction.toLowerCase() === raw) {
        return token; // No correction needed
    }

    // 4. Domain safety gate
    // If we're in symptomatic domain (bm/symptom) and correction would flip to food/drink
    const symptomatic = candidateDomains.includes('bm') || candidateDomains.includes('symptom');

    if (symptomatic) {
        // Only allow corrections with very high confidence (>0.94)
        const score = jaroWinkler(raw, correction.toLowerCase());
        if (score < 0.94) {
            // Blocked domain-flip correction
            return token; // Keep original
        }
    }

    // Spell correction applied
    return correction;
}

/**
 * Safe correction that prevents noun expansion
 * Never expands single tokens into multi-word phrases
 * @param {string} token - Word to potentially correct
 * @param {string} suggestion - Suggested correction
 * @returns {string} - Original or corrected token
 */
function safeCorrect(token, suggestion) {
    const DO_NOT_TOUCH = new Set(['poop','bm','bristol']); // never change
    if (DO_NOT_TOUCH.has(token)) return token;
    // if the suggestion contains whitespace, keep the original token
    if (suggestion && /\s/.test(suggestion)) return token;
    return suggestion || token;
}

module.exports = {
    jaroWinkler,
    findClosestMatch,
    correctTokens,
    areSimilar,
    safeCorrectToken,  // V2: Domain-aware correction
    safeCorrect,       // V3: Prevents noun expansion
    BM_PROTECTED,
    SPELL_DENY
};

