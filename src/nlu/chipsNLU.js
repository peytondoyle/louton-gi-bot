/**
 * NLU V2 Secondary Intent Detection
 * Detects secondary intents and shows interactive chips for additional actions
 */

const { extractSecondaryIntents } = require('./postprocess');
const { disambiguate } = require('./disambiguate');

/**
 * Analyze text for secondary intents
 * @param {string} text - Input text
 * @param {Object} context - User context
 * @returns {Object} - Secondary intent analysis
 */
function analyzeSecondaryIntents(text, context = {}) {
    const analysis = {
        primary: null,
        secondary: [],
        chips: [],
        confidence: 0
    };
    
    // Extract primary intent first
    const primaryResult = extractPrimaryIntent(text, context);
    analysis.primary = primaryResult;
    
    // Look for secondary intents
    const secondaryIntents = extractSecondaryIntents(text, context);
    analysis.secondary = secondaryIntents;
    
    // Generate chips for secondary intents
    if (secondaryIntents.length > 0) {
        analysis.chips = generateSecondaryChips(secondaryIntents, context);
    }
    
    // Calculate overall confidence
    analysis.confidence = calculateSecondaryConfidence(primaryResult, secondaryIntents);
    
    return analysis;
}

/**
 * Extract primary intent from text
 * @param {string} text - Input text
 * @param {Object} context - User context
 * @returns {Object} - Primary intent result
 */
function extractPrimaryIntent(text, context) {
    // This would typically call the main NLU system
    // For now, return a mock result
    const textLower = text.toLowerCase();
    
    if (textLower.includes('had') || textLower.includes('ate') || textLower.includes('food')) {
        return {
            intent: 'food',
            item: extractMainItem(text),
            confidence: 0.8
        };
    }
    
    if (textLower.includes('drank') || textLower.includes('coffee') || textLower.includes('tea')) {
        return {
            intent: 'drink',
            item: extractMainItem(text),
            confidence: 0.8
        };
    }
    
    if (textLower.includes('pain') || textLower.includes('ache') || textLower.includes('symptom')) {
        return {
            intent: 'symptom',
            symptom_type: extractSymptomType(text),
            confidence: 0.8
        };
    }
    
    return {
        intent: 'other',
        confidence: 0.5
    };
}

/**
 * Extract main item from text
 * @param {string} text - Input text
 * @returns {string} - Main item
 */
function extractMainItem(text) {
    // Simple extraction - in real implementation, this would be more sophisticated
    const textLower = text.toLowerCase();
    
    // Remove common prefixes
    let item = textLower
        .replace(/^(i\s+)?(had|ate|drank|had\s+a|had\s+some)\s+/i, '')
        .replace(/\s+(for|this|today|yesterday).*$/, '')
        .trim();
    
    // Extract before "with" if present
    const withIndex = item.indexOf(' with ');
    if (withIndex > 0) {
        item = item.substring(0, withIndex);
    }
    
    return item;
}

/**
 * Extract symptom type from text
 * @param {string} text - Input text
 * @returns {string} - Symptom type
 */
function extractSymptomType(text) {
    const textLower = text.toLowerCase();
    
    const symptomMap = {
        'stomach pain': 'stomach pain',
        'stomach ache': 'stomach pain',
        'belly ache': 'stomach pain',
        'tummy ache': 'stomach pain',
        'heartburn': 'heartburn',
        'reflux': 'reflux',
        'acid reflux': 'reflux',
        'bloating': 'bloating',
        'bloated': 'bloating',
        'gas': 'gas',
        'gassy': 'gas',
        'nausea': 'nausea',
        'nauseous': 'nausea',
        'cramps': 'cramps',
        'cramping': 'cramps'
    };
    
    for (const [keyword, symptom] of Object.entries(symptomMap)) {
        if (textLower.includes(keyword)) {
            return symptom;
        }
    }
    
    return 'symptom';
}

/**
 * Generate secondary chips for detected intents
 * @param {Array} secondaryIntents - Array of secondary intents
 * @param {Object} context - User context
 * @returns {Array} - Array of chip objects
 */
function generateSecondaryChips(secondaryIntents, context) {
    const chips = [];
    
    for (const intent of secondaryIntents) {
        const chip = createSecondaryChip(intent, context);
        if (chip) {
            chips.push(chip);
        }
    }
    
    return chips;
}

/**
 * Create a secondary chip for an intent
 * @param {Object} intent - Secondary intent
 * @param {Object} context - User context
 * @returns {Object} - Chip object
 */
