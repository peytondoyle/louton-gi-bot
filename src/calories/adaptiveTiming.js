/**
 * Adaptive Reminder Timing
 * Learns user's meal patterns and auto-adjusts reminder timing
 */

const time = require('../utils/time');

/**
 * Analyze meal timing patterns from user's food logs
 * @param {Array} foodEntries - Array of food entries with timestamps
 * @returns {Object} - Learned meal windows and timing patterns
 */
function analyzeMealPatterns(foodEntries) {
    const patterns = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: []
    };
    
    // Group entries by meal type and extract times
    for (const entry of foodEntries) {
        const timestamp = new Date(entry.Timestamp);
        const hour = timestamp.getHours();
        const mealType = entry.Meal_Type || inferMealType(hour);
        
        if (patterns[mealType]) {
            patterns[mealType].push({
                timestamp,
                hour,
                minute: timestamp.getMinutes(),
                timeOfDay: timestamp.getTime()
            });
        }
    }
    
    // Calculate median times for each meal
    const learnedWindows = {};
    for (const [mealType, times] of Object.entries(patterns)) {
        if (times.length >= 3) { // Need at least 3 data points
            const sortedTimes = times.map(t => t.timeOfDay).sort((a, b) => a - b);
            const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
            const medianDate = new Date(medianTime);
            
            learnedWindows[mealType] = {
                medianHour: medianDate.getHours(),
                medianMinute: medianDate.getMinutes(),
                sampleSize: times.length,
                confidence: Math.min(times.length / 7, 1.0), // Max confidence at 7+ samples
                lastUpdated: new Date().toISOString()
            };
        }
    }
    
    return learnedWindows;
}

/**
 * Infer meal type from hour of day
 * @param {number} hour - Hour of day (0-23)
 * @returns {string} - Inferred meal type
 */
function inferMealType(hour) {
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 15) return 'lunch';
    if (hour >= 15 && hour < 22) return 'dinner';
    return 'snack';
}

/**
 * Calculate optimal reminder timing for a meal
 * @param {Object} learnedWindows - Learned meal patterns
 * @param {string} mealType - Type of meal
 * @param {Date} actualMealTime - When the meal actually occurred
 * @returns {Object} - Optimal reminder timing
 */
function calculateOptimalTiming(learnedWindows, mealType, actualMealTime) {
    const learned = learnedWindows[mealType];
    
    if (!learned || learned.confidence < 0.3) {
        // Fall back to default timing
        return {
            delayMinutes: mealType === 'dinner' ? 45 : 30,
            source: 'default',
            confidence: 0
        };
    }
    
    // Check if today's meal time is an outlier
    const todayHour = actualMealTime.getHours();
    const todayMinute = actualMealTime.getMinutes();
    const todayTimeOfDay = todayHour * 60 + todayMinute;
    const learnedTimeOfDay = learned.medianHour * 60 + learned.medianMinute;
    
    const timeDiff = Math.abs(todayTimeOfDay - learnedTimeOfDay);
    const isOutlier = timeDiff > 60; // More than 1 hour from learned pattern
    
    if (isOutlier) {
        // Use default timing for outliers
        return {
            delayMinutes: mealType === 'dinner' ? 45 : 30,
            source: 'default_outlier',
            confidence: 0
        };
    }
    
    // Use learned timing with confidence-based adjustment
    let delayMinutes = mealType === 'dinner' ? 45 : 30;
    
    // Adjust based on learned patterns
    if (learned.confidence > 0.7) {
        // High confidence - use learned timing
        delayMinutes = mealType === 'dinner' ? 60 : 30;
    } else if (learned.confidence > 0.4) {
        // Medium confidence - slight adjustment
        delayMinutes = mealType === 'dinner' ? 45 : 30;
    }
    
    return {
        delayMinutes,
        source: 'learned',
        confidence: learned.confidence,
        learnedTime: `${learned.medianHour}:${learned.medianMinute.toString().padStart(2, '0')}`
    };
}

/**
 * Update learned patterns with new meal data
 * @param {Object} currentPatterns - Current learned patterns
 * @param {Object} newMeal - New meal data
 * @returns {Object} - Updated patterns
 */
function updateLearnedPatterns(currentPatterns, newMeal) {
    const mealType = newMeal.mealType;
    const timestamp = new Date(newMeal.timestamp);
    
    if (!currentPatterns[mealType]) {
        currentPatterns[mealType] = {
            times: [],
            lastUpdated: new Date().toISOString()
        };
    }
    
    // Add new time to the pattern
    currentPatterns[mealType].times.push({
        timestamp,
        hour: timestamp.getHours(),
        minute: timestamp.getMinutes(),
        timeOfDay: timestamp.getTime()
    });
    
    // Keep only last 14 days of data
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    
    currentPatterns[mealType].times = currentPatterns[mealType].times.filter(t => 
        t.timestamp > cutoff
    );
    
    // Recalculate median
    if (currentPatterns[mealType].times.length >= 3) {
        const sortedTimes = currentPatterns[mealType].times
            .map(t => t.timeOfDay)
            .sort((a, b) => a - b);
        
        const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
        const medianDate = new Date(medianTime);
        
        currentPatterns[mealType].medianHour = medianDate.getHours();
        currentPatterns[mealType].medianMinute = medianDate.getMinutes();
        currentPatterns[mealType].sampleSize = currentPatterns[mealType].times.length;
        currentPatterns[mealType].confidence = Math.min(currentPatterns[mealType].times.length / 7, 1.0);
    }
    
    currentPatterns[mealType].lastUpdated = new Date().toISOString();
    
    return currentPatterns;
}

/**
 * Generate timing explanation for user
 * @param {Object} timing - Timing calculation result
 * @returns {string} - User-friendly explanation
 */
function generateTimingExplanation(timing) {
    if (timing.source === 'learned') {
        return `Timing auto-tuned from your routine (learned from ${timing.learnedTime} pattern)`;
    } else if (timing.source === 'default_outlier') {
        return `Using standard timing (today's meal time is unusual)`;
    } else {
        return `Using standard timing (still learning your patterns)`;
    }
}

module.exports = {
    analyzeMealPatterns,
    calculateOptimalTiming,
    updateLearnedPatterns,
    generateTimingExplanation
};
