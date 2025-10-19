/**
 * Core Analytics Metrics
 * Pure functions for computing insights over rows
 */

const moment = require('moment-timezone');
const { parseNotes } = require('../utils/notes');

/**
 * Sum intake calories for a specific date
 * @param {Array} rows - User rows
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {number} - Total intake in kcal
 */
function sumIntakeKcal(rows, dateStr) {
    return rows
        .filter(row => row.Date === dateStr && (row.Type === 'food' || row.Type === 'drink'))
        .reduce((sum, row) => sum + row.Calories, 0);
}

/**
 * Get burn calories for a specific date from Health map
 * @param {Map} healthMap - Health rows keyed by Date
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {number|null} - Burn calories or null if not available
 */
function getBurnForDate(healthMap, dateStr) {
    const health = healthMap.get(dateStr);
    if (!health) return null;

    // Prefer Total_kcal
    if (health.Total_kcal > 0) return health.Total_kcal;

    // Fallback to Active + Basal
    if (health.Active_kcal > 0 && health.Basal_kcal > 0) {
        return health.Active_kcal + health.Basal_kcal;
    }

    return null;
}

/**
 * Generate budget bar visualization
 * @param {number} intake - Intake calories
 * @param {number|null} burn - Burn calories (null if unavailable)
 * @param {number} goalOverride - Optional goal override
 * @returns {Object} - { pct, bar, label }
 */
function budgetBar(intake, burn, goalOverride = null) {
    const budget = goalOverride || burn;

    if (!budget) {
        return {
            pct: null,
            bar: '—',
            label: 'Intake'
        };
    }

    const pct = Math.min(intake / budget, 1.0);
    const filled = Math.round(pct * 5);
    const bar = '▮'.repeat(filled) + '▯'.repeat(5 - filled);

    return {
        pct,
        bar,
        label: 'Intake vs Burn'
    };
}

/**
 * Compute latency from meals to symptoms (0-6h window)
 * @param {Array} rows - User rows (assumed chronological)
 * @returns {Object} - { medianMinutes, samples }
 */
function computeLatencyMinutes(rows) {
    const latencies = [];

    // Sort by timestamp to ensure chronological order
    const sorted = rows.slice().sort((a, b) => {
        return new Date(a.Timestamp) - new Date(b.Timestamp);
    });

    // For each symptom/reflux, find nearest prior food/drink within 0-360 min
    for (let i = 0; i < sorted.length; i++) {
        const row = sorted[i];

        if (row.Type !== 'symptom' && row.Type !== 'reflux') continue;

        const symptomTime = new Date(row.Timestamp);

        // Look backward for meals
        for (let j = i - 1; j >= 0; j--) {
            const priorRow = sorted[j];

            if (priorRow.Type !== 'food' && priorRow.Type !== 'drink') continue;

            const mealTime = new Date(priorRow.Timestamp);
            const diffMs = symptomTime - mealTime;
            const diffMin = Math.round(diffMs / 60000);

            // Only count if within 0-360 min window
            if (diffMin >= 0 && diffMin <= 360) {
                latencies.push(diffMin);
                break; // Found nearest meal, move to next symptom
            }

            // If meal is > 6h ago, stop looking
            if (diffMin > 360) break;
        }
    }

    if (latencies.length === 0) {
        return { medianMinutes: null, samples: 0 };
    }

    // Compute median
    latencies.sort((a, b) => a - b);
    const mid = Math.floor(latencies.length / 2);
    const median = latencies.length % 2 === 0
        ? Math.round((latencies[mid - 1] + latencies[mid]) / 2)
        : latencies[mid];

    return {
        medianMinutes: median,
        samples: latencies.length
    };
}

/**
 * Compute reflux/symptom stats with 7-day moving averages
 * @param {Array} rows - User rows
 * @param {Object} options - { days: 14 }
 * @returns {Object} - Trend stats
 */