function createSecondaryChip(intent, context) {
    const baseChip = {
        id: `secondary_${intent.intent}_${Date.now()}`,
        intent: intent.intent,
        confidence: intent.confidence,
        timestamp: Date.now()
    };
    
    switch (intent.intent) {
        case 'drink':
            return {
                ...baseChip,
                type: 'drink_chip',
                title: 'Also log drink?',
                description: `Detected: ${intent.item}`,
                actions: [
                    { label: 'Yes', action: 'log_drink', data: { item: intent.item } },
                    { label: 'No', action: 'dismiss' }
                ]
            };
            
        case 'symptom':
            return {
                ...baseChip,
                type: 'symptom_chip',
                title: 'Also log symptom?',
                description: `Detected: ${intent.symptom_type}`,
                actions: [
                    { label: 'Yes', action: 'log_symptom', data: { symptom_type: intent.symptom_type } },
                    { label: 'No', action: 'dismiss' }
                ]
            };
            
        case 'food':
            return {
                ...baseChip,
                type: 'food_chip',
                title: 'Also log food?',
                description: `Detected: ${intent.item}`,
                actions: [
                    { label: 'Yes', action: 'log_food', data: { item: intent.item } },
                    { label: 'No', action: 'dismiss' }
                ]
            };
            
        default:
            return null;
    }
}

/**
 * Calculate confidence for secondary intent analysis
 * @param {Object} primary - Primary intent result
 * @param {Array} secondary - Secondary intents
 * @returns {number} - Overall confidence
 */
function calculateSecondaryConfidence(primary, secondary) {
    if (!primary || !secondary || secondary.length === 0) {
        return primary ? primary.confidence : 0;
    }
    
    // Weight primary intent more heavily
    const primaryWeight = 0.7;
    const secondaryWeight = 0.3;
    
    const primaryConfidence = primary.confidence || 0;
    const secondaryConfidence = secondary.reduce((sum, intent) => sum + (intent.confidence || 0), 0) / secondary.length;
    
    return Math.min(1, primaryConfidence * primaryWeight + secondaryConfidence * secondaryWeight);
}

/**
 * Process secondary intent chip interaction
 * @param {string} chipId - Chip ID
 * @param {string} action - Action taken
 * @param {Object} data - Action data
 * @param {Object} context - User context
 * @returns {Object} - Processing result
 */
function processSecondaryChip(chipId, action, data, context) {
    const result = {
        success: false,
        message: '',
        followUp: null
    };
    
    switch (action) {
        case 'log_drink':
            result.success = true;
            result.message = `✅ Logged drink: ${data.item}`;
            result.followUp = {
                type: 'calorie_reminder',
                item: data.item,
                delay: 30000 // 30 seconds
            };
            break;
            
        case 'log_symptom':
            result.success = true;
            result.message = `✅ Logged symptom: ${data.symptom_type}`;
            result.followUp = {
                type: 'symptom_followup',
                symptom_type: data.symptom_type,
                delay: 90000 // 90 seconds
            };
            break;
            
        case 'log_food':
            result.success = true;
            result.message = `✅ Logged food: ${data.item}`;
            result.followUp = {
                type: 'calorie_reminder',
                item: data.item,
                delay: 30000 // 30 seconds
            };
            break;
            
        case 'dismiss':
            result.success = true;
            result.message = '👍 Got it, skipping secondary intent';
            break;
            
        default:
            result.success = false;
            result.message = '❌ Unknown action';
    }
    
    return result;
}

/**
 * Generate contextual chips based on user history
 * @param {Object} context - User context
 * @returns {Array} - Array of contextual chips
 */
function generateContextualChips(context) {
    const chips = [];
    
    // Recent items chip
    if (context.recentItems && context.recentItems.length > 0) {
        const recentItem = context.recentItems[0];
        chips.push({
            id: `contextual_recent_${Date.now()}`,
            type: 'contextual_chip',
            title: 'Same as before?',
            description: `Log ${recentItem} again?`,
            actions: [
                { label: 'Yes', action: 'log_same', data: { item: recentItem } },
                { label: 'No', action: 'dismiss' }
            ]
        });
    }
    
    // Time-based chips
    const currentHour = new Date().getHours();
    if (currentHour >= 6 && currentHour < 11) {
        chips.push({
            id: `contextual_breakfast_${Date.now()}`,
            type: 'contextual_chip',
            title: 'Breakfast time',
            description: 'Log your morning meal?',
            actions: [
                { label: 'Yes', action: 'log_breakfast', data: { meal_time: 'breakfast' } },
                { label: 'Later', action: 'dismiss' }
            ]
        });
    }
    
    // Symptom follow-up chip
    if (context.recentSymptoms && context.recentSymptoms.length > 0) {
        const recentSymptom = context.recentSymptoms[0];
        chips.push({
            id: `contextual_symptom_${Date.now()}`,
            type: 'contextual_chip',
            title: 'How are you feeling?',
            description: `Still experiencing ${recentSymptom}?`,
            actions: [
                { label: 'Better', action: 'symptom_improved', data: { symptom: recentSymptom } },
                { label: 'Same', action: 'symptom_same', data: { symptom: recentSymptom } },
                { label: 'Worse', action: 'symptom_worse', data: { symptom: recentSymptom } }
            ]
        });
    }
    
    return chips;
}

