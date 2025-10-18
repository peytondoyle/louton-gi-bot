// Natural Language Processing Handler for Louton GI Bot
const moment = require('moment-timezone');

// Keywords and patterns for different types of entries
const PATTERNS = {
    drinks: {
        keywords: ['had', 'drank', 'drinking', 'sipped', 'chugged', 'finished'],
        items: {
            chai: ['chai', 'chai latte', 'dirty chai', 'iced chai'],
            coffee: ['coffee', 'espresso', 'latte', 'cappuccino', 'americano'],
            refresher: ['refresher', 'starbucks refresher', 'pink drink'],
            water: ['water', 'h2o', 'aqua'],
            tea: ['tea', 'green tea', 'herbal tea', 'chamomile', 'ginger tea'],
            alcohol: ['beer', 'wine', 'alcohol', 'drink', 'cocktail', 'whiskey', 'vodka'],
            soda: ['soda', 'coke', 'pepsi', 'sprite', 'pop', 'soft drink'],
            juice: ['juice', 'oj', 'orange juice', 'apple juice'],
        }
    },

    food: {
        keywords: ['ate', 'eaten', 'had', 'lunch', 'dinner', 'breakfast', 'snack', 'meal'],
        triggers: ['spicy', 'dairy', 'cheese', 'milk', 'gluten', 'bread', 'fried', 'citrus', 'tomato', 'pizza', 'pasta'],
        safe: ['rice', 'chicken', 'oatmeal', 'banana', 'toast', 'eggs', 'soup']
    },

    symptoms: {
        reflux: ['reflux', 'heartburn', 'acid', 'burning', 'gerd'],
        stomach: ['stomach', 'tummy', 'belly', 'abdomen', 'gut'],
        pain: ['hurt', 'hurts', 'ache', 'pain', 'cramp', 'cramping'],
        bloating: ['bloated', 'bloating', 'full', 'distended', 'swollen'],
        nausea: ['nausea', 'nauseous', 'queasy', 'sick'],
        bm: ['bm', 'bowel', 'bathroom', 'constipated', 'diarrhea']
    },

    positive: {
        keywords: ['good', 'better', 'great', 'fine', 'okay', 'well', 'improved', 'no symptoms', 'no issues'],
        phrases: ['feeling good', 'feeling better', 'doing well', 'no problems', 'all clear']
    },

    severity: {
        mild: ['mild', 'slight', 'little', 'minor', 'small'],
        moderate: ['moderate', 'medium', 'some', 'moderate'],
        severe: ['severe', 'bad', 'terrible', 'awful', 'worst', 'horrible', 'intense']
    }
};

// Categories for automatic classification
const CATEGORIES = {
    TRIGGER_FOOD: 'Trigger Food',
    SAFE_FOOD: 'Safe Food',
    TRIGGER_DRINK: 'Trigger Drink',
    SAFE_DRINK: 'Safe Drink',
    SYMPTOM: 'Symptom',
    IMPROVEMENT: 'Improvement',
    NEUTRAL: 'Neutral',
    BM: 'Bowel Movement'
};

class NLPHandler {
    /**
     * Analyze a message and determine its intent and category
     * @param {string} message - The user's message
     * @returns {Object} Analysis result with type, value, severity, category, and suggestions
     */
    static analyzeMessage(message) {
        const lowerMessage = message.toLowerCase();

        // Check for positive/improvement messages first
        const positiveCheck = this.checkPositive(lowerMessage);
        if (positiveCheck) {
            return positiveCheck;
        }

        // Check for symptoms
        const symptomCheck = this.checkSymptoms(lowerMessage);
        if (symptomCheck) {
            return symptomCheck;
        }

        // Check for drinks
        const drinkCheck = this.checkDrinks(lowerMessage);
        if (drinkCheck) {
            return drinkCheck;
        }

        // Check for food
        const foodCheck = this.checkFood(lowerMessage);
        if (foodCheck) {
            return foodCheck;
        }

        // Default - couldn't understand
        return null;
    }

