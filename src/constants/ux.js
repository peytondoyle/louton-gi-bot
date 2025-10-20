// UX Constants: Emojis, Labels, Colors, Button IDs, Canned Phrases
// Used consistently across all bot interactions

// Category Emojis - prefix every reply with exactly one
const EMOJI = {
    food: '🍽️',
    drink: '💧',
    symptom: '😣',
    bm: '💩',
    reflux: '🔥',
    streak: '💪',
    insight: '🔮',
    summary: '📊',
    checkin: '🌅',
    recap: '🌙',
    caution: '⚠️',
    success: '✅',
    error: '😅',
    celebration: '🎉',
    thinking: '👀',
    heart: '🫶'
};

// Embed Colors (Discord color integers)
const COLORS = {
    success: 0x57F287,    // Green
    caution: 0xFEE75C,    // Yellow
    error: 0xED4245,      // Red
    info: 0x5865F2,       // Blurple
    neutral: 0x99AAB5,    // Gray
    improvement: 0x3BA55D // Dark Green
};

// Severity Color Mapping
const SEVERITY_COLORS = {
    mild: COLORS.success,
    moderate: COLORS.caution,
    severe: COLORS.error,
    unknown: COLORS.neutral
};

// Button Custom IDs (stable, namespaced)
const BUTTON_IDS = {
    // Symptom type clarification
    symptom: {
        reflux: 'symptom_reflux',
        pain: 'symptom_pain',
        bloat: 'symptom_bloat',
        nausea: 'symptom_nausea',
        general: 'symptom_general'
    },

    // Meal time clarification
    meal: {
        breakfast: 'meal_breakfast',
        lunch: 'meal_lunch',
        dinner: 'meal_dinner',
        snack: 'meal_snack'
    },

    // Bristol scale for BM
    bristol: {
        1: 'bristol_1',
        2: 'bristol_2',
        3: 'bristol_3',
        4: 'bristol_4',
        5: 'bristol_5',
        6: 'bristol_6',
        7: 'bristol_7'
    },

    // Severity rating (1-10)
    severity: {
        1: 'severity_1',
        2: 'severity_2',
        3: 'severity_3',
        4: 'severity_4',
        5: 'severity_5',
        6: 'severity_6',
        7: 'severity_7',
        8: 'severity_8',
        9: 'severity_9',
        10: 'severity_10'
    },

    // Morning check-in
    checkin: {
        good: 'checkin_good',
        okay: 'checkin_okay',
        bad: 'checkin_bad'
    },

    // Actions
    undo: 'undo_last',
    dismiss: 'dismiss_msg',

    // Intent clarification
    intent: {
        log_food: 'intent_log_food',
        log_symptom: 'intent_log_symptom',
        cancel: 'intent_cancel'
    }
};

// Button Labels
const BUTTON_LABELS = {
    symptom: {
        reflux: 'Reflux/Heartburn',
        pain: 'Stomach Pain',
        bloat: 'Bloating/Gas',
        nausea: 'Nausea',
        general: 'General Discomfort'
    },

    meal: {
        breakfast: '🌅 Breakfast',
        lunch: '🌞 Lunch',
        dinner: '🌙 Dinner',
        snack: '🥨 Snack'
    },

    bristol: {
        1: '1 - Hard lumps',
        2: '2 - Lumpy/sausage',
        3: '3 - Cracked sausage',
        4: '4 - Smooth/soft',
        5: '5 - Soft blobs',
        6: '6 - Mushy',
        7: '7 - Liquid'
    },

    checkin: {
        good: '😊 Feeling Good',
        okay: '😐 Okay',
        bad: '😣 Not Great'
    },

    undo: '↩️ Undo Last Entry',
    dismiss: '✖️ Dismiss',

    intent: {
        log_food: 'Log Food/Drink',
        log_symptom: 'Log Symptom',
        cancel: 'Cancel'
    }
};

// Canned Response Phrases
const PHRASES = {
    success: [
        '✅ Logged! You\'re building great data habits 💪',
        '✅ Got it! Your tracking game is strong 💪',
        '✅ Saved! Keep up the consistent logging 💪',
        '✅ Logged successfully! Great job staying on top of it 💪'
    ],

    caution: [
        '⚠️ Heads-up — **{trigger}** triggered symptoms {count}× recently.',
        '⚠️ Watch out — **{trigger}** has been linked to {count} symptom events.',
        '⚠️ Caution — **{trigger}** seems to cause issues. Seen {count}× recently.'
    ],

    improvement: [
        '🎉 Trend looks **{percent}% better** this week! Keep the gut love going 🫶',
        '🎉 Amazing! **{percent}% improvement** — you\'re on the right track 🫶',
        '🎉 Wow! **{percent}% better** than before. Your gut thanks you 🫶'
    ],

    roughPatch: [
        '👀 Rough patch today — hydration + rest may help.',
        '👀 Tough day detected. Take it easy and stay hydrated.',
        '👀 Hang in there — gentle foods and rest might help.'
    ],

    error: [
        '😅 Oops, I had trouble saving that. Mind trying again?',
        '😅 Something went wrong on my end. Could you retry?',
        '😅 Hmm, that didn\'t save. Let\'s give it another shot?'
    ]
};

// UX Configuration
const UX = {
    MAX_SECTION_LINES: 8,
    DIVIDER: '— — — — —',
    CONTEXT_MEMORY_SIZE: 3,
    CONTEXT_MEMORY_TTL: 24 * 60 * 60 * 1000, // 24 hours in ms
    WARNING_COOLDOWN: 24 * 60 * 60 * 1000, // 24 hours in ms
    ROUGH_PATCH_WINDOW: 8 * 60 * 60 * 1000, // 8 hours in ms
    CONFIRMATION_DELETE_DELAY: 3000 // 3 seconds
};

// Utility: Get random phrase from array
function getRandomPhrase(phraseArray) {
    return phraseArray[Math.floor(Math.random() * phraseArray.length)];
}

// Utility: Format phrase with variables
function formatPhrase(phrase, vars = {}) {
    let result = phrase;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replace(`{${key}}`, value);
    }
    return result;
}

// Utility: Map severity level to color
function getSeverityColor(severity) {
    if (!severity) return SEVERITY_COLORS.unknown;
    const lower = severity.toLowerCase();
    return SEVERITY_COLORS[lower] || SEVERITY_COLORS.unknown;
}

// Utility: Get emoji for entry type
function getTypeEmoji(type) {
    const typeMap = {
        food: EMOJI.food,
        drink: EMOJI.drink,
        symptom: EMOJI.symptom,
        reflux: EMOJI.reflux,
        bm: EMOJI.bm,
        positive: EMOJI.celebration
    };
    return typeMap[type] || EMOJI.insight;
}

module.exports = {
    EMOJI,
    COLORS,
    SEVERITY_COLORS,
    BUTTON_IDS,
    BUTTON_LABELS,
    PHRASES,
    UX,
    getRandomPhrase,
    formatPhrase,
    getSeverityColor,
    getTypeEmoji
};