function computeRefluxStats(rows, { days = 14 } = {}) {
    const tz = process.env.TIMEZONE || 'America/Los_Angeles';
    const today = moment().tz(tz).format('YYYY-MM-DD');

    // Build daily aggregates
    const dailyStats = new Map();

    // Initialize all days in window
    for (let i = 0; i < days; i++) {
        const date = moment().tz(tz).subtract(i, 'days').format('YYYY-MM-DD');
        dailyStats.set(date, { count: 0, severities: [] });
    }

    // Populate with actual data
    rows.forEach(row => {
        if (row.Type !== 'symptom' && row.Type !== 'reflux') return;

        const date = row.Date;
        if (!dailyStats.has(date)) return;

        const stats = dailyStats.get(date);
        stats.count++;

        // Extract severity (from Severity field or Notes)
        let severity = null;
        if (row.Severity) {
            const match = row.Severity.match(/\d+/);
            if (match) severity = parseInt(match[0], 10);
        }
        if (!severity) {
            const notes = parseNotes(row.Notes);
            severity = notes.getNumber('severity');
        }
        if (severity) stats.severities.push(severity);
    });

    // Compute 7-day MA for last day and day before
    const getLast7DayMA = (endDate) => {
        const endMoment = moment(endDate, 'YYYY-MM-DD');
        let countSum = 0;
        let severitySum = 0;
        let severityCount = 0;

        for (let i = 0; i < 7; i++) {
            const date = endMoment.clone().subtract(i, 'days').format('YYYY-MM-DD');
            const stats = dailyStats.get(date);
            if (stats) {
                countSum += stats.count;
                if (stats.severities.length > 0) {
                    const avg = stats.severities.reduce((a, b) => a + b, 0) / stats.severities.length;
                    severitySum += avg;
                    severityCount++;
                }
            }
        }

        return {
            count: countSum / 7,
            severity: severityCount > 0 ? severitySum / severityCount : 0
        };
    };

    const todayMA = getLast7DayMA(today);
    const yesterdayMA = getLast7DayMA(moment(today).subtract(1, 'days').format('YYYY-MM-DD'));

    // Compute deltas
    const deltaPctCount = yesterdayMA.count > 0
        ? ((todayMA.count - yesterdayMA.count) / yesterdayMA.count) * 100
        : 0;

    const deltaPctSeverity = yesterdayMA.severity > 0
        ? ((todayMA.severity - yesterdayMA.severity) / yesterdayMA.severity) * 100
        : 0;

    // Classify labels
    const classifyTrend = (delta) => {
        if (delta <= -15) return 'improving';
        if (delta >= 15) return 'worsening';
        return 'stable';
    };

    return {
        ma7Count: todayMA.count,
        ma7Severity: todayMA.severity,
        deltaPctCount,
        deltaPctSeverity,
        labelCount: classifyTrend(deltaPctCount),
        labelSeverity: classifyTrend(deltaPctSeverity)
    };
}

/**
 * Mine combinations (features) associated with symptoms
 * @param {Array} rows - User rows (assumed chronological)
 * @returns {Array} - Top 3 combinations { label, count, lift }
 */
function mineCombinations(rows) {
    // Sort by timestamp
    const sorted = rows.slice().sort((a, b) => {
        return new Date(a.Timestamp) - new Date(b.Timestamp);
    });

    // Extract features for each meal/drink
    const exposures = [];

    for (let i = 0; i < sorted.length; i++) {
        const row = sorted[i];

        if (row.Type !== 'food' && row.Type !== 'drink') continue;

        // Extract features
        const features = extractFeatures(row);

        // Check if symptom occurred within next 6h
        let hasOutcome = false;
        const mealTime = new Date(row.Timestamp);

        for (let j = i + 1; j < sorted.length; j++) {
            const futureRow = sorted[j];
            const futureTime = new Date(futureRow.Timestamp);
            const diffMin = (futureTime - mealTime) / 60000;

            if (diffMin > 360) break; // Beyond 6h window

            if (futureRow.Type === 'symptom' || futureRow.Type === 'reflux') {
                hasOutcome = true;
                break;
            }
        }

        exposures.push({ features, hasOutcome });
    }

    if (exposures.length === 0) {
        return [];
    }

    // Calculate baseline outcome rate
    const totalExposures = exposures.length;
    const totalOutcomes = exposures.filter(e => e.hasOutcome).length;
    const baseline = totalOutcomes / totalExposures;

    if (baseline === 0) {
        return []; // No outcomes, can't compute lift
    }

    // Generate pairs and compute lift
    const featureKeys = ['caffeine', 'dairy', 'spicy', 'pizza', 'timeBucket'];
    const combinations = [];

    // Single features
    for (const key of featureKeys) {
        const filtered = exposures.filter(e => e.features[key]);
        if (filtered.length < 3) continue; // Min threshold

        const count = filtered.length;
        const outcomes = filtered.filter(e => e.hasOutcome).length;
        const rate = outcomes / count;
        const lift = rate / baseline;

        if (lift > 1.0) {
            combinations.push({
                label: formatFeatureLabel(key, null),
                count,
                lift: parseFloat(lift.toFixed(2))
            });
        }
    }

    // Pairs
    for (let i = 0; i < featureKeys.length; i++) {
        for (let j = i + 1; j < featureKeys.length; j++) {
            const key1 = featureKeys[i];
            const key2 = featureKeys[j];

            const filtered = exposures.filter(e => e.features[key1] && e.features[key2]);
            if (filtered.length < 3) continue;

            const count = filtered.length;
            const outcomes = filtered.filter(e => e.hasOutcome).length;
            const rate = outcomes / count;
            const lift = rate / baseline;

            if (lift > 1.0) {
                combinations.push({
                    label: formatFeatureLabel(key1, key2),
                    count,
                    lift: parseFloat(lift.toFixed(2))
                });
            }
        }
    }

    // Sort by lift descending, return top 3
    combinations.sort((a, b) => b.lift - a.lift);
    return combinations.slice(0, 3);
}

