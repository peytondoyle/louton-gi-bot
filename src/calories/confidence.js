/**
 * Calorie Estimation Confidence & Feedback System
 * Tracks estimate quality and learns from user feedback
 */

const LUT = require('./lookup.json');

/**
 * Calculate confidence level for a calorie estimate
 * @param {Object} estimate - The calorie estimate
 * @param {string} item - Food item name
 * @param {string} quantity - Quantity with units
 * @returns {string} - Confidence level: 'low', 'med', 'high'
 */
function calculateEstimateConfidence(estimate, item, quantity) {
    let confidence = 'low';
    
    // Check LUT match quality
    const key = item.toLowerCase().trim();
    const base = LUT[key];
    
    if (base) {
        confidence = 'high'; // Direct LUT match
        
        // Check if quantity parsing was successful
        if (quantity && estimate.note && estimate.note.includes('base')) {
            confidence = 'high';
        } else if (quantity) {
            confidence = 'med'; // Quantity provided but parsing uncertain
        }
    } else {
        // Check for partial matches
        const partialMatch = Object.keys(LUT).find(k => 
            k.includes(key) || key.includes(k)
        );
        
        if (partialMatch) {
            confidence = 'med'; // Partial match found
        } else {
            confidence = 'low'; // No match, using fallback
        }
    }
    
    // Adjust based on quantity detection
    if (quantity && quantity.match(/\d+/)) {
        if (confidence === 'low') confidence = 'med';
    }
    
    return confidence;
}

/**
 * Update LUT entry based on user feedback
 * @param {string} item - Food item name
 * @param {number} userCalories - User-provided calorie count
 * @param {string} quantity - Quantity with units
 * @param {Object} currentLUT - Current lookup table
 * @returns {Object} - Updated LUT entry
 */
function updateLUTFromFeedback(item, userCalories, quantity, currentLUT) {
    const key = item.toLowerCase().trim();
    const existing = currentLUT[key] || {};
    
    // Parse quantity to get per-unit value
    let perUnitCalories = userCalories;
    let perUnit = 'serving';
    
    if (quantity) {
        const match = quantity.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
        if (match) {
            const [, qty, unit] = match;
            const quantityNum = parseFloat(qty);
            perUnitCalories = userCalories / quantityNum;
            perUnit = unit.toLowerCase();
        }
    }
    
    // Create or update entry
    const newEntry = {
        per: perUnit,
        kcal: Math.round(perUnitCalories),
        protein: existing.protein || 0,
        carbs: existing.carbs || 0,
        fat: existing.fat || 0,
        // Track feedback
        accept_count: (existing.accept_count || 0) + 1,
        edit_count: existing.edit_count || 0,
        last_updated: new Date().toISOString()
    };
    
    return newEntry;
}

/**
 * Record user feedback on estimate
 * @param {string} item - Food item name
 * @param {string} feedback - 'accepted' or 'edited'
 * @param {number} [userCalories] - User-provided calories (if edited)
 * @param {string} [quantity] - Quantity with units
 * @returns {Object} - Feedback record
 */
function recordEstimateFeedback(item, feedback, userCalories, quantity) {
    const feedbackRecord = {
        item: item.toLowerCase().trim(),
        feedback,
        timestamp: new Date().toISOString(),
        userCalories,
        quantity
    };
    
    // Log feedback for learning
    console.log(`[CALORIE-FEEDBACK] ${feedback} for "${item}": ${userCalories || 'accepted'}`);
    
    return feedbackRecord;
}

/**
 * Generate confidence-based estimate message
 * @param {Object} estimate - Calorie estimate
 * @param {string} confidence - Confidence level
 * @param {string} item - Food item name
 * @returns {string} - User-friendly message
 */
function generateEstimateMessage(estimate, confidence, item) {
    const baseMessage = `I estimate ~${estimate.calories} kcal for "${item}"`;
    
    if (confidence === 'high') {
        return `${baseMessage} (high confidence)`;
    } else if (confidence === 'med') {
        return `${baseMessage} (rough estimate)`;
    } else {
        return `${baseMessage} (best guess - please verify)`;
    }
}

/**
 * Get LUT entry statistics
 * @param {string} item - Food item name
 * @param {Object} currentLUT - Current lookup table
 * @returns {Object} - Entry statistics
 */
function getLUTEntryStats(item, currentLUT) {
    const key = item.toLowerCase().trim();
    const entry = currentLUT[key];
    
    if (!entry) return null;
    
    const totalFeedback = (entry.accept_count || 0) + (entry.edit_count || 0);
    const acceptanceRate = totalFeedback > 0 ? (entry.accept_count || 0) / totalFeedback : 0;
    
    return {
        accept_count: entry.accept_count || 0,
        edit_count: entry.edit_count || 0,
        total_feedback: totalFeedback,
        acceptance_rate: Math.round(acceptanceRate * 100),
        last_updated: entry.last_updated
    };
}

/**
 * Identify unreliable LUT entries
 * @param {Object} currentLUT - Current lookup table
 * @returns {Array} - Array of unreliable entries
 */
function identifyUnreliableEntries(currentLUT) {
    const unreliable = [];
    
    for (const [key, entry] of Object.entries(currentLUT)) {
        const totalFeedback = (entry.accept_count || 0) + (entry.edit_count || 0);
        
        if (totalFeedback >= 3) { // Need at least 3 data points
            const acceptanceRate = (entry.accept_count || 0) / totalFeedback;
            
            if (acceptanceRate < 0.5) { // Less than 50% acceptance
                unreliable.push({
                    item: key,
                    acceptance_rate: Math.round(acceptanceRate * 100),
                    total_feedback: totalFeedback,
                    needs_review: true
                });
            }
        }
    }
    
    return unreliable;
}

module.exports = {
    calculateEstimateConfidence,
    updateLUTFromFeedback,
    recordEstimateFeedback,
    generateEstimateMessage,
    getLUTEntryStats,
    identifyUnreliableEntries
};
