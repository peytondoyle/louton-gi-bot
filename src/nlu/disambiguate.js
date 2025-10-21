/**
 * NLU V2 Disambiguation
 * Resolves conflicts when multiple interpretations are possible
 */

/**
 * Disambiguate parse result when multiple candidates exist
 * @param {Object} result - Parse result with potential conflicts
 * @param {Object} context - User context and history
 * @returns {Object} - Disambiguated result
 */
function disambiguate(result, context = {}) {
    if (!result || !result.slots) {
        return result;
    }
    
    const disambiguated = { ...result };
    
    // Disambiguate item type (food vs drink)
    if (disambiguated.slots.item) {
        disambiguated.slots.item = disambiguateItemType(disambiguated.slots.item, context);
    }
    
    // Disambiguate symptom severity
    if (disambiguated.slots.symptom_type && disambiguated.slots.severity) {
        disambiguated.slots.severity = disambiguateSeverity(disambiguated.slots.severity, context);
    }
    
    // Disambiguate meal time
    if (disambiguated.slots.meal_time) {
        disambiguated.slots.meal_time = disambiguateMealTime(disambiguated.slots.meal_time, context);
    }
    
    // Resolve intent conflicts
    if (disambiguated.intent === 'other' || disambiguated.confidence < 0.7) {
        disambiguated.intent = disambiguateIntent(disambiguated, context);
    }
    
    return disambiguated;
}

/**
 * Disambiguate item type (food vs drink)
 * @param {string} item - Item to disambiguate
 * @param {Object} context - User context
 * @returns {string} - Disambiguated item
 */
function disambiguateItemType(item, context) {
    if (!item || typeof item !== 'string') return item;
    
    const itemLower = item.toLowerCase();
    
    // Clear food items
    const foodKeywords = ['salad', 'sandwich', 'pizza', 'pasta', 'rice', 'bread', 'cereal', 'oatmeal', 'soup', 'stew', 'curry', 'stir fry', 'burger', 'taco', 'burrito', 'wrap', 'roll', 'bagel', 'muffin', 'cake', 'cookie', 'cracker', 'chip', 'nut', 'seed', 'fruit', 'vegetable', 'meat', 'fish', 'chicken', 'beef', 'pork', 'lamb', 'egg', 'cheese', 'yogurt', 'ice cream', 'pudding', 'jello'];
    
    // Clear drink items
    const drinkKeywords = ['water', 'coffee', 'tea', 'juice', 'soda', 'beer', 'wine', 'cocktail', 'smoothie', 'shake', 'milk', 'cream', 'soda', 'pop', 'cola', 'lemonade', 'iced tea', 'hot chocolate', 'cocoa', 'espresso', 'latte', 'cappuccino', 'americano', 'frappuccino', 'chai', 'matcha', 'herbal tea', 'green tea', 'black tea', 'white tea', 'oolong tea'];
    
    // Ambiguous items that need context
    const ambiguousItems = {
        'coffee': () => {
            // Check for modifiers that indicate food
            if (context.recentItems && context.recentItems.some(item => item.includes('cake') || item.includes('muffin'))) {
                return 'coffee cake'; // Likely food
            }
            return 'coffee'; // Default to drink
        },
        'soup': () => {
            // Soup is usually food, but check for drink-like modifiers
            if (itemLower.includes('drink') || itemLower.includes('beverage')) {
                return 'soup drink';
            }
            return 'soup'; // Default to food
        },
        'smoothie': () => {
            // Smoothies can be food or drink depending on context
            if (context.mealTime === 'breakfast' || context.mealTime === 'snack') {
                return 'smoothie'; // Likely drink
            }
            return 'smoothie'; // Default to drink
        },
        'milk': () => {
            // Check for food modifiers
            if (itemLower.includes('cereal') || itemLower.includes('oatmeal')) {
                return 'milk'; // Drink
            }
            return 'milk'; // Default to drink
        }
    };
    
    // Check for clear food keywords
    for (const keyword of foodKeywords) {
        if (itemLower.includes(keyword)) {
            return item; // Keep as food
        }
    }
    
    // Check for clear drink keywords
    for (const keyword of drinkKeywords) {
        if (itemLower.includes(keyword)) {
            return item; // Keep as drink
        }
    }
    
    // Handle ambiguous items
    for (const [ambiguous, resolver] of Object.entries(ambiguousItems)) {
        if (itemLower.includes(ambiguous)) {
            return resolver();
        }
    }
    
    return item; // Return unchanged if no disambiguation needed
}

/**
 * Disambiguate symptom severity
 * @param {string|number} severity - Raw severity value
 * @param {Object} context - User context
 * @returns {number} - Normalized severity (1-10)
 */
function disambiguateSeverity(severity, context) {
    if (typeof severity === 'number') {
        return Math.max(1, Math.min(10, severity));
    }
    
    if (typeof severity === 'string') {
        const severityLower = severity.toLowerCase();
        
        // Word-based severity mapping
        const severityMap = {
            'none': 0,
            'minimal': 1,
            'very mild': 2,
            'mild': 3,
            'slight': 3,
            'low': 3,
            'moderate': 5,
            'medium': 5,
            'moderately': 5,
            'severe': 8,
            'high': 8,
            'very severe': 9,
            'extreme': 10,
            'unbearable': 10
        };
        
        // Check for exact matches
        if (severityMap[severityLower] !== undefined) {
            return severityMap[severityLower];
        }
        
        // Check for partial matches
        for (const [word, value] of Object.entries(severityMap)) {
            if (severityLower.includes(word)) {
                return value;
            }
        }
        
        // Extract number from string
        const numberMatch = severityLower.match(/(\d+)/);
        if (numberMatch) {
            return Math.max(1, Math.min(10, parseInt(numberMatch[1])));
        }
    }
    
    // Default to moderate if unclear
    return 5;
}

