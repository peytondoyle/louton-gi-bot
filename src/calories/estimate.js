/**
 * Fast Calorie Estimation
 * Deterministic calorie estimation using local lookup table
 */

const LUT = require('./lookup.json');

// Unit conversion factors (to grams)
const UNIT_CONVERSIONS = {
    'g': 1,
    'gram': 1,
    'grams': 1,
    'kg': 1000,
    'kilogram': 1000,
    'oz': 28.35,
    'ounce': 28.35,
    'ounces': 28.35,
    'lb': 453.6,
    'pound': 453.6,
    'pounds': 453.6,
    'cup': 240, // Approximate for most foods
    'cups': 240,
    'tbsp': 15,
    'tablespoon': 15,
    'tablespoons': 15,
    'tsp': 5,
    'teaspoon': 5,
    'teaspoons': 5,
    'ml': 1,
    'milliliter': 1,
    'milliliters': 1,
    'l': 1000,
    'liter': 1000,
    'liters': 1000
};

/**
 * Parse quantity and unit from text
 * @param {string} text - Input text like "1.5 cups" or "2 tbsp"
 * @returns {Object} - { quantity: number, unit: string, originalText: string }
 */
function parseQuantity(text) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
    if (!match) return null;
    
    const [, quantityStr, unit] = match;
    const quantity = parseFloat(quantityStr);
    
    return {
        quantity,
        unit: unit.toLowerCase(),
        originalText: text
    };
}

/**
 * Convert units to grams for consistent calculation
 * @param {number} quantity - Amount
 * @param {string} unit - Unit name
 * @returns {number} - Quantity in grams
 */
function convertToGrams(quantity, unit) {
    const conversion = UNIT_CONVERSIONS[unit.toLowerCase()];
    if (!conversion) return null;
    return quantity * conversion;
}

/**
 * Estimate calories and macros for a food item
 * @param {Object} params - Estimation parameters
 * @param {string} params.item - Food item name
 * @param {string} [params.quantity] - Quantity with unit (e.g., "1.5 cups")
 * @param {string} [params.units] - Just the unit (e.g., "cups")
 * @returns {Object|null} - Estimation result or null if not found
 */
function estimate({ item, quantity, units }) {
    const key = item.toLowerCase().trim();
    const base = LUT[key];
    
    if (!base) {
        // Try partial matching for common variations
        const partialMatch = Object.keys(LUT).find(k => 
            k.includes(key) || key.includes(k)
        );
        
        if (partialMatch) {
            return estimate({ item: partialMatch, quantity, units });
        }
        
        return null;
    }
    
    let finalQuantity = 1;
    let unit = base.per;
    let note = `default 1 ${base.per}`;
    
    // Parse quantity if provided
    if (quantity) {
        const parsed = parseQuantity(quantity);
        if (parsed) {
            finalQuantity = parsed.quantity;
            unit = parsed.unit;
            note = `${parsed.quantity} ${parsed.unit}`;
        }
    } else if (units) {
        unit = units.toLowerCase();
    }
    
    // Handle special case where base is "100g" - need to normalize to per-gram values
    let multiplier = finalQuantity;
    if (base.per.includes('100g')) {
        // Base values are per 100g, so divide by 100 to get per-gram, then multiply by quantity
        multiplier = finalQuantity / 100;
    } else if (base.per.includes('oz')) {
        // Base values are per ounce, convert to grams if needed
        const currentGrams = convertToGrams(finalQuantity, unit);
        const baseGrams = convertToGrams(1, 'oz');
        if (currentGrams && baseGrams) {
            multiplier = currentGrams / baseGrams;
        }
    } else {
        // For other units, try simple conversion
        const currentGrams = convertToGrams(finalQuantity, unit);
        const baseGrams = convertToGrams(1, base.per.split(' ')[1] || base.per);
        if (currentGrams && baseGrams) {
            multiplier = currentGrams / baseGrams;
        }
    }
    
    return {
        calories: Math.round(base.kcal * multiplier),
        protein: Math.round(base.protein * multiplier * 10) / 10,
        carbs: Math.round(base.carbs * multiplier * 10) / 10,
        fat: Math.round(base.fat * multiplier * 10) / 10,
        note: `${note} (${base.per} base)`,
        confidence: 'high'
    };
}

/**
 * Get daily calorie target for a user
 * @param {string} userId - Discord user ID
 * @param {Map} userGoals - User goals map (optional, for testing)
 * @param {Object} googleSheets - Google Sheets service (optional)
 * @returns {Promise<number>} - Daily calorie target
 */
async function getDailyKcalTarget(userId, userGoals = null, googleSheets = null) {
    // Check if userGoals is provided (from deps)
    if (userGoals && userGoals.has(userId)) {
        return userGoals.get(userId);
    }
    
    // Check user profile if googleSheets is provided
    if (googleSheets) {
        try {
            const { getUserProfile } = require('../../services/userProfile');
            const profile = await getUserProfile(userId, googleSheets);
            if (profile.dailyGoal) {
                return profile.dailyGoal;
            }
        } catch (e) {
            console.warn('[getDailyKcalTarget] Error getting profile:', e.message);
        }
    }
    
    // Fallback to environment variable
    return Number(process.env.PEYTON_KCAL_TARGET || 2300);
}

/**
 * Calculate daily totals from entries
 * @param {Array} entries - Array of food entries
 * @returns {Object} - Daily totals
 */
function calculateDailyTotals(entries) {
    const totals = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        entryCount: entries.length
    };
    
    for (const entry of entries) {
        if (entry.Calories) totals.calories += Number(entry.Calories) || 0;
        if (entry.Protein) totals.protein += Number(entry.Protein) || 0;
        if (entry.Carbs) totals.carbs += Number(entry.Carbs) || 0;
        if (entry.Fat) totals.fat += Number(entry.Fat) || 0;
    }
    
    return totals;
}

/**
 * Format daily progress message
 * @param {Object} totals - Daily totals
 * @param {number} target - Daily calorie target
 * @returns {string} - Formatted progress message
 */
function formatDailyProgress(totals, target) {
    const remaining = target - totals.calories;
    const percentage = Math.round((totals.calories / target) * 100);
    
    let status = '';
    if (remaining > 0) {
        status = `(-${remaining.toLocaleString()} remaining)`;
    } else if (remaining < 0) {
        status = `(+${Math.abs(remaining).toLocaleString()} over)`;
    } else {
        status = '(exactly on target!)';
    }
    
    return `Today: ${totals.calories.toLocaleString()} / ${target.toLocaleString()} kcal ${status}`;
}

/**
 * Calorie estimator hardening — skip junk like "you"
 * @param {string} item - Food item to estimate
 * @param {...any} rest - Additional parameters
 * @returns {Promise<Object|null>} - Estimation result or null if invalid
 */
async function estimateCaloriesSafe(item, ...rest) {
    const txt = (item || '').toLowerCase().trim();
    if (!txt || txt.length < 3) return null;
    if (/\b(you|thanks|thank you|ok|okay|fine|solid)\b/.test(txt)) return null; // user replies
    try {
        // your normal estimator (LUT/index/etc.)
        return await estimate({ item, ...rest });
    } catch (e) {
        console.warn('[CAL-EST] guarded fail for', JSON.stringify(item), e?.message || e);
        return null;
    }
}

module.exports = {
    estimate,
    estimateCaloriesSafe,
    getDailyKcalTarget,
    calculateDailyTotals,
    formatDailyProgress
};
