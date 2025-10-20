const { google } = require('googleapis');

/**
 * Updates the Notes column of a specific meal row in Google Sheets.
 * The mealRef is an object containing { tab: string, rowId: number, timestampISO: string }.
 * @param {object} googleSheets - The authenticated Google Sheets instance.
 * @param {object} mealRef - The reference to the meal row.
 * @param {string[]} tokens - An array of notes tokens to append.
 * @returns {Promise<{ok: boolean, reason?: string, notes?: string}>} Result of the update operation.
 */
async function updateMealNotes(googleSheets, mealRef, tokens) {
    if (!mealRef || (!mealRef.rowId && !mealRef.timestampISO) || !mealRef.tab) {
        console.error(`[updateMealNotes] Invalid mealRef: ${JSON.stringify(mealRef)}`);
        return { ok: false, reason: 'NO_MEAL_REF' };
    }

    try {
        const sheetName = mealRef.tab;
        let rowIndex = mealRef.rowId;
        let currentNotes = '';

        if (!rowIndex) {
            // If rowId is not present, attempt to find the row by timestamp
            const allRows = await googleSheets.getRows({}, sheetName);
            const targetRow = allRows.rows.find(row => row.Timestamp === mealRef.timestampISO);
            if (targetRow && targetRow._rawData && targetRow._rawData.rowIndex) {
                rowIndex = targetRow._rawData.rowIndex + 1; // +1 because sheet rows are 1-indexed
                currentNotes = targetRow.Notes || '';
            } else {
                console.warn(`[updateMealNotes] Meal row not found by timestamp for ${mealRef.timestampISO} in ${sheetName}.`);
                return { ok: false, reason: 'MEAL_NOT_FOUND' };
            }
        } else {
            // Get the current Notes value using rowId
            const range = `${sheetName}!K${rowIndex}`; // Assuming Notes is column K
            const response = await googleSheets.sheets.spreadsheets.values.get({
                spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                range,
            });
            currentNotes = response.data.values && response.data.values[0] ? response.data.values[0][0] : '';
        }

        const parts = currentNotes
            .split(';')
            .map(s => s.trim())
            .filter(Boolean);

        for (const t of tokens) {
            if (!parts.includes(t)) parts.push(t);
        }

        const nextNotes = parts.join('; ');

        // Update the Notes column
        const rangeToUpdate = `${sheetName}!K${rowIndex}`;
        await googleSheets.sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range: rangeToUpdate,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[nextNotes]] },
        });

        console.log(`[updateMealNotes] Successfully updated notes for meal ${sheetName}:${rowIndex} with: ${nextNotes}`);
        return { ok: true, notes: nextNotes };
    } catch (error) {
        console.error(`[updateMealNotes] Failed to update notes for meal ${JSON.stringify(mealRef)}: ${error.message}`);
        return { ok: false, reason: error.message };
    }
}

module.exports = { updateMealNotes };
