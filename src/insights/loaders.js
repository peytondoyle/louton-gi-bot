/**
 * Data Loaders for Insights
 * Fast, isolated data loads with caching
 */

const moment = require('moment-timezone');
const { hasDeleted } = require('../utils/notes');

// In-memory cache with TTL (5 minutes)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Load user rows from their tab with filtering
 * @param {Object} googleSheets - Sheets service
 * @param {string} userName - User name
 * @param {string} sheetName - Sheet name (Peyton/Louis)
 * @param {Object} options - { sinceDays: 30 }
 * @returns {Promise<Array>} - Filtered rows
 */
async function loadUserRows(googleSheets, userName, sheetName, { sinceDays = 30 } = {}) {
    const cacheKey = `user:${sheetName}:${sinceDays}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[INSIGHTS] Cache hit for ${cacheKey}`);
        return cached.data;
    }

    console.log(`[INSIGHTS] Loading ${sheetName} rows...`);
    const startTime = Date.now();

    try {
        const result = await googleSheets.getRows(sheetName);
        if (!result.success) {
            console.error(`[INSIGHTS] Failed to load ${sheetName}:`, result.error);
            return [];
        }

        // Filter and transform rows
        const tz = process.env.TIMEZONE || 'America/Los_Angeles'; // TODO: Use per-user TZ when Phase 1 complete
        const cutoffDate = moment().tz(tz).subtract(sinceDays, 'days').format('YYYY-MM-DD');

        const filtered = result.rows
            .filter(row => {
                // Skip deleted rows
                if (hasDeleted(row.Notes)) return false;

                // Skip rows older than cutoff
                if (row.Date && row.Date < cutoffDate) return false;

                return true;
            })
            .map(row => ({
                Timestamp: row.Timestamp,
                Type: row.Type,
                Details: row.Details || '',
                Severity: row.Severity || '',
                Notes: row.Notes || '',
                Date: row.Date,
                Source: row.Source || '',
                Calories: parseFloat(row.Calories) || 0
            }));

        console.log(`[INSIGHTS] Loaded ${filtered.length} rows from ${sheetName} in ${Date.now() - startTime}ms`);

        // Cache result
        cache.set(cacheKey, {
            data: filtered,
            timestamp: Date.now()
        });

        return filtered;
    } catch (error) {
        console.error(`[INSIGHTS] Error loading ${sheetName}:`, error);
        return [];
    }
}

/**
 * Load Health_Peyton rows with burn calories
 * @param {Object} googleSheets - Sheets service
 * @param {Object} options - { sinceDays: 30 }
 * @returns {Promise<Map>} - Map keyed by Date
 */
async function loadHealthRows(googleSheets, { sinceDays = 30 } = {}) {
    const cacheKey = `health:${sinceDays}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[INSIGHTS] Cache hit for ${cacheKey}`);
        return cached.data;
    }

    console.log(`[INSIGHTS] Loading Health_Peyton rows...`);
    const startTime = Date.now();

    try {
        const result = await googleSheets.getRows('Health_Peyton');
        if (!result.success) {
            console.log(`[INSIGHTS] Health_Peyton not available`);
            return new Map();
        }

        // Filter and transform
        const tz = process.env.TIMEZONE || 'America/Los_Angeles';
        const cutoffDate = moment().tz(tz).subtract(sinceDays, 'days').format('YYYY-MM-DD');

        const healthMap = new Map();
        result.rows.forEach(row => {
            if (!row.Date || row.Date < cutoffDate) return;

            healthMap.set(row.Date, {
                Date: row.Date,
                Active_kcal: parseFloat(row.Active_kcal) || 0,
                Basal_kcal: parseFloat(row.Basal_kcal) || 0,
                Total_kcal: parseFloat(row.Total_kcal) || 0
            });
        });

        console.log(`[INSIGHTS] Loaded ${healthMap.size} Health rows in ${Date.now() - startTime}ms`);

        // Cache result
        cache.set(cacheKey, {
            data: healthMap,
            timestamp: Date.now()
        });

        return healthMap;
    } catch (error) {
        console.error(`[INSIGHTS] Error loading Health_Peyton:`, error);
        return new Map();
    }
}

/**
 * Get today's date window
 * @param {string} tz - Timezone
 * @returns {Object} - { startISO, endISO, dateStr }
 */
function todayWindow(tz = 'America/Los_Angeles') {
    const now = moment().tz(tz);
    const dateStr = now.format('YYYY-MM-DD');
    const startISO = now.startOf('day').toISOString();
    const endISO = now.endOf('day').toISOString();

    return { startISO, endISO, dateStr };
}

/**
 * Get this week's date window
 * @param {string} tz - Timezone
 * @returns {Object} - { startISO, endISO, dateStr }
 */
function weekWindow(tz = 'America/Los_Angeles') {
    const now = moment().tz(tz);
    const dateStr = now.format('YYYY-MM-DD');
    const startISO = now.startOf('week').toISOString();
    const endISO = now.endOf('week').toISOString();

    return { startISO, endISO, dateStr };
}

/**
 * Clear cache (useful for testing)
 */
function clearCache() {
    cache.clear();
    console.log('[INSIGHTS] Cache cleared');
}

module.exports = {
    loadUserRows,
    loadHealthRows,
    todayWindow,
    weekWindow,
    clearCache
};
