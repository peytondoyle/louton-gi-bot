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

// Button Custom IDs (stable, namespaced with colons)
const BUTTON_IDS = {
    // Symptom type clarification
    symptomReflux: 'symptom:reflux',
    symptomPain: 'symptom:pain',
    symptomBloat: 'symptom:bloat',
    symptomNausea: 'symptom:nausea',
    symptomGeneral: 'symptom:general',

    // Meal time clarification
    mealBreakfast: 'meal:breakfast',
    mealLunch: 'meal:lunch',
    mealDinner: 'meal:dinner',
    mealSnack: 'meal:snack',

    // Bristol scale for BM
    bristol1: 'bristol:1',
    bristol2: 'bristol:2',
    bristol3: 'bristol:3',
    bristol4: 'bristol:4',
    bristol5: 'bristol:5',
    bristol6: 'bristol:6',
    bristol7: 'bristol:7',

    // Severity rating (1-10)
    severity1: 'severity:1',
    severity2: 'severity:2',
    severity3: 'severity:3',
    severity4: 'severity:4',
    severity5: 'severity:5',
    severity6: 'severity:6',
    severity7: 'severity:7',
    severity8: 'severity:8',
    severity9: 'severity:9',
    severity10: 'severity:10',

    // Morning check-in
    checkinGood: 'checkin:good',
    checkinOkay: 'checkin:okay',
    checkinBad: 'checkin:bad',

    // General Actions
    undo: 'action:undo',
    dismiss: 'action:dismiss',

    // Intent clarification
    intentLogFood: 'intent:log_food',
    intentLogSymptom: 'intent:log_symptom',
    intentCancel: 'intent:cancel',

    // Conversational Help System
    helpLogging: 'help:logging',
    helpAsking: 'help:asking',
    helpSettings: 'help:settings',
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
