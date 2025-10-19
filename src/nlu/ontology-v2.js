/**
 * NLU Ontology V2 - Comprehensive Lexicons & Maps
 * Foundation for robust, lenient natural language understanding
 *
 * TUNING KNOBS (adjust thresholds here):
 * - STRICT_CONFIDENCE_THRESHOLD = 0.80
 * - LENIENT_CONFIDENCE_THRESHOLD = 0.72
 * - SPELL_CORRECTION_THRESHOLD = 0.88
 * - LLM_CALL_RATE_TARGET = 0.25 (≤25%)
 */

// ========== CONFIGURATION ==========
const CONFIDENCE_THRESHOLDS = {
    strict: 0.80,     // Accept without any doubts
    lenient: 0.72,    // Accept if has head noun + meal time
    rescue: 0.65,     // Try rescue strategies
    reject: 0.50      // Below this, always clarify
};

const INTENTS = ["food", "drink", "symptom", "reflux", "bm", "mood", "checkin", "greeting", "thanks", "chit_chat", "farewell", "other"];

// ========== EXPANDED HEAD NOUNS ==========
const HEAD_NOUNS = [
    // Cereals & Grains
    'cereal', 'oatmeal', 'oats', 'granola', 'muesli', 'porridge',

    // Breakfast
    'eggs', 'egg', 'omelet', 'omelette', 'scramble', 'toast', 'bagel', 'muffin', 'pancake', 'waffle',
    'croissant', 'scone', 'biscuit', 'hash browns',

    // Lunch/Dinner
    'salad', 'sandwich', 'wrap', 'burger', 'pizza', 'pasta', 'noodles', 'rice', 'quinoa', 'farro',
    'soup', 'stew', 'chili', 'curry', 'stir fry', 'bowl',

    // Proteins
    'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'turkey', 'tofu', 'tempeh',

    // Snacks
    'yogurt', 'smoothie', 'shake', 'bar', 'crackers', 'chips', 'pretzels', 'nuts',

    // Mexican
    'taco', 'burrito', 'quesadilla', 'nachos', 'enchilada',

    // Beverages (also head nouns)
    'tea', 'coffee', 'latte', 'cappuccino', 'espresso', 'americano', 'macchiato', 'mocha',
    'chai', 'matcha', 'cocoa', 'juice', 'smoothie', 'shake', 'water', 'milk'
];

// ========== EGG CONSTRUCTIONS ==========
const EGG_CONSTRUCTIONS = {
    'egg cup': { item: 'eggs', impliedPortion: '1 cup', portionType: 'volume' },
    'egg cups': { item: 'eggs', impliedPortion: '1 cup', portionType: 'volume' },
    'egg bite': { item: 'egg bites', impliedPortion: '1 bite', portionType: 'count' },
    'egg bites': { item: 'egg bites', impliedPortion: '1 bite', portionType: 'count' },
    'egg muffin': { item: 'egg muffin', impliedPortion: '1 muffin', portionType: 'count' },
    'egg muffins': { item: 'egg muffins', impliedPortion: '1 muffin', portionType: 'count' }
};

// ========== CEREAL & GRAIN BRANDS ==========
const CEREAL_BRANDS = [
    'Life', 'Cheerios', 'Honey Nut Cheerios', 'Raisin Bran', 'Frosted Flakes', 'Corn Flakes',
    'Rice Krispies', 'Special K', 'Cinnamon Toast Crunch', 'Kashi', 'Grape-Nuts', 'Grape Nuts',
    'Honey Bunches of Oats', 'Mini-Wheats', 'Trix', 'Cocoa Puffs', 'Lucky Charms',
    "Cap'n Crunch", 'Golden Grahams', 'Froot Loops', 'Fruit Loops', 'Apple Jacks',
    'Wheaties', 'Chex', 'Fiber One', 'All-Bran', 'Kix'
];

// Spelling variants for fuzzy matching
const CEREAL_VARIANTS = {
    'cheerious': 'Cheerios',
    'cheerio': 'Cheerios',
    'grapenuts': 'Grape-Nuts',
    'fruit loops': 'Froot Loops',
    'capn crunch': "Cap'n Crunch",
    'captian crunch': "Cap'n Crunch"
};