    /**
     * Check if message indicates positive status/improvement
     */
    static checkPositive(message) {
        for (const phrase of PATTERNS.positive.phrases) {
            if (message.includes(phrase)) {
                return {
                    type: 'positive',
                    value: 'No symptoms - feeling good',
                    category: CATEGORIES.IMPROVEMENT,
                    confidence: 'high',
                    response: "That's wonderful to hear! Keep up whatever you're doing! 🌟"
                };
            }
        }

        // Check for combinations like "stomach is good" or "no reflux"
        if (message.includes('no') && this.containsAny(message, Object.keys(PATTERNS.symptoms).flatMap(k => PATTERNS.symptoms[k]))) {
            return {
                type: 'positive',
                value: 'No symptoms reported',
                category: CATEGORIES.IMPROVEMENT,
                confidence: 'medium',
                response: "Great to hear you're symptom-free! Keep tracking! 💚"
            };
        }

        return null;
    }

    /**
     * Check if message describes symptoms
     */
    static checkSymptoms(message) {
        // Check for reflux specifically
        if (this.containsAny(message, PATTERNS.symptoms.reflux)) {
            const severity = this.extractSeverity(message);
            return {
                type: 'symptom',
                subtype: 'reflux',
                value: 'reflux',
                severity: severity,
                category: CATEGORIES.SYMPTOM,
                confidence: 'high',
                needsSeverity: !severity,
                response: severity ?
                    `I've logged your reflux as ${severity}. Take care of yourself! 💙` :
                    'I detected reflux. How severe is it? (Reply with: mild, moderate, or severe)'
            };
        }

        // Check for stomach pain
        if (this.containsAny(message, PATTERNS.symptoms.stomach) && this.containsAny(message, PATTERNS.symptoms.pain)) {
            const severity = this.extractSeverity(message);
            return {
                type: 'symptom',
                subtype: 'stomach pain',
                value: 'stomach pain',
                severity: severity,
                category: CATEGORIES.SYMPTOM,
                confidence: 'high',
                needsSeverity: !severity,
                response: severity ?
                    `I've logged your stomach pain as ${severity}. Stay hydrated! 💧` :
                    'I detected stomach pain. How severe is it? (Reply with: mild, moderate, or severe)'
            };
        }

        // Check for bloating
        if (this.containsAny(message, PATTERNS.symptoms.bloating)) {
            const severity = this.extractSeverity(message);
            return {
                type: 'symptom',
                subtype: 'bloating',
                value: 'bloating',
                severity: severity,
                category: CATEGORIES.SYMPTOM,
                confidence: 'high',
                needsSeverity: !severity,
                response: `I've logged your bloating${severity ? ' as ' + severity : ''}. Consider some gentle movement. 🚶`
            };
        }

        // Check for BM issues
        if (this.containsAny(message, PATTERNS.symptoms.bm)) {
            return {
                type: 'bm',
                value: message,
                category: CATEGORIES.BM,
                confidence: 'medium',
                response: "I've logged your bowel movement note. Staying regular is important! 📝"
            };
        }

        // Check for nausea
        if (this.containsAny(message, PATTERNS.symptoms.nausea)) {
            const severity = this.extractSeverity(message);
            return {
                type: 'symptom',
                subtype: 'nausea',
                value: 'nausea',
                severity: severity,
                category: CATEGORIES.SYMPTOM,
                confidence: 'high',
                needsSeverity: !severity,
                response: `I've logged your nausea${severity ? ' as ' + severity : ''}. Try some ginger tea if you can. 🍵`
            };
        }

        return null;
    }

    /**
     * Check if message describes drinks
     */
    static checkDrinks(message) {
        // First check if it contains drink keywords
        const hasDrinkContext = this.containsAny(message, PATTERNS.drinks.keywords) ||
                               message.includes('just') ||
                               message.includes('having');

        // Check each drink type
        for (const [drinkType, keywords] of Object.entries(PATTERNS.drinks.items)) {
            if (this.containsAny(message, keywords)) {
                // Determine if it's a trigger or safe drink
                const isTrigger = ['coffee', 'refresher', 'alcohol', 'soda', 'juice'].includes(drinkType);
                const category = isTrigger ? CATEGORIES.TRIGGER_DRINK : CATEGORIES.SAFE_DRINK;

                // Extract any additional context (like "with oat milk")
                let drinkDetails = drinkType;
                if (message.includes('with')) {
                    const withIndex = message.indexOf('with');
                    const addition = message.substring(withIndex).split(/[.,!?]/)[0];
                    drinkDetails += ' ' + addition;
                }

                return {
                    type: 'drink',
                    value: drinkDetails,
                    category: category,
                    confidence: hasDrinkContext ? 'high' : 'medium',
                    isTrigger: isTrigger,
                    response: isTrigger ?
                        `⚠️ Logged ${drinkDetails}. Monitor how you feel after this trigger drink.` :
                        `💪 Great choice with ${drinkDetails}! Your gut will thank you!`
                };
            }
        }

        return null;
    }

