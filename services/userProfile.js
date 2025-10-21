const { a1, getSheet: getSheetFromGoogleBase, batchUpdate } = require('./googleBase');

const PROFILE_SHEET_NAME = 'User_Profiles';
const PROFILE_SHEET_GID = process.env.USER_PROFILES_SHEET_GID || '123456789'; // Replace with a real GID in your .env for persistence

// Cache for user profiles (in-memory)
const profileCache = new Map();

/**
 * Ensures the User_Profiles sheet exists with the correct headers.
 * @param {object} googleSheets - The authenticated Google Sheets instance.
 */
async function ensureProfileSheet(googleSheets) {
    const headers = ['UserID', 'ProfileJSON', 'LastUpdated'];
    const sheetTitle = PROFILE_SHEET_NAME;

    try {
        const sheet = await googleSheets._getSheet(sheetTitle); // Use internal method to check sheet existence
        if (!sheet) {
            console.log(`[USER_PROFILE] Creating sheet: ${sheetTitle}`);
            // Attempt to create the sheet using batchUpdate
            const requests = [{
                addSheet: {
                    properties: {
                        title: sheetTitle,
                        gridProperties: {
                            rowCount: 1, // Start with one row for headers
                            columnCount: headers.length,
                        }
                    }
                }
            }];
            await googleSheets.sheets.spreadsheets.batchUpdate({
                spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                resource: { requests }
            });
            console.log(`[USER_PROFILE] Successfully created sheet: ${sheetTitle}`);

            // Add headers to the newly created sheet
            await googleSheets.sheets.spreadsheets.values.update({
                spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                range: `${sheetTitle}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [headers] },
            });
            console.log(`[USER_PROFILE] Added headers to ${sheetTitle}`);

        } else {
            // Sheet exists, ensure headers are present (simplified for now)
            const existingHeaders = await googleSheets.sheets.spreadsheets.values.get({
                spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                range: `${sheetTitle}!1:1`
            });
            const currentHeaders = existingHeaders.data.values ? existingHeaders.data.values[0] : [];
            const missingHeaders = headers.filter(h => !currentHeaders.includes(h));
            if (missingHeaders.length > 0) {
                console.warn(`[USER_PROFILE] Missing headers in ${sheetTitle}: ${missingHeaders.join(', ')}. Please add them manually or consider a more robust header update mechanism.`);
                // For now, we don't auto-add missing headers to existing sheets to avoid data shifts.
            }
        }
    } catch (error) {
        console.error(`[USER_PROFILE] Error ensuring profile sheet exists: ${error.message}`);
    }
}


/**
 * Gets a user's profile from cache or fetches from Google Sheets.
 * @param {string} userId - The Discord user ID.
 * @param {object} googleSheets - The authenticated Google Sheets instance.
 * @returns {Promise<object>} The user's profile object.
 */
async function getUserProfile(userId, googleSheets) {
    if (profileCache.has(userId)) {
        return profileCache.get(userId);
    }

    try {
        const range = `${PROFILE_SHEET_NAME}!A:C`;
        const response = await googleSheets.sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range,
        });

        const rows = response.data.values || [];
        const userRow = rows.find(row => row[0] === userId);

        let profile;
        if (userRow && userRow[1]) {
            profile = JSON.parse(userRow[1]);
        } else {
            // Create a default profile if one doesn't exist
            profile = {};
        }

        // Merge with default preferences to ensure all keys exist
        const defaultPrefs = {
            DM: 'off',
            TZ: 'America/Los_Angeles',
            MorningHHMM: '',
            EveningHHMM: '',
            InactivityHHMM: '',
            SnoozeUntil: '',
            DNDWindow: '',
            Cooldowns: {}
        };

        const finalProfile = {
            learnedCalorieMap: profile.learnedCalorieMap || {},
            knownTriggers: profile.knownTriggers || [],
            safeFoods: profile.safeFoods || [],
            dietaryPreferences: profile.dietaryPreferences || [],
            dailyGoal: profile.dailyGoal || null, // Daily calorie goal
            prefs: { ...defaultPrefs, ...(profile.prefs || {}) },
        };

        profileCache.set(userId, finalProfile);
        return finalProfile;

    } catch (error) {
        console.error(`[USER_PROFILE] Failed to get profile for ${userId}:`, error);
        // Return a default profile on error to prevent crashes
        return {
            learnedCalorieMap: {},
            knownTriggers: [],
            safeFoods: [],
            dietaryPreferences: [],
            prefs: {
                DM: 'off',
                TZ: 'America/Los_Angeles',
                MorningHHMM: '',
                EveningHHMM: '',
                InactivityHHMM: '',
                SnoozeUntil: '',
                DNDWindow: '',
                Cooldowns: {}
            },
        };
    }
}

/**
 * Updates a user's profile in Google Sheets and cache.
 * @param {string} userId - The Discord user ID.
 * @param {object} profileData - The new profile data to save.
 * @param {object} googleSheets - The authenticated Google Sheets instance.
 * @returns {Promise<boolean>} True if successful.
 */
async function updateUserProfile(userId, profileData, googleSheets) {
    // Ensure prefs exist on the profile
    if (!profileData.prefs) {
        const currentProfile = await getUserProfile(userId, googleSheets);
        profileData.prefs = currentProfile.prefs;
    }

    const profileJSON = JSON.stringify(profileData, null, 2);
    const lastUpdated = new Date().toISOString();
    const newRow = [userId, profileJSON, lastUpdated];

    try {
        const range = `${PROFILE_SHEET_NAME}!A:C`;
        const response = await googleSheets.sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range,
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === userId);

        let targetRange;
        if (rowIndex !== -1) {
            // User exists, update their row
            targetRange = `${PROFILE_SHEET_NAME}!A${rowIndex + 1}`;
            await googleSheets.sheets.spreadsheets.values.update({
                spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                range: targetRange,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [newRow] },
            });
        } else {
            // User does not exist, append a new row
            await googleSheets.sheets.spreadsheets.values.append({
                spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                range: `${PROFILE_SHEET_NAME}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [newRow] },
            });
        }

        profileCache.set(userId, profileData);
        console.log(`[USER_PROFILE] Successfully saved profile for ${userId}`);
        return true;

    } catch (error) {
        console.error(`[USER_PROFILE] Failed to save profile for ${userId}:`, error);
        return false;
    }
}


module.exports = {
    getUserProfile,
    updateUserProfile,
    ensureProfileSheet,
};
