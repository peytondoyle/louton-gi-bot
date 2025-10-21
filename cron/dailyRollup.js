/**
 * Daily Rollup Job
 * Aggregates yesterday's data per user for fast analytics
 */

const moment = require('moment-timezone');
const { hasDeleted } = require('../src/utils/notes');

/**
 * Run daily rollup for all users
 * @param {Object} googleSheets - Sheets service
 * @param {Object} options - { listAllPrefs }
 */
async function runDailyRollup(googleSheets, { listAllPrefs }) {
    console.log('[ROLLUP] 🔄 Starting daily rollup...');
    const startTime = Date.now();

    try {
        // Get all users with preferences
        const allPrefs = await listAllPrefs(googleSheets);
        const userIds = allPrefs.map(p => p.UserId).filter(Boolean);

        console.log(`[ROLLUP] Processing ${userIds.length} users`);

        for (const userId of userIds) {
            try {
                await rollupUserDay(googleSheets, userId, allPrefs.find(p => p.UserId === userId));
            } catch (error) {
                console.error(`[ROLLUP] Failed for user ${userId}:`, error.message);
            }
        }

        console.log(`[ROLLUP] ✅ Completed in ${Date.now() - startTime}ms`);
    } catch (error) {
        console.error('[ROLLUP] ❌ Failed to run daily rollup:', error);
    }
}

/**
 * Rollup yesterday's data for a single user
 * @param {Object} googleSheets - Sheets service
 * @param {string} userId - User ID
 * @param {Object} prefs - User preferences
 */
async function rollupUserDay(googleSheets, userId, prefs) {
    const tz = prefs?.TZ || 'America/Los_Angeles';
    const yesterday = moment().tz(tz).subtract(1, 'day').format('YYYY-MM-DD');

    // Get user's sheet name
    const sheetName = googleSheets.getLogSheetNameForUser(userId);
    if (!sheetName) {
        console.log(`[ROLLUP] Skipping user ${userId} (no sheet mapping)`);
        return;
    }

    // Fetch rows
    const result = await googleSheets.getRows({}, sheetName);
    if (!result.success) {
        console.error(`[ROLLUP] Failed to fetch rows for ${sheetName}`);
        return;
    }

    // Filter to yesterday's active rows
    const dayRows = result.rows.filter(row => {
        return row.Date === yesterday && !hasDeleted(row.Notes);
    });

    if (dayRows.length === 0) {
        console.log(`[ROLLUP] No data for user ${userId} on ${yesterday}`);
        return;
    }

    // Aggregate metrics
    const totals = {
        userId,
        date: yesterday,
        totalLogs: dayRows.length,
        foodLogs: dayRows.filter(r => r.Type === 'food').length,
        drinkLogs: dayRows.filter(r => r.Type === 'drink').length,
        symptomLogs: dayRows.filter(r => r.Type === 'symptom').length,
        refluxLogs: dayRows.filter(r => r.Type === 'reflux').length,
        bmLogs: dayRows.filter(r => r.Type === 'bm').length,
        totalCalories: dayRows
            .filter(r => (r.Type === 'food' || r.Type === 'drink') && r.Calories)
            .reduce((sum, r) => sum + (parseInt(r.Calories, 10) || 0), 0),
        avgRefluxSeverity: computeAvgSeverity(dayRows.filter(r => r.Type === 'reflux'))
    };

    console.log(`[ROLLUP] ${sheetName} ${yesterday}: ${totals.totalLogs} logs, ${totals.totalCalories} kcal, ${totals.refluxLogs} reflux`);

    // Write to DailyRollups tab
    try {
        const rollupSheetName = `DailyRollups_${sheetName}`;
        
        // Ensure the rollup sheet exists with proper headers
        await googleSheets.ensureSheetAndHeaders(rollupSheetName, [
            'Date',
            'UserId', 
            'TotalLogs',
            'FoodLogs',
            'DrinkLogs', 
            'SymptomLogs',
            'RefluxLogs',
            'BMLogs',
            'TotalCalories',
            'AvgRefluxSeverity'
        ]);
        
        // Write the rollup data
        await googleSheets.appendRowToSheet(rollupSheetName, {
            Date: yesterday,
            UserId: userId,
            TotalLogs: totals.totalLogs,
            FoodLogs: totals.foodLogs,
            DrinkLogs: totals.drinkLogs,
            SymptomLogs: totals.symptomLogs,
            RefluxLogs: totals.refluxLogs,
            BMLogs: totals.bmLogs,
            TotalCalories: totals.totalCalories,
            AvgRefluxSeverity: totals.avgRefluxSeverity
        });
        
        console.log(`[ROLLUP] ✅ Wrote rollup data to ${rollupSheetName}`);
    } catch (error) {
        console.error(`[ROLLUP] ❌ Failed to write rollup data for ${userId}:`, error.message);
    }
}

/**
 * Compute average severity from symptom rows
 * @param {Array} rows - Symptom/reflux rows
 * @returns {number} - Average severity (0 if none)
 */
function computeAvgSeverity(rows) {
    if (rows.length === 0) return 0;

    const severities = rows.map(row => {
        // Try Severity column first
        if (row.Severity) {
            const match = row.Severity.match(/\d+/);
            if (match) return parseInt(match[0], 10);
        }

        // Try Notes tokens
        const notes = row.Notes || '';
        const match = notes.match(/severity=(\d+)/);
        if (match) return parseInt(match[1], 10);

        return null;
    }).filter(s => s !== null);

    if (severities.length === 0) return 0;

    return parseFloat((severities.reduce((a, b) => a + b, 0) / severities.length).toFixed(1));
}

/**
 * Helper to sum array
 * @param {number[]} arr - Array of numbers
 * @returns {number} - Sum
 */
function sum(arr) {
    return arr.reduce((x, y) => x + y, 0);
}

module.exports = {
    runDailyRollup,
    rollupUserDay
};