/**
 * Extract features from a meal/drink row
 * @param {Object} row - Row object
 * @returns {Object} - Features { caffeine, dairy, spicy, pizza, timeBucket }
 */
function extractFeatures(row) {
    const details = row.Details.toLowerCase();
    const notes = parseNotes(row.Notes);

    const features = {
        caffeine: false,
        dairy: false,
        spicy: false,
        pizza: false,
        timeBucket: 'Other'
    };

    // Caffeine
    const hasCaffeineToken = notes.has('caffeine');
    const hasDecafToken = notes.has('decaf');
    const caffeinatedItems = ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'chai', 'tea', 'matcha', 'energy drink', 'refresher'];
    const hasCaffeinatedItem = caffeinatedItems.some(item => details.includes(item));

    features.caffeine = hasCaffeineToken || (hasCaffeinatedItem && !hasDecafToken);

    // Dairy
    const dairyItems = ['milk', 'cheese', 'yogurt', 'ice cream', 'cream', 'butter', 'latte', 'cappuccino'];
    const nonDairyItems = ['oat', 'almond', 'soy', 'coconut'];
    const hasDairy = dairyItems.some(item => details.includes(item));
    const isNonDairy = nonDairyItems.some(item => details.includes(item));

    features.dairy = hasDairy && !isNonDairy;

    // Spicy
    const spicyItems = ['spicy', 'hot sauce', 'jalapeno', 'sriracha', 'chili', 'pepper'];
    features.spicy = spicyItems.some(item => details.includes(item));

    // Pizza
    features.pizza = details.includes('pizza');

    // Time bucket
    if (row.Timestamp) {
        const tz = process.env.TIMEZONE || 'America/Los_Angeles';
        const hour = moment(row.Timestamp).tz(tz).hour();

        if (hour >= 5 && hour < 11) {
            features.timeBucket = 'AM';
        } else if (hour >= 11 && hour < 19) {
            features.timeBucket = 'PM';
        } else if ((hour >= 19 && hour < 24) || (hour >= 0 && hour < 2)) {
            features.timeBucket = 'Late';
        }
    }

    return features;
}

/**
 * Format feature label for display
 * @param {string} key1 - First feature key
 * @param {string} key2 - Second feature key (or null for single)
 * @returns {string} - Formatted label
 */
function formatFeatureLabel(key1, key2) {
    const map = {
        caffeine: 'Caffeine',
        dairy: 'Dairy',
        spicy: 'Spicy',
        pizza: 'Pizza',
        timeBucket: 'Timing'
    };

    if (!key2) return map[key1] || key1;

    return `${map[key1]}+${map[key2]}`;
}

/**
 * Compute symptom-free streak
 * @param {Array} rows - User rows
 * @returns {Object} - { symptomFreeDays, milestones, lastSymptomDate }
 */
function computeStreak(rows) {
    const tz = process.env.TIMEZONE || 'America/Los_Angeles';
    const today = moment().tz(tz).format('YYYY-MM-DD');

    // Build set of dates with symptoms
    const symptomDates = new Set();
    rows.forEach(row => {
        if ((row.Type === 'symptom' || row.Type === 'reflux') && row.Date) {
            symptomDates.add(row.Date);
        }
    });

    // Count backward from today
    let streakDays = 0;
    let lastSymptomDate = null;

    for (let i = 0; i < 365; i++) { // Max 1 year
        const checkDate = moment().tz(tz).subtract(i, 'days').format('YYYY-MM-DD');

        if (symptomDates.has(checkDate)) {
            lastSymptomDate = checkDate;
            break;
        }

        streakDays++;
    }

    // Determine milestones reached
    const allMilestones = [3, 7, 14];
    const milestones = allMilestones.filter(m => streakDays >= m);

    return {
        symptomFreeDays: streakDays,
        milestones,
        lastSymptomDate
    };
}

module.exports = {
    sumIntakeKcal,
    getBurnForDate,
    budgetBar,
    computeLatencyMinutes,
    computeRefluxStats,
    mineCombinations,
    computeStreak
};
