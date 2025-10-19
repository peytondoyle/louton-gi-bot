// User Preferences Storage - Sheets-first with JSON fallback
// Stores reminder settings, timezone, and snooze preferences per user

const fs = require('fs');
const path = require('path');

const PREFS_PATH = path.join(process.cwd(), '.data', 'prefs.json');
const SHEET_NAME = 'Prefs';

/**
 * Ensure Prefs tab exists in Google Sheets
 * @param {Object} googleSheets - Google Sheets service
 */
async function ensurePrefsTab(googleSheets) {
    try {
        await googleSheets.ensureSheetAndHeaders(SHEET_NAME, [
            'UserId', 'DM', 'TZ', 'MorningHHMM', 'EveningHHMM', 'InactivityHHMM', 'SnoozeUntil'
        ]);
        console.log('✅ Prefs tab ensured');
    } catch (error) {
        console.error('⚠️  Failed to ensure Prefs tab:', error.message);
        throw error;
    }
}

/**
 * Get user preferences (Sheets-first, JSON fallback)
 * @param {string} userId - Discord user ID
 * @param {Object} googleSheets - Google Sheets service
 * @returns {Promise<Object|null>} User preferences or null
 */
async function getUserPrefs(userId, googleSheets) {
    // Try Sheets path
    try {
        await ensurePrefsTab(googleSheets);
        const rows = await googleSheets.getRows({}, SHEET_NAME);
        const hit = rows.find(r => String(r.userid || r.UserId || '').trim() === String(userId));
        if (hit) {
            // Normalize keys to camelCase
            return {
                UserId: hit.userid || hit.UserId,
                DM: hit.dm || hit.DM || 'off',
                TZ: hit.tz || hit.TZ || 'America/Los_Angeles',
                MorningHHMM: hit.morninghhmm || hit.MorningHHMM || '',
                EveningHHMM: hit.eveninghhmm || hit.EveningHHMM || '',
                InactivityHHMM: hit.inactivityhhmm || hit.InactivityHHMM || '',
                SnoozeUntil: hit.snoozeuntil || hit.SnoozeUntil || ''
            };
        }
    } catch (error) {
        console.log('[PREFS] Sheets read failed, trying JSON fallback:', error.message);
    }

    // JSON fallback
    try {
        if (fs.existsSync(PREFS_PATH)) {
            const raw = JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
            return raw[userId] || null;
        }
    } catch (error) {
        console.error('[PREFS] JSON read failed:', error.message);
    }

    return null;
}

/**
 * Set user preferences (Sheets-first, JSON fallback)
 * @param {string} userId - Discord user ID
 * @param {Object} partial - Partial preferences to update
 * @param {Object} googleSheets - Google Sheets service
 * @returns {Promise<Object>} Updated preferences
 */
async function setUserPrefs(userId, partial, googleSheets) {
    // Try Sheets path
    try {
        await ensurePrefsTab(googleSheets);

        // Get current prefs
        const current = await getUserPrefs(userId, googleSheets);

        // Merge with new values
        const merged = {
            UserId: String(userId),
            DM: partial.DM !== undefined ? partial.DM : (current?.DM || 'off'),
            TZ: partial.TZ !== undefined ? partial.TZ : (current?.TZ || 'America/Los_Angeles'),
            MorningHHMM: partial.MorningHHMM !== undefined ? partial.MorningHHMM : (current?.MorningHHMM || ''),
            EveningHHMM: partial.EveningHHMM !== undefined ? partial.EveningHHMM : (current?.EveningHHMM || ''),
            InactivityHHMM: partial.InactivityHHMM !== undefined ? partial.InactivityHHMM : (current?.InactivityHHMM || ''),
            SnoozeUntil: partial.SnoozeUntil !== undefined ? partial.SnoozeUntil : (current?.SnoozeUntil || '')
        };

        // Write to Sheets
        await googleSheets.appendRowToSheet(SHEET_NAME, merged);
        console.log(`[PREFS] Updated preferences for user ${userId} in Sheets`);
        return merged;
    } catch (error) {
        console.log('[PREFS] Sheets write failed, using JSON fallback:', error.message);
    }

    // JSON fallback
    try {
        const raw = fs.existsSync(PREFS_PATH) ? JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) : {};
        raw[userId] = {
            ...(raw[userId] || {}),
            ...partial,
            UserId: String(userId)
        };

        // Ensure .data directory exists
        fs.mkdirSync(path.dirname(PREFS_PATH), { recursive: true });
        fs.writeFileSync(PREFS_PATH, JSON.stringify(raw, null, 2));

        console.log(`[PREFS] Updated preferences for user ${userId} in JSON`);
        return raw[userId];
    } catch (error) {
        console.error('[PREFS] JSON write failed:', error.message);
        throw error;
    }
}

/**
 * Get all user preferences
 * @param {Object} googleSheets - Google Sheets service
 * @returns {Promise<Array>} Array of user preferences
 */
async function listAllPrefs(googleSheets) {
    // Try Sheets path
    try {
        await ensurePrefsTab(googleSheets);
        const rows = await googleSheets.getRows({}, SHEET_NAME);
        return rows.map(r => ({
            UserId: r.userid || r.UserId,
            DM: r.dm || r.DM || 'off',
            TZ: r.tz || r.TZ || 'America/Los_Angeles',
            MorningHHMM: r.morninghhmm || r.MorningHHMM || '',
            EveningHHMM: r.eveninghhmm || r.EveningHHMM || '',
            InactivityHHMM: r.inactivityhhmm || r.InactivityHHMM || '',
            SnoozeUntil: r.snoozeuntil || r.SnoozeUntil || ''
        }));
    } catch (error) {
        console.log('[PREFS] Sheets list failed, trying JSON fallback:', error.message);
    }

    // JSON fallback
    try {
        if (fs.existsSync(PREFS_PATH)) {
            const raw = JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
            return Object.values(raw);
        }
    } catch (error) {
        console.error('[PREFS] JSON list failed:', error.message);
    }

    return [];
}

module.exports = {
    getUserPrefs,
    setUserPrefs,
    listAllPrefs,
    ensurePrefsTab,
    SHEET_NAME
};
