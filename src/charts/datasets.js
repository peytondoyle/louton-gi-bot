/**
 * Chart Dataset Loaders
 * Loads and shapes data from Google Sheets for Chart.js
 * Includes 5-min TTL cache and soft-delete filtering
 */

const moment = require('moment-timezone');
const { parseNotes } = require('../utils/notes');
const { google } = require('googleapis');
const time = require('../utils/time');

// In-memory cache (5-min TTL)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get cached data or fetch
 */
function getCached(key, fetcher) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[CHARTS] Cache hit: ${key}`);
        return cached.data;
    }

    console.log(`[CHARTS] Cache miss: ${key}`);
    return null;
}

/**
 * Set cache
 */
function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate chart caches for a user
 */
function invalidateUserCharts(userId) {
    const keys = Array.from(cache.keys()).filter(k => k.includes(userId));
    keys.forEach(k => cache.delete(k));
    console.log(`[CHARTS] Invalidated ${keys.length} cache entries for user ${userId}`);
}

/**
 * Load intake vs burn series
 * @param {Object} options - { googleSheets, userId, sheetName, healthSheet, tz, days }
 * @returns {Promise<Object>} - { labels[], intake[], burn[] }
 */
async function loadIntakeBurnSeries({ googleSheets, userId, sheetName, healthSheet = 'Health_Peyton', tz = 'America/Los_Angeles', days = 7 }) {
    const cacheKey = `charts:${userId}:intake:${days}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        // Load user rows
        const userResult = await googleSheets.getRows({}, sheetName);
        if (!userResult.success) {
            return { labels: [], intake: [], burn: [] };
        }

        // Load health rows (for burn)
        let healthRows = [];
        try {
            const healthResult = await googleSheets.getRows({}, healthSheet);
            if (healthResult.success) {
                healthRows = healthResult.rows;
            }
        } catch (e) {
            console.log('[CHARTS] Health data not available');
        }

        // Build date range
        const dates = [];
        for (let i = days - 1; i >= 0; i--) {
            dates.push(time.now(tz).subtract(i, 'days').format('YYYY-MM-DD'));
        }

        // Aggregate by date
        const intake = [];
        const burn = [];

        for (const date of dates) {
            // Sum intake for this date
            let dailyIntake = 0;
            userResult.rows.forEach(row => {
                if (row.Date !== date) return;
                if (row.Notes && row.Notes.includes('deleted=true')) return;
                if (row.Type !== 'food' && row.Type !== 'drink') return;

                const cal = parseInt(row.Calories, 10);
                if (!isNaN(cal)) dailyIntake += cal;
            });

            intake.push(dailyIntake);

            // Get burn for this date
            const healthRow = healthRows.find(r => r.Date === date);
            let dailyBurn = null;

            if (healthRow) {
                const totalKcal = parseInt(healthRow.Total_kcal, 10);
                if (!isNaN(totalKcal)) {
                    dailyBurn = totalKcal;
                } else {
                    const active = parseInt(healthRow.Active_kcal, 10) || 0;
                    const basal = parseInt(healthRow.Basal_kcal, 10) || 0;
                    if (active + basal > 0) dailyBurn = active + basal;
                }
            }

            burn.push(dailyBurn);
        }

        // Format labels
        const labels = dates.map(d => time.moment(d).format('MMM D'));

        const result = { labels, intake, burn };
        setCache(cacheKey, result);

        return result;
    } catch (error) {
        console.error('[CHARTS] Error loading intake/burn:', error);
        return { labels: [], intake: [], burn: [] };
    }
}

/**
 * Load reflux severity series
 * @param {Object} options - { googleSheets, userId, sheetName, tz, days }
 * @returns {Promise<Object>} - { labels[], count[], avgSeverity[], ma7[] }
 */