// ========== BEVERAGE LEXICONS ==========
const BEVERAGES = {
    tea: ['tea', 'jasmine tea', 'green tea', 'black tea', 'white tea', 'oolong', 'herbal tea',
          'chamomile', 'peppermint tea', 'ginger tea', 'earl grey', 'english breakfast',
          'chai', 'matcha', 'sencha', 'rooibos'],

    coffee: ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'macchiato', 'mocha',
             'flat white', 'cortado', 'cold brew', 'iced coffee', 'frappuccino', 'café'],

    milk: ['milk', 'oat milk', 'almond milk', 'soy milk', 'coconut milk', 'cashew milk',
           'dairy milk', 'whole milk', '2% milk', 'skim milk', 'nonfat milk'],

    juice: ['juice', 'orange juice', 'apple juice', 'grape juice', 'cranberry juice', 'oj'],

    water: ['water', 'sparkling water', 'seltzer', 'club soda', 'tonic'],

    soda: ['soda', 'pop', 'coke', 'pepsi', 'sprite', 'dr pepper', 'mountain dew', 'ginger ale'],

    alcohol: ['beer', 'wine', 'red wine', 'white wine', 'cocktail', 'margarita', 'vodka',
              'whiskey', 'rum', 'gin', 'sake', 'champagne', 'prosecco'],

    other: ['smoothie', 'shake', 'protein shake', 'energy drink', 'sports drink', 'kombucha']
};

// Flat list of all beverages for detection
const ALL_BEVERAGES = Object.values(BEVERAGES).flat();

// ========== MILK BRAND LEXICONS ==========
const OAT_MILK_BRANDS = [
    'Oatly', 'Oatly Barista', 'Oatly Unsweetened', 'Oatly Low Fat',
    'Planet Oat', 'Chobani Oat', 'Califia Oat', 'Minor Figures'
];

const ALMOND_MILK_BRANDS = [
    'Almond Breeze', 'Silk Almond', 'Califia Almond', 'Blue Diamond'
];

const CHAI_BRANDS = [
    'Oregon Chai', 'Tazo Chai', 'Pacific Chai', 'David Rio'
];

// ========== CAFÉ SIZES ==========
const CAFE_SIZES = {
    // Starbucks standard
    'short': 236,     // 8 oz
    'tall': 355,      // 12 oz
    'grande': 473,    // 16 oz
    'venti': 591,     // 20 oz (hot) / 24 oz (cold)
    'trenta': 887,    // 30 oz (cold only)

    // Generic sizes
    'small': 355,
    'medium': 473,
    'large': 591,
    'extra large': 887
};

// ========== UNITS & CONVERSIONS ==========
const UNITS = {
    volume_ml: {
        'ml': 1, 'milliliter': 1, 'milliliters': 1,
        'l': 1000, 'liter': 1000, 'liters': 1000,
        'cup': 236.588, 'cups': 236.588, 'c': 236.588,
        'fl oz': 29.5735, 'fluid ounce': 29.5735, 'fluid ounces': 29.5735, 'oz': 29.5735,
        'tbsp': 14.7868, 'tablespoon': 14.7868, 'tablespoons': 14.7868, 'T': 14.7868,
        'tsp': 4.92892, 'teaspoon': 4.92892, 'teaspoons': 4.92892, 't': 4.92892,
        'pint': 473.176, 'pints': 473.176,
        'quart': 946.353, 'quarts': 946.353,
        'gallon': 3785.41, 'gallons': 3785.41
    },

    mass_g: {
        'g': 1, 'gram': 1, 'grams': 1,
        'kg': 1000, 'kilogram': 1000, 'kilograms': 1000,
        'oz': 28.3495, 'ounce': 28.3495, 'ounces': 28.3495,
        'lb': 453.592, 'pound': 453.592, 'pounds': 453.592
    },

    count: {
        'slice': 1, 'slices': 1,
        'piece': 1, 'pieces': 1,
        'bite': 1, 'bites': 1,
        'muffin': 1, 'muffins': 1,
        'egg': 1, 'eggs': 1,
        'cup': 1, 'cups': 1, // can be count or volume context-dependent
        'bowl': 1, 'bowls': 1,
        'serving': 1, 'servings': 1,
        'scoop': 1, 'scoops': 1,
        'handful': 1, 'handfuls': 1,
        'can': 1, 'cans': 1,
        'bottle': 1, 'bottles': 1,
        'bar': 1, 'bars': 1
    }
};

// Unicode fractions
const UNICODE_FRACTIONS = {
    '¼': 0.25, '½': 0.5, '¾': 0.75,
    '⅓': 0.33, '⅔': 0.67,
    '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
    '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8
};

// ========== DENSITY MAP (for portion estimation) ==========
const DENSITY_MAP = {
    // Cereals (grams per cup)
    'cereal': 30,
    'granola': 50,
    'oats': 80,
    'oatmeal': 80,
    'muesli': 85,

    // Grains cooked (grams per cup)
    'rice': 158,
    'brown rice': 195,
    'white rice': 158,
    'jasmine rice': 158,
    'basmati rice': 158,
    'quinoa': 185,
    'farro': 180,
    'pasta': 140,

    // Dairy (grams per cup)
    'yogurt': 245,
    'milk': 244,
    'oat milk': 240,
    'almond milk': 240,

    // Proteins (grams per serving)
    'chicken': 120,
    'salmon': 140,
    'tofu': 126,

    // Countables (grams per unit)
    'egg': 50,
    'slice_bread': 28,
    'slice_pizza': 100,
    'muffin': 60
};