/**
 * Analyze text for potential secondary intents using advanced patterns
 * @param {string} text - Input text
 * @param {Object} context - User context
 * @returns {Array} - Array of potential secondary intents
 */
function detectAdvancedSecondaryIntents(text, context) {
    const secondaryIntents = [];
    const textLower = text.toLowerCase();
    
    // Pattern: "had X and Y"
    const andPattern = /had\s+([^,]+?)\s+and\s+([^,]+?)(?:\s+for\s+\w+)?$/i;
    const andMatch = text.match(andPattern);
    if (andMatch) {
        const firstItem = andMatch[1].trim();
        const secondItem = andMatch[2].trim();
        
        // Determine which is primary and which is secondary
        const primary = determinePrimaryItem(firstItem, secondItem, context);
        const secondary = primary === firstItem ? secondItem : firstItem;
        
        secondaryIntents.push({
            intent: classifyItem(secondary),
            item: secondary,
            confidence: 0.8
        });
    }
    
    // Pattern: "X with Y"
    const withPattern = /([^,]+?)\s+with\s+([^,]+?)(?:\s+for\s+\w+)?$/i;
    const withMatch = text.match(withPattern);
    if (withMatch) {
        const mainItem = withMatch[1].trim();
        const sideItem = withMatch[2].trim();
        
        // Check if side item could be a secondary intent
        if (isSecondaryIntent(sideItem)) {
            secondaryIntents.push({
                intent: classifyItem(sideItem),
                item: sideItem,
                confidence: 0.7
            });
        }
    }
    
    // Pattern: "X, Y, and Z"
    const listPattern = /([^,]+?),\s*([^,]+?),\s*and\s+([^,]+?)(?:\s+for\s+\w+)?$/i;
    const listMatch = text.match(listPattern);
    if (listMatch) {
        const items = [listMatch[1].trim(), listMatch[2].trim(), listMatch[3].trim()];
        
        // Find potential secondary items
        for (let i = 1; i < items.length; i++) {
            if (isSecondaryIntent(items[i])) {
                secondaryIntents.push({
                    intent: classifyItem(items[i]),
                    item: items[i],
                    confidence: 0.6
                });
            }
        }
    }
    
    return secondaryIntents;
}

/**
 * Determine which item is primary based on context
 * @param {string} item1 - First item
 * @param {string} item2 - Second item
 * @param {Object} context - User context
 * @returns {string} - Primary item
 */
function determinePrimaryItem(item1, item2, context) {
    // Simple heuristic: longer item is usually primary
    if (item1.length > item2.length) {
        return item1;
    }
    return item2;
}

/**
 * Classify item as intent type
 * @param {string} item - Item to classify
 * @returns {string} - Intent type
 */
function classifyItem(item) {
    const itemLower = item.toLowerCase();
    
    if (itemLower.includes('coffee') || itemLower.includes('tea') || itemLower.includes('water') || 
        itemLower.includes('juice') || itemLower.includes('soda') || itemLower.includes('milk')) {
        return 'drink';
    }
    
    if (itemLower.includes('pain') || itemLower.includes('ache') || itemLower.includes('burning') ||
        itemLower.includes('bloating') || itemLower.includes('gas') || itemLower.includes('nausea')) {
        return 'symptom';
    }
    
    return 'food';
}

/**
 * Check if item could be a secondary intent
 * @param {string} item - Item to check
 * @returns {boolean} - Whether item could be secondary
 */
function isSecondaryIntent(item) {
    const itemLower = item.toLowerCase();
    
    // Common secondary intent keywords
    const secondaryKeywords = [
        'coffee', 'tea', 'water', 'juice', 'soda', 'milk',
        'pain', 'ache', 'burning', 'bloating', 'gas', 'nausea',
        'reflux', 'heartburn', 'cramps'
    ];
    
    return secondaryKeywords.some(keyword => itemLower.includes(keyword));
}

module.exports = {
    analyzeSecondaryIntents,
    generateSecondaryChips,
    processSecondaryChip,
    generateContextualChips,
    detectAdvancedSecondaryIntents
};
