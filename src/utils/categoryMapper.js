/**
 * Category Mapper
 * Auto-classifies food/drink items into categories for analysis
 */

// Category precedence (when multiple match, choose first)
const CATEGORY_PRECEDENCE = ['protein', 'caffeine', 'grain', 'dairy', 'non_dairy', 'veg', 'fruit', 'sweet', 'fat'];

// Item → Category mappings
const CATEGORY_MAP = {
    // Grains
    'oats': 'grain',
    'oatmeal': 'grain',
    'cereal': 'grain',
    'rice': 'grain',
    'toast': 'grain',
    'bread': 'grain',
    'bagel': 'grain',
    'pasta': 'grain',
    'noodles': 'grain',
    'quinoa': 'grain',
    'farro': 'grain',
    'muffin': 'grain',
    'pancake': 'grain',
    'waffle': 'grain',

    // Proteins
    'eggs': 'protein',
    'egg': 'protein',
    'chicken': 'protein',
    'beef': 'protein',
    'pork': 'protein',
    'fish': 'protein',
    'salmon': 'protein',
    'tuna': 'protein',
    'turkey': 'protein',
    'tofu': 'protein',
    'tempeh': 'protein',

    // Dairy
    'yogurt': 'dairy',
    'milk': 'dairy',
    'cheese': 'dairy',
    'cream': 'dairy',
    'butter': 'dairy',
    'ice cream': 'dairy',

    // Non-dairy
    'oat milk': 'non_dairy',
    'almond milk': 'non_dairy',
    'soy milk': 'non_dairy',
    'coconut milk': 'non_dairy',
    'oatly': 'non_dairy',

    // Vegetables
    'salad': 'veg',
    'spinach': 'veg',
    'kale': 'veg',
    'broccoli': 'veg',
    'carrots': 'veg',
    'vegetables': 'veg',
    'veggies': 'veg',

    // Fruits
    'banana': 'fruit',
    'apple': 'fruit',
    'berries': 'fruit',
    'orange': 'fruit',
    'strawberry': 'fruit',

    // Caffeine
    'coffee': 'caffeine',
    'espresso': 'caffeine',
    'latte': 'caffeine',
    'cappuccino': 'caffeine',
    'americano': 'caffeine',
    'tea': 'caffeine',
    'chai': 'caffeine',
    'matcha': 'caffeine',
    'green tea': 'caffeine',
    'black tea': 'caffeine',

    // Sweet
    'chocolate': 'sweet',
    'cookie': 'sweet',
    'cake': 'sweet',
    'candy': 'sweet',
    'dessert': 'sweet',

    // Fat
    'avocado': 'fat',
    'nuts': 'fat',
    'peanut butter': 'fat',
    'oil': 'fat'
};

/**
 * Infer category from item text
 * @param {string} item - Food/drink item name
 * @returns {string|null} - Category or null
 */
function inferCategory(item) {
    if (!item) return null;

    const itemLower = item.toLowerCase();

    // Find all matching categories
    const matches = [];
    for (const [keyword, category] of Object.entries(CATEGORY_MAP)) {
        if (itemLower.includes(keyword)) {
            matches.push(category);
        }
    }

    if (matches.length === 0) return null;

    // Return highest precedence category
    for (const category of CATEGORY_PRECEDENCE) {
        if (matches.includes(category)) {
            return category;
        }
    }

    return matches[0]; // Fallback to first match
}

/**
 * Infer prep method from text
 * @param {string} text - Full message text
 * @returns {string|null} - Prep method or null
 */
function inferPrep(text) {
    if (!text) return null;

    const textLower = text.toLowerCase();

    const prepKeywords = {
        'fried': 'fried',
        'baked': 'baked',
        'grilled': 'grilled',
        'roasted': 'roasted',
        'steamed': 'steamed',
        'boiled': 'boiled',
        'sauteed': 'sauteed',
        'raw': 'raw',
        'iced': 'iced',
        'hot': 'hot'
    };

    for (const [keyword, prep] of Object.entries(prepKeywords)) {
        if (textLower.includes(keyword)) {
            return prep;
        }
    }

    return null;
}

module.exports = {
    inferCategory,
    inferPrep,
    CATEGORY_MAP,
    CATEGORY_PRECEDENCE
};