// ========== RICE & GRAIN FAMILIES ==========
const RICE_VARIANTS = [
    'rice', 'brown rice', 'white rice', 'jasmine rice', 'basmati rice',
    'wild rice', 'sushi rice', 'arborio', 'sticky rice', 'fried rice'
];

const GRAINS = [
    'quinoa', 'farro', 'buckwheat', 'bulgur', 'couscous', 'millet', 'barley'
];

// ========== SWEETENERS & ADD-ONS ==========
const SWEETENERS = {
    syrups: ['vanilla syrup', 'caramel syrup', 'hazelnut syrup', 'raspberry syrup',
             'sugar-free vanilla', 'mocha sauce', 'white mocha'],
    sugars: ['sugar', 'honey', 'agave', 'stevia', 'splenda', 'equal'],
    pumps: /(\d+)\s*pumps?\s*(vanilla|caramel|hazelnut|raspberry|mocha|white\s*mocha)/i
};

// ========== DAIRY DETECTION ==========
const DAIRY_ITEMS = ['milk', 'cream', 'half and half', 'cheese', 'butter', 'yogurt',
                     'ice cream', 'whipped cream', 'sour cream'];

const NON_DAIRY_ITEMS = ['oat milk', 'almond milk', 'soy milk', 'coconut milk',
                         'cashew milk', 'rice milk', 'oat', 'almond', 'soy', 'coconut'];

// ========== CAFFEINE DETECTION ==========
const CAFFEINATED_ITEMS = [
    'coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'macchiato', 'mocha',
    'cold brew', 'iced coffee', 'frappuccino',
    'black tea', 'green tea', 'white tea', 'oolong', 'earl grey', 'english breakfast',
    'chai', 'matcha', 'yerba mate',
    'energy drink', 'red bull', 'monster', 'rockstar',
    'cola', 'coke', 'pepsi', 'dr pepper', 'mountain dew'
];

const DECAF_FLAGS = ['decaf', 'decaffeinated', 'half caf', 'half-caf', 'no caffeine', 'caffeine-free'];

// ========== ADJECTIVE → SEVERITY MAP ==========
const ADJECTIVE_SEVERITY = {
    // Mild (1-3)
    "tiny": 1, "slight": 2, "minor": 2, "mild": 2, "little": 2, "light": 3,

    // Moderate (4-6)
    "some": 4, "moderate": 5, "medium": 5, "okay": 5, "noticeable": 5,

    // Bad (7-8)
    "bad": 7, "strong": 7, "uncomfortable": 7, "rough": 7, "intense": 8,

    // Severe (9-10)
    "severe": 9, "awful": 9, "terrible": 9, "horrible": 9, "worst": 10, "unbearable": 10
};

// ========== BM DESCRIPTORS ==========
const BM_KEYWORDS = new Set([
    'poop', 'poops', 'pooping', 'pooped',
    'bm', 'stool', 'stools',
    'bowel', 'bowels', 'bowel movement',
    'bathroom', 'toilet',
    'diarrhea', 'constipation', 'constipated'
]);

const BM_DESCRIPTORS = {
    loose: ["diarrhea", "loose", "watery", "runny", "liquid", "urgent", "explosive"],
    hard: ["hard", "constipated", "pellets", "pebbles", "rocky", "dry", "difficult", "painful"],
    normal: ["normal", "good", "healthy", "regular", "fine", "solid", "formed"]
};

// Bristol scale mappings (adjective → Bristol number)
const BRISTOL_ADJ = {
    loose: 6,
    watery: 7,
    diarrhea: 7,
    liquid: 7,
    hard: 2,
    pellet: 1,
    pellets: 1,
    pebbles: 1,
    constipated: 2,
    constipation: 2,
    normal: 4,
    formed: 4
};

// Legacy format for backward compatibility
const BM_BRISTOL_MAP = {
    loose: 6,
    watery: 7,
    hard: 2,
    pellets: 1,
    normal: 4
};

// ========== SYMPTOM TYPE CANONICALIZATION ==========
const SYMPTOM_CANONICAL = {
    'heartburn': 'reflux',
    'acid': 'reflux',
    'burning': 'reflux',
    'gerd': 'reflux',

    'stomachache': 'pain',
    'stomach pain': 'pain',
    'cramp': 'pain',
    'ache': 'pain',

    'gas': 'bloat',
    'gassy': 'bloat',
    'bloated': 'bloat',
    'full': 'bloat',

    'queasy': 'nausea',
    'nauseous': 'nausea',
    'sick': 'nausea',
    'puke': 'nausea',
    'vomit': 'nausea'
};

