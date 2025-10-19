/**
 * Brand & variant lexicon with calorie adjustments
 * Provides brand-specific multipliers and base calories
 */

/**
 * Oat milk variants (per 240ml / 1 cup)
 */
const OAT_MILK_VARIANTS = {
    'oatly original': { calories: 120, type: 'regular' },
    'oatly barista': { calories: 140, type: 'barista' },
    'oatly unsweetened': { calories: 60, type: 'unsweetened' },
    'oatly low fat': { calories: 90, type: 'lowfat' },
    'planet oat original': { calories: 110, type: 'regular' },
    'planet oat unsweetened': { calories: 50, type: 'unsweetened' },
    'chobani oat': { calories: 120, type: 'regular' },
    'chobani oat unsweetened': { calories: 90, type: 'unsweetened' },
    'califi farms barista': { calories: 130, type: 'barista' },
    'califi farms unsweetened': { calories: 35, type: 'unsweetened' },
    'minor figures': { calories: 120, type: 'barista' },

    // Generic classifications
    'oat milk barista': { calories: 140, type: 'barista' },
    'oat milk unsweetened': { calories: 60, type: 'unsweetened' },
    'oat milk': { calories: 120, type: 'regular' }
};

/**
 * Almond milk variants (per 240ml / 1 cup)
 */
const ALMOND_MILK_VARIANTS = {
    'almond breeze original': { calories: 60, type: 'regular' },
    'almond breeze unsweetened': { calories: 30, type: 'unsweetened' },
    'silk almond': { calories: 60, type: 'regular' },
    'silk almond unsweetened': { calories: 30, type: 'unsweetened' },
    'califia almond': { calories: 35, type: 'unsweetened' },

    // Generic
    'almond milk unsweetened': { calories: 30, type: 'unsweetened' },
    'almond milk': { calories: 60, type: 'regular' }
};

/**
 * Dairy milk variants (per 240ml / 1 cup)
 */
const DAIRY_MILK_VARIANTS = {
    'whole milk': { calories: 150, fat: 'whole' },
    '2% milk': { calories: 122, fat: '2%' },
    '1% milk': { calories: 102, fat: '1%' },
    'skim milk': { calories: 83, fat: 'skim' },
    'nonfat milk': { calories: 83, fat: 'skim' }
};

/**
 * Chai concentrates (per 240ml prepared with milk)
 */
const CHAI_VARIANTS = {
    'oregon chai original': { calories: 240, sugar: 'sweetened' },
    'oregon chai unsweetened': { calories: 140, sugar: 'unsweetened' },
    'tazo chai concentrate': { calories: 190, sugar: 'sweetened' },
    'pacific chai': { calories: 220, sugar: 'sweetened' },

    // Generic
    'chai concentrate': { calories: 200, sugar: 'sweetened' },
    'chai latte': { calories: 240, sugar: 'sweetened' }
};

/**
 * Coffee drink variants (Starbucks-style, per 16oz grande)
 */
const COFFEE_DRINKS = {
    // Brewed/basic
    'black coffee': { calories: 5, type: 'brewed' },
    'cold brew': { calories: 5, type: 'brewed' },
    'americano': { calories: 15, type: 'espresso' },

    // Milk-based
    'latte': { calories: 190, type: 'espresso+milk' },
    'cappuccino': { calories: 140, type: 'espresso+milk' },
    'flat white': { calories: 170, type: 'espresso+milk' },
    'cortado': { calories: 80, type: 'espresso+milk' },

    // Flavored/sweet
    'vanilla latte': { calories: 250, type: 'flavored' },
    'caramel latte': { calories: 270, type: 'flavored' },
    'mocha': { calories: 370, type: 'flavored' },
    'white mocha': { calories: 430, type: 'flavored' },
    'pumpkin spice latte': { calories: 380, type: 'seasonal' },

    // Frappuccinos (blended)
    'frappuccino': { calories: 420, type: 'blended' },
    'caramel frappuccino': { calories: 420, type: 'blended' },
    'mocha frappuccino': { calories: 410, type: 'blended' },

    // Refreshers
    'refresher': { calories: 90, type: 'refresher' }
};

/**
 * Decaf flags (modifiers, no calorie impact)
 */