async function loadRefluxSeveritySeries({ googleSheets, userId, sheetName, tz = 'America/Los_Angeles', days = 14 }) {
    const cacheKey = `charts:${userId}:reflux:${days}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success) {
            return { labels: [], count: [], avgSeverity: [], ma7: [] };
        }

        // Build date range
        const dates = [];
        for (let i = days - 1; i >= 0; i--) {
            dates.push(time.now(tz).subtract(i, 'days').format('YYYY-MM-DD'));
        }

        // Aggregate reflux by date
        const dailyData = {};
        dates.forEach(d => { dailyData[d] = { count: 0, severities: [] }; });

        result.rows.forEach(row => {
            if (row.Type !== 'reflux') return;
            if (row.Notes && row.Notes.includes('deleted=true')) return;
            if (!dailyData[row.Date]) return;

            dailyData[row.Date].count++;

            // Extract severity
            let severity = null;
            if (row.Severity) {
                const match = row.Severity.match(/\d+/);
                if (match) severity = parseInt(match[0], 10);
            }

            if (!severity && row.Notes) {
                const notes = parseNotes(row.Notes);
                const sevToken = notes.get('severity');
                if (sevToken) severity = parseInt(sevToken, 10);
            }

            if (severity && severity >= 1 && severity <= 10) {
                dailyData[row.Date].severities.push(severity);
            }
        });

        // Build arrays
        const count = [];
        const avgSeverity = [];

        dates.forEach(date => {
            const data = dailyData[date];
            count.push(data.count);

            if (data.severities.length > 0) {
                const avg = data.severities.reduce((a, b) => a + b, 0) / data.severities.length;
                avgSeverity.push(parseFloat(avg.toFixed(1)));
            } else {
                avgSeverity.push(null);
            }
        });

        // Calculate 7-day moving average
        const ma7 = [];
        for (let i = 0; i < count.length; i++) {
            if (i < 6) {
                ma7.push(null); // Not enough data for MA7
            } else {
                const window = count.slice(i - 6, i + 1);
                const avg = window.reduce((a, b) => a + b, 0) / 7;
                ma7.push(parseFloat(avg.toFixed(1)));
            }
        }

        const labels = dates.map(d => time.moment(d).format('MMM D'));

        const chartData = { labels, count, avgSeverity, ma7 };
        setCache(cacheKey, chartData);

        return chartData;
    } catch (error) {
        console.error('[CHARTS] Error loading reflux series:', error);
        return { labels: [], count: [], avgSeverity: [], ma7: [] };
    }
}

/**
 * Load meal→symptom latency samples
 * @param {Object} options - { googleSheets, userId, sheetName, tz, days }
 * @returns {Promise<number[]>} - Array of latency values in minutes
 */
async function loadLatencySamples({ googleSheets, userId, sheetName, tz = 'America/Los_Angeles', days = 30 }) {
    const cacheKey = `charts:${userId}:latency:${days}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success) {
            return [];
        }

        // Filter to date range and sort by timestamp
        const cutoff = time.now(tz).subtract(days, 'days').format('YYYY-MM-DD');
        const rows = result.rows
            .filter(row => {
                if (row.Date < cutoff) return false;
                if (row.Notes && row.Notes.includes('deleted=true')) return false;
                return true;
            })
            .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

        // Compute latencies
        const latencies = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.Type !== 'symptom' && row.Type !== 'reflux') continue;

            const symptomTime = new Date(row.Timestamp);

            // Look back for meals
            for (let j = i - 1; j >= 0; j--) {
                const priorRow = rows[j];
                if (priorRow.Type !== 'food' && priorRow.Type !== 'drink') continue;

                const mealTime = new Date(priorRow.Timestamp);
                const diffMs = symptomTime - mealTime;
                const diffMin = Math.round(diffMs / 60000);

                // Only count 0-360 min window
                if (diffMin >= 0 && diffMin <= 360) {
                    latencies.push(diffMin);
                    break;
                }

                if (diffMin > 360) break;
            }
        }

        setCache(cacheKey, latencies);
        return latencies;
    } catch (error) {
        console.error('[CHARTS] Error loading latency samples:', error);
        return [];
    }
}

/**
 * Load trigger lift bars
 * @param {Object} options - { googleSheets, userId, sheetName, tz, days }
 * @returns {Promise<Object>} - { labels[], lift[], counts[] }
 */