// ========== NEGATION PATTERNS ==========
const NEGATION_PATTERNS = [
    /\b(no|not|didn't|haven't|skipped|avoiding|cut\s+out|gave\s+up)\b/i,
    /\b(without|minus)\b/i
];

// ========== MINIMAL CORE FOODS (always accept even if short) ==========
const MINIMAL_CORE_FOODS = [
    'egg', 'eggs', 'rice', 'tea', 'toast', 'soup', 'salad', 'fish',
    'milk', 'water', 'coffee', 'chai', 'oats', 'pizza', 'pasta'
];

// ========== STOPWORDS (strip before parsing) ==========
const STOPWORDS = [
    'had', 'ate', 'drank', 'got', 'having', 'eating', 'drinking',
    'the', 'a', 'an', 'some', 'for', 'at', 'with', 'and', 'of'
];

// ========== MEAL TIME INFERENCE WINDOWS ==========
const MEAL_WINDOWS = {
    breakfast: { start: 5, end: 11 },
    lunch: { start: 11, end: 15 },
    snack: { start: 15, end: 17 },
    dinner: { start: 17, end: 22 },
    late: { start: 22, end: 2 } // 10pm - 2am (overnight)
};

// ========== HELPER FUNCTIONS ==========

function containsSynonym(text, synonyms) {
    return synonyms.some(syn => text.toLowerCase().includes(syn));
}

function findSynonymGroup(text, synonymGroups) {
    for (const [groupName, synonyms] of Object.entries(synonymGroups)) {
        if (containsSynonym(text, synonyms)) {
            return groupName;
        }
    }
    return null;
}

function extractSeverityFromAdjectives(text) {
    const lower = text.toLowerCase();
    for (const [adjective, severity] of Object.entries(ADJECTIVE_SEVERITY)) {
        if (lower.includes(adjective)) {
            return severity;
        }
    }
    return null;
}

function getCurrentWindow(time = new Date()) {
    const hours = time.getHours();

    if (hours >= MEAL_WINDOWS.breakfast.start && hours < MEAL_WINDOWS.breakfast.end) {
        return "breakfast";
    }
    if (hours >= MEAL_WINDOWS.lunch.start && hours < MEAL_WINDOWS.lunch.end) {
        return "lunch";
    }
    if (hours >= MEAL_WINDOWS.snack.start && hours < MEAL_WINDOWS.snack.end) {
        return "snack";
    }
    if (hours >= MEAL_WINDOWS.dinner.start && hours < MEAL_WINDOWS.dinner.end) {
        return "dinner";
    }
    if (hours >= MEAL_WINDOWS.late.start || hours < MEAL_WINDOWS.late.end) {
        return "late";
    }

    return "snack"; // Fallback
}

function getWindowStartTime(mealTime) {
    const window = MEAL_WINDOWS[mealTime];
    return window ? `${String(window.start).padStart(2, '0')}:00` : null;
}

function isBeverage(text) {
    const lower = text.toLowerCase();
    return ALL_BEVERAGES.some(bev => lower.includes(bev));
}

function hasNegation(text) {
    return NEGATION_PATTERNS.some(pattern => pattern.test(text));
}

function isMinimalCoreFood(item) {
    return MINIMAL_CORE_FOODS.includes(item.toLowerCase().trim());
}

module.exports = {
    // Config
    CONFIDENCE_THRESHOLDS,
    INTENTS,

    // Lexicons
    HEAD_NOUNS,
    EGG_CONSTRUCTIONS,
    CEREAL_BRANDS,
    CEREAL_VARIANTS,
    BEVERAGES,
    ALL_BEVERAGES,
    OAT_MILK_BRANDS,
    ALMOND_MILK_BRANDS,
    CHAI_BRANDS,
    CAFE_SIZES,
    UNITS,
    UNICODE_FRACTIONS,
    DENSITY_MAP,
    RICE_VARIANTS,
    GRAINS,
    SWEETENERS,
    DAIRY_ITEMS,
    NON_DAIRY_ITEMS,
    CAFFEINATED_ITEMS,
    DECAF_FLAGS,
    ADJECTIVE_SEVERITY,
    BM_KEYWORDS,
    BM_DESCRIPTORS,
    BRISTOL_ADJ,
    BM_BRISTOL_MAP,
    SYMPTOM_CANONICAL,
    NEGATION_PATTERNS,
    MINIMAL_CORE_FOODS,
    STOPWORDS,
    MEAL_WINDOWS,

    // Helpers
    containsSynonym,
    findSynonymGroup,
    extractSeverityFromAdjectives,
    getCurrentWindow,
    getWindowStartTime,
    isBeverage,
    hasNegation,
    isMinimalCoreFood
};
