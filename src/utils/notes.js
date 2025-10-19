/**
 * Notes Token Parser
 * Parses semi-structured Notes field into key=value tokens
 */

/**
 * Parse Notes string into structured tokens
 * @param {string} notesString - Raw Notes field (e.g., "portion=1 cup, caffeine, deleted=true")
 * @returns {Object} - Parsed token interface
 */
function parseNotes(notesString) {
    const tokens = new Map();

    if (!notesString || typeof notesString !== 'string') {
        return createTokenInterface(tokens);
    }

    // Split by comma, semicolon, or newline
    const parts = notesString.split(/[,;\n]+/);

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Check for key=value pattern
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
            const value = trimmed.slice(eqIdx + 1).trim();

            // Parse value types
            if (value === 'true') {
                tokens.set(key, true);
            } else if (value === 'false') {
                tokens.set(key, false);
            } else if (!isNaN(value) && value !== '') {
                tokens.set(key, parseFloat(value));
            } else {
                tokens.set(key, value);
            }
        } else {
            // Standalone flag (e.g., "caffeine")
            tokens.set(trimmed.toLowerCase(), true);
        }
    }

    return createTokenInterface(tokens);
}

/**
 * Create token interface with helper methods
 * @param {Map} tokens - Parsed tokens map
 * @returns {Object} - Token interface
 */
function createTokenInterface(tokens) {
    return {
        tokens,
        has(key) {
            return tokens.has(key.toLowerCase());
        },
        get(key) {
            return tokens.get(key.toLowerCase());
        },
        getNumber(key) {
            const val = tokens.get(key.toLowerCase());
            return typeof val === 'number' ? val : null;
        },
        getBool(key) {
            const val = tokens.get(key.toLowerCase());
            return val === true;
        },
        all() {
            return Object.fromEntries(tokens);
        }
    };
}

/**
 * Check if Notes contains deleted=true flag
 * @param {string} notesString - Raw Notes field
 * @returns {boolean}
 */
function hasDeleted(notesString) {
    if (!notesString) return false;
    const parsed = parseNotes(notesString);
    return parsed.getBool('deleted');
}

/**
 * Check if Notes has a specific token/key
 * @param {string} notesString - Raw Notes field
 * @param {string} key - Token key to check
 * @returns {boolean}
 */
function hasToken(notesString, key) {
    if (!notesString) return false;
    const parsed = parseNotes(notesString);
    return parsed.has(key);
}

/**
 * Get specific token value from Notes
 * @param {string} notesString - Raw Notes field
 * @param {string} key - Token key
 * @returns {*} - Token value or null
 */
function getToken(notesString, key) {
    if (!notesString) return null;
    const parsed = parseNotes(notesString);
    return parsed.get(key);
}

module.exports = {
    parseNotes,
    hasDeleted,
    hasToken,
    getToken
};