async function loadTriggerLiftBars({ googleSheets, userId, sheetName, tz = 'America/Los_Angeles', days = 30 }) {
    const cacheKey = `charts:${userId}:triggers:${days}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success) {
            return { labels: [], lift: [], counts: [] };
        }

        // Filter and sort
        const cutoff = time.now(tz).subtract(days, 'days').format('YYYY-MM-DD');
        const rows = result.rows
            .filter(row => {
                if (row.Date < cutoff) return false;
                if (row.Notes && row.Notes.includes('deleted=true')) return false;
                return true;
            })
            .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

        // Extract features and outcomes (simplified version)
        const exposures = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.Type !== 'food' && row.Type !== 'drink') continue;

            const notes = parseNotes(row.Notes);
            const features = {
                caffeine: notes.has('caffeine'),
                dairy: notes.get('dairy') === 'dairy',
                late: notes.get('meal') === 'late'
            };

            // Check for symptom within 6h
            const mealTime = new Date(row.Timestamp);
            let hasOutcome = false;

            for (let j = i + 1; j < rows.length; j++) {
                const futureRow = rows[j];
                const futureTime = new Date(futureRow.Timestamp);
                const diffMin = (futureTime - mealTime) / 60000;

                if (diffMin > 360) break;

                if (futureRow.Type === 'symptom' || futureRow.Type === 'reflux') {
                    hasOutcome = true;
                    break;
                }
            }

            exposures.push({ features, hasOutcome });
        }

        if (exposures.length === 0) {
            return { labels: [], lift: [], counts: [] };
        }

        // Calculate baseline and lifts
        const baseline = exposures.filter(e => e.hasOutcome).length / exposures.length;

        const triggers = [];

        // Caffeine
        const caffeineExp = exposures.filter(e => e.features.caffeine);
        if (caffeineExp.length >= 3) {
            const rate = caffeineExp.filter(e => e.hasOutcome).length / caffeineExp.length;
            const lift = baseline > 0 ? rate / baseline : 0;
            if (lift >= 1.3) {
                triggers.push({ label: 'Caffeine', lift, count: caffeineExp.length });
            }
        }

        // Dairy
        const dairyExp = exposures.filter(e => e.features.dairy);
        if (dairyExp.length >= 3) {
            const rate = dairyExp.filter(e => e.hasOutcome).length / dairyExp.length;
            const lift = baseline > 0 ? rate / baseline : 0;
            if (lift >= 1.3) {
                triggers.push({ label: 'Dairy', lift, count: dairyExp.length });
            }
        }

        // Late meals
        const lateExp = exposures.filter(e => e.features.late);
        if (lateExp.length >= 3) {
            const rate = lateExp.filter(e => e.hasOutcome).length / lateExp.length;
            const lift = baseline > 0 ? rate / baseline : 0;
            if (lift >= 1.3) {
                triggers.push({ label: 'Late meals', lift, count: lateExp.length });
            }
        }

        // Caffeine + Dairy combo
        const comboExp = exposures.filter(e => e.features.caffeine && e.features.dairy);
        if (comboExp.length >= 3) {
            const rate = comboExp.filter(e => e.hasOutcome).length / comboExp.length;
            const lift = baseline > 0 ? rate / baseline : 0;
            if (lift >= 1.3) {
                triggers.push({ label: 'Caffeine+Dairy', lift, count: comboExp.length });
            }
        }

        // Sort by lift descending, take top 5
        triggers.sort((a, b) => b.lift - a.lift);
        const top5 = triggers.slice(0, 5);

        const chartData = {
            labels: top5.map(t => t.label),
            lift: top5.map(t => parseFloat(t.lift.toFixed(2))),
            counts: top5.map(t => t.count)
        };

        setCache(cacheKey, chartData);
        return chartData;
    } catch (error) {
        console.error('[CHARTS] Error loading triggers:', error);
        return { labels: [], lift: [], counts: [] };
    }
}

/**
 * Compute quartiles from samples
 */
function computeQuartiles(samples) {
    if (samples.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };

    const sorted = samples.slice().sort((a, b) => a - b);
    const len = sorted.length;

    return {
        min: sorted[0],
        q1: sorted[Math.floor(len * 0.25)],
        median: sorted[Math.floor(len * 0.5)],
        q3: sorted[Math.floor(len * 0.75)],
        max: sorted[len - 1],
        count: len
    };
}

module.exports = {
    loadIntakeBurnSeries,
    loadRefluxSeveritySeries,
    loadLatencySamples,
    loadTriggerLiftBars,
    computeQuartiles,
    invalidateUserCharts
};
