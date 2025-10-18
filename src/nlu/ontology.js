// NLU Ontology: Intents, Synonyms, Time Windows, Severity Mappings
// Deterministic rules-based understanding for GI tracking

const INTENTS = ["food", "drink", "symptom", "reflux", "bm", "checkin", "other"];

// Synonym dictionaries for slot extraction
const SYNONYMS = {
    // Meal times
    mealTime: {
        breakfast: ["breakfast", "brekkie", "morning", "am", "this morning", "for breakfast"],
        lunch: ["lunch", "midday", "noon", "afternoon", "for lunch"],
        dinner: ["dinner", "supper", "evening", "tonight", "for dinner"],
        snack: ["snack", "nibble", "bite", "for snack", "between meals"]
    },

    // Symptom types
    symptoms: {
        reflux: ["reflux", "heartburn", "acid", "acid reflux", "burning", "burn", "gerd"],
        pain: ["pain", "ache", "cramp", "stomachache", "stomach pain", "hurt", "hurts", "aching"],
        bloat: ["bloat", "bloated", "bloating", "gassy", "gas", "full", "distended"],
        nausea: ["nausea", "nauseous", "queasy", "sick", "feel sick"],
        general: ["off", "unsettled", "not feeling well", "not feeling great", "ugh", "rough", "uncomfortable", "bad day"]
    },

    // BM descriptors
    bm: {
        loose: ["diarrhea", "loose", "watery", "runny", "bad poop", "bathroom was rough", "liquid", "urgent"],
        hard: ["hard", "constipated", "pellets", "rocky", "dry", "difficult"],
        normal: ["normal", "good", "healthy", "regular", "fine"]
    },

    // Drink items
    drinks: {
        coffee: ["coffee", "espresso", "latte", "cappuccino", "americano", "cold brew"],
        tea: ["tea", "chai", "green tea", "herbal tea", "chamomile", "ginger tea"],
        water: ["water", "h2o", "aqua"],
        soda: ["soda", "coke", "pepsi", "sprite", "pop", "soft drink"],
        juice: ["juice", "oj", "orange juice", "apple juice"],
        alcohol: ["beer", "wine", "alcohol", "cocktail", "whiskey", "vodka", "drink"]
    },

    // Common foods (for quick recognition)
    foods: {
        grains: ["oats", "oatmeal", "rice", "bread", "toast", "pasta", "cereal"],
        protein: ["chicken", "eggs", "egg", "fish", "beef", "turkey"],
        fruits: ["banana", "apple", "orange", "berries"],
        dairy: ["milk", "cheese", "yogurt", "dairy"],
        trigger: ["pizza", "spicy", "fried", "citrus", "tomato"]
    }
};

// Time windows for meal inference (24-hour format)
const DEFAULT_WINDOWS = {
    breakfast: { start: "05:00", end: "11:00", label: "breakfast" },
    lunch: { start: "11:00", end: "14:30", label: "lunch" },
    dinner: { start: "17:00", end: "21:00", label: "dinner" },
    snack: { start: "00:00", end: "23:59", label: "snack" } // All-day fallback
};

// Adjective to severity numeric mapping (1-10 scale)
const ADJECTIVE_SEVERITY = {
    "mild": 2,
    "slight": 2,
    "minor": 2,
    "little": 2,
    "medium": 5,
    "moderate": 5,
    "okay": 5,
    "bad": 7,
    "severe": 7,
    "terrible": 8,
    "awful": 9,
    "horrible": 9,
    "worst": 10,
    "intense": 9
};

// Intent keywords for detection
const INTENT_KEYWORDS = {
    // BM/bathroom keywords (highest priority)
    bm: [
        "bm", "bowel", "bathroom", "poop", "poo", "stool", "toilet",
        "went to the bathroom", "had to go", "pooped", "restroom"
    ],

    // Reflux keywords (very specific)
    reflux: [
        "reflux", "heartburn", "acid", "burning", "gerd", "burn"
    ],

    // Drink action words
    drink: [
        "drank", "drinking", "had a", "sipped", "chugged", "had some",
        "finished", "grabbed", "got a"
    ],

    // Food action words
    food: [
        "ate", "eaten", "had", "having", "eating", "consumed", "finished",
        "grabbed", "made", "cooked", "prepared"
    ],

    // Symptom/feeling words
    symptom: [
        "feeling", "feel", "symptoms", "experiencing", "having",
        "not feeling", "uncomfortable", "rough", "ugh"
    ]
};

// Blacklist for item extraction (not food/drink items)
const ITEM_BLACKLIST = [
    "breakfast", "lunch", "dinner", "snack", "morning", "evening", "noon",
    "afternoon", "today", "yesterday", "night", "time", "feeling", "feel",
    "had", "ate", "drank", "some", "the", "a", "an", "my", "for", "at",
    "this", "that", "i", "me", "was", "were", "am", "is", "are"
];

/**
 * Check if text contains any synonym from a group
 * @param {string} text - Lowercased text
 * @param {string[]} synonyms - Array of synonyms to check
 * @returns {boolean}
 */
function containsSynonym(text, synonyms) {
    return synonyms.some(syn => text.includes(syn));
}

/**
 * Find which synonym group matches in text
 * @param {string} text - Lowercased text
 * @param {Object} synonymGroups - Object with group names as keys
 * @returns {string|null} - Group name or null
 */
function findSynonymGroup(text, synonymGroups) {
    for (const [groupName, synonyms] of Object.entries(synonymGroups)) {
        if (containsSynonym(text, synonyms)) {
            return groupName;
        }
    }
    return null;
}

/**
 * Extract severity from adjectives in text
 * @param {string} text - Lowercased text
 * @returns {number|null} - Severity 1-10 or null
 */
function extractSeverityFromAdjectives(text) {
    for (const [adjective, severity] of Object.entries(ADJECTIVE_SEVERITY)) {
        if (text.includes(adjective)) {
            return severity;
        }
    }
    return null;
}

/**
 * Get current time window (breakfast/lunch/dinner/snack)
 * @param {Date} time - Time to check (default: now)
 * @returns {string} - Window label
 */
function getCurrentWindow(time = new Date()) {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const timeNum = hours + minutes / 60;

    // Parse window bounds
    const parseTime = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h + m / 60;
    };

    if (timeNum >= parseTime(DEFAULT_WINDOWS.breakfast.start) &&
        timeNum < parseTime(DEFAULT_WINDOWS.breakfast.end)) {
        return "breakfast";
    }

    if (timeNum >= parseTime(DEFAULT_WINDOWS.lunch.start) &&
        timeNum < parseTime(DEFAULT_WINDOWS.lunch.end)) {
        return "lunch";
    }

    if (timeNum >= parseTime(DEFAULT_WINDOWS.dinner.start) &&
        timeNum < parseTime(DEFAULT_WINDOWS.dinner.end)) {
        return "dinner";
    }

    return "snack";
}

/**
 * Get window start time for a given meal
 * @param {string} mealTime - breakfast, lunch, dinner, snack
 * @returns {string} - Time like "05:00"
 */
function getWindowStartTime(mealTime) {
    const window = DEFAULT_WINDOWS[mealTime];
    return window ? window.start : null;
}

module.exports = {
    INTENTS,
    SYNONYMS,
    DEFAULT_WINDOWS,
    ADJECTIVE_SEVERITY,
    INTENT_KEYWORDS,
    ITEM_BLACKLIST,
    containsSynonym,
    findSynonymGroup,
    extractSeverityFromAdjectives,
    getCurrentWindow,
    getWindowStartTime
};