    /**
     * Check if message describes food
     */
    static checkFood(message) {
        const hasFoodContext = this.containsAny(message, PATTERNS.food.keywords);

        // Check for trigger foods
        for (const trigger of PATTERNS.food.triggers) {
            if (message.includes(trigger)) {
                return {
                    type: 'food',
                    value: this.extractFoodDescription(message, trigger),
                    category: CATEGORIES.TRIGGER_FOOD,
                    confidence: hasFoodContext ? 'high' : 'medium',
                    isTrigger: true,
                    response: `⚠️ Logged ${trigger}. This is a known trigger food - track any symptoms carefully.`
                };
            }
        }

        // Check for safe foods
        for (const safe of PATTERNS.food.safe) {
            if (message.includes(safe)) {
                return {
                    type: 'food',
                    value: this.extractFoodDescription(message, safe),
                    category: CATEGORIES.SAFE_FOOD,
                    confidence: hasFoodContext ? 'high' : 'medium',
                    isTrigger: false,
                    response: `✅ Logged ${safe}. Good choice - this is generally gut-friendly!`
                };
            }
        }

        // Generic food with context
        if (hasFoodContext) {
            const foodWords = message.split(' ').slice(1).join(' '); // Remove the first word (ate/had/etc)
            return {
                type: 'food',
                value: foodWords || message,
                category: CATEGORIES.NEUTRAL,
                confidence: 'low',
                response: `📝 Logged: ${foodWords || message}`
            };
        }

        return null;
    }

    /**
     * Extract severity from message
     */
    static extractSeverity(message) {
        for (const [level, keywords] of Object.entries(PATTERNS.severity)) {
            if (this.containsAny(message, keywords)) {
                return level;
            }
        }
        return null;
    }

    /**
     * Extract food description from message
     */
    static extractFoodDescription(message, foodItem) {
        // Try to get more context around the food item
        const words = message.split(' ');
        const foodIndex = words.findIndex(w => w.includes(foodItem));

        if (foodIndex > 0 && foodIndex < words.length - 1) {
            // Get word before and after for context
            return words.slice(Math.max(0, foodIndex - 1), Math.min(words.length, foodIndex + 2)).join(' ');
        }

        return foodItem;
    }

    /**
     * Check if message contains any of the keywords
     */
    static containsAny(message, keywords) {
        return keywords.some(keyword => message.includes(keyword));
    }

    /**
     * Get category for a specific item
     */
    static categorizeItem(type, value) {
        const lowerValue = value.toLowerCase();

        if (type === 'drink') {
            const triggers = ['refresher', 'coffee', 'alcohol', 'soda', 'energy', 'juice'];
            return triggers.some(t => lowerValue.includes(t)) ?
                CATEGORIES.TRIGGER_DRINK : CATEGORIES.SAFE_DRINK;
        }

        if (type === 'food') {
            const triggers = PATTERNS.food.triggers;
            return triggers.some(t => lowerValue.includes(t)) ?
                CATEGORIES.TRIGGER_FOOD : CATEGORIES.SAFE_FOOD;
        }

        if (type === 'symptom' || type === 'reflux') {
            return CATEGORIES.SYMPTOM;
        }

        if (type === 'bm') {
            return CATEGORIES.BM;
        }

        if (type === 'positive') {
            return CATEGORIES.IMPROVEMENT;
        }

        return CATEGORIES.NEUTRAL;
    }
}

module.exports = NLPHandler;