const DECAF_FLAGS = [
    'decaf',
    'decaffeinated',
    'half caf',
    'half caff',
    'no caffeine'
];

/**
 * Cereal brands (per 100g serving)
 * Expanded from existing list
 */
const CEREAL_CALORIES = {
    'cheerios': 380,
    'honey nut cheerios': 390,
    'life cereal': 370,
    'kix': 357,
    'lucky charms': 390,
    'frosted flakes': 380,
    'corn flakes': 360,
    'raisin bran': 325,
    'wheaties': 340,
    'grape nuts': 370,
    'granola': 450,
    'muesli': 340,
    'bran flakes': 320,
    'rice krispies': 380,
    'special k': 375,
    'cinnamon toast crunch': 420,
    'fruit loops': 390,
    "cap'n crunch": 400
};

/**
 * Find brand info from text
 * @param {string} text - Message text
 * @returns {Object|null} - { brand, calories, type, multiplier }
 */
function findBrandInfo(text) {
    const lowerText = text.toLowerCase();

    // Check oat milk variants
    for (const [brand, info] of Object.entries(OAT_MILK_VARIANTS)) {
        if (lowerText.includes(brand)) {
            return {
                brand,
                calories: info.calories,
                type: 'oat_milk',
                variant: info.type,
                multiplier: info.calories / 120 // Normalize to regular oat milk
            };
        }
    }

    // Check almond milk variants
    for (const [brand, info] of Object.entries(ALMOND_MILK_VARIANTS)) {
        if (lowerText.includes(brand)) {
            return {
                brand,
                calories: info.calories,
                type: 'almond_milk',
                variant: info.type,
                multiplier: info.calories / 60 // Normalize to regular almond milk
            };
        }
    }

    // Check dairy milk
    for (const [brand, info] of Object.entries(DAIRY_MILK_VARIANTS)) {
        if (lowerText.includes(brand)) {
            return {
                brand,
                calories: info.calories,
                type: 'dairy_milk',
                variant: info.fat,
                multiplier: info.calories / 150 // Normalize to whole milk
            };
        }
    }

    // Check chai
    for (const [brand, info] of Object.entries(CHAI_VARIANTS)) {
        if (lowerText.includes(brand)) {
            return {
                brand,
                calories: info.calories,
                type: 'chai',
                variant: info.sugar,
                multiplier: info.calories / 200 // Normalize to generic chai
            };
        }
    }

    // Check coffee drinks
    for (const [drink, info] of Object.entries(COFFEE_DRINKS)) {
        if (lowerText.includes(drink)) {
            return {
                brand: drink,
                calories: info.calories,
                type: 'coffee',
                variant: info.type,
                multiplier: info.calories / 190 // Normalize to basic latte
            };
        }
    }

    // Check cereal
    for (const [cereal, calories] of Object.entries(CEREAL_CALORIES)) {
        if (lowerText.includes(cereal)) {
            return {
                brand: cereal,
                calories,
                type: 'cereal',
                multiplier: calories / 370 // Normalize to average cereal
            };
        }
    }

    return null;
}

/**
 * Check if drink contains caffeine
 * @param {string} text - Message text
 * @returns {Object} - { hasCaffeine, isDecaf }
 */
function checkCaffeine(text) {
    const lowerText = text.toLowerCase();

    // Check decaf flags
    const isDecaf = DECAF_FLAGS.some(flag => lowerText.includes(flag));

    // Check caffeinated items
    const caffeinatedItems = [
        'coffee', 'espresso', 'latte', 'cappuccino', 'americano',
        'chai', 'black tea', 'green tea', 'matcha',
        'energy drink', 'red bull', 'monster',
        'refresher' // Starbucks refreshers have caffeine
    ];

    const hasCaffeine = !isDecaf && caffeinatedItems.some(item => lowerText.includes(item));

    return { hasCaffeine, isDecaf };
}

module.exports = {
    OAT_MILK_VARIANTS,
    ALMOND_MILK_VARIANTS,
    DAIRY_MILK_VARIANTS,
    CHAI_VARIANTS,
    COFFEE_DRINKS,
    CEREAL_CALORIES,
    DECAF_FLAGS,
    findBrandInfo,
    checkCaffeine
};