/**
 * Disambiguate meal time
 * @param {string} mealTime - Raw meal time
 * @param {Object} context - User context
 * @returns {string} - Normalized meal time
 */
function disambiguateMealTime(mealTime, context) {
    if (!mealTime || typeof mealTime !== 'string') return mealTime;
    
    const mealTimeLower = mealTime.toLowerCase();
    
    // Time-based disambiguation
    const currentHour = new Date().getHours();
    
    // Morning (6-11 AM)
    if (currentHour >= 6 && currentHour < 11) {
        if (mealTimeLower.includes('morning') || mealTimeLower.includes('early')) {
            return 'breakfast';
        }
    }
    
    // Afternoon (11 AM - 5 PM)
    if (currentHour >= 11 && currentHour < 17) {
        if (mealTimeLower.includes('afternoon') || mealTimeLower.includes('midday')) {
            return 'lunch';
        }
    }
    
    // Evening (5 PM - 10 PM)
    if (currentHour >= 17 && currentHour < 22) {
        if (mealTimeLower.includes('evening') || mealTimeLower.includes('dinner')) {
            return 'dinner';
        }
    }
    
    // Night (10 PM - 6 AM)
    if (currentHour >= 22 || currentHour < 6) {
        if (mealTimeLower.includes('night') || mealTimeLower.includes('late')) {
            return 'dinner';
        }
    }
    
    // Standard meal time mapping
    const mealTimeMap = {
        'morning': 'breakfast',
        'breakfast': 'breakfast',
        'brunch': 'breakfast',
        'lunch': 'lunch',
        'afternoon': 'lunch',
        'dinner': 'dinner',
        'evening': 'dinner',
        'night': 'dinner',
        'late night': 'dinner',
        'snack': 'snack',
        'snacks': 'snack'
    };
    
    return mealTimeMap[mealTimeLower] || mealTime;
}

/**
 * Disambiguate intent when confidence is low
 * @param {Object} result - Parse result
 * @param {Object} context - User context
 * @returns {string} - Disambiguated intent
 */
function disambiguateIntent(result, context) {
    const slots = result.slots || {};
    
    // Check for food indicators
    if (slots.item) {
        const itemLower = slots.item.toLowerCase();
        const foodKeywords = ['salad', 'sandwich', 'pizza', 'pasta', 'rice', 'bread', 'cereal', 'oatmeal', 'soup', 'burger', 'taco', 'burrito', 'fruit', 'vegetable', 'meat', 'fish', 'chicken', 'beef', 'egg', 'cheese', 'yogurt'];
        
        for (const keyword of foodKeywords) {
            if (itemLower.includes(keyword)) {
                return 'food';
            }
        }
    }
    
    // Check for drink indicators
    if (slots.item) {
        const itemLower = slots.item.toLowerCase();
        const drinkKeywords = ['water', 'coffee', 'tea', 'juice', 'soda', 'beer', 'wine', 'smoothie', 'milk', 'cream'];
        
        for (const keyword of drinkKeywords) {
            if (itemLower.includes(keyword)) {
                return 'drink';
            }
        }
    }
    
    // Check for symptom indicators
    if (slots.symptom_type) {
        const symptomKeywords = ['pain', 'ache', 'burning', 'cramping', 'nausea', 'bloating', 'gas', 'reflux', 'heartburn'];
        
        for (const keyword of symptomKeywords) {
            if (slots.symptom_type.toLowerCase().includes(keyword)) {
                return 'symptom';
            }
        }
    }
    
    // Check for BM indicators
    if (slots.item) {
        const itemLower = slots.item.toLowerCase();
        const bmKeywords = ['bm', 'bowel movement', 'poop', 'poo', 'stool', 'bristol'];
        
        for (const keyword of bmKeywords) {
            if (itemLower.includes(keyword)) {
                return 'bm';
            }
        }
    }
    
    // Default to other if no clear intent
    return 'other';
}

/**
 * Resolve conflicts between multiple parse results
 * @param {Array} results - Array of parse results
 * @param {Object} context - User context
 * @returns {Object} - Best result
 */
function resolveConflicts(results, context) {
    if (!results || results.length === 0) {
        return null;
    }
    
    if (results.length === 1) {
        return results[0];
    }
    
    // Sort by confidence
    const sorted = results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    
    // Check for ties
    const topConfidence = sorted[0].confidence || 0;
    const tied = sorted.filter(r => (r.confidence || 0) === topConfidence);
    
    if (tied.length === 1) {
        return tied[0];
    }
    
    // Resolve ties using context
    return resolveTie(tied, context);
}

/**
 * Resolve ties between results with same confidence
 * @param {Array} tied - Tied results
 * @param {Object} context - User context
 * @returns {Object} - Best result
 */
function resolveTie(tied, context) {
    // Prefer results with more complete slots
    const withSlots = tied.filter(r => r.slots && Object.keys(r.slots).length > 0);
    if (withSlots.length > 0) {
        return withSlots[0];
    }
    
    // Prefer results with higher intent priority
    const intentPriority = {
        'food': 10,
        'drink': 9,
        'symptom': 8,
        'reflux': 7,
        'bm': 6,
        'mood': 5,
        'checkin': 4,
        'other': 1
    };
    
    const prioritized = tied.sort((a, b) => 
        (intentPriority[b.intent] || 0) - (intentPriority[a.intent] || 0)
    );
    
    return prioritized[0];
}

module.exports = {
    disambiguate,
    disambiguateItemType,
    disambiguateSeverity,
    disambiguateMealTime,
    disambiguateIntent,
    resolveConflicts,
    resolveTie
};
