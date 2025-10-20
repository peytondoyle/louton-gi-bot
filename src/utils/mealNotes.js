const { google } = require('googleapis');

/**
 * Updates the Notes column of a specific meal row in Google Sheets.
 * The mealId is expected in the format "SheetName:RowIndex".
 * @param {string} mealId - The ID of the meal row (e.g., "Peyton:123").
 * @param {string} noteToAppend - The note to append (e.g., "after_effect=ok").
 */
async function updateMealNotes(mealId, noteToAppend, googleSheets) {
    const [sheetName, rowIndexStr] = mealId.split(':');
    const rowIndex = parseInt(rowIndexStr, 10);

    if (!sheetName || isNaN(rowIndex) || rowIndex < 2) {
        console.error(`[updateMealNotes] Invalid mealId format: ${mealId}`);
        return;
    }

    try {
        // Get the current Notes value
        const range = `${sheetName}!K${rowIndex}`; // Assuming Notes is column K (11th column, A=1, B=2, ..., K=11)
        const response = await googleSheets.sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range,
        });

        let currentNotes = response.data.values && response.data.values[0] ? response.data.values[0][0] : '';
        let newNotes;
        if (currentNotes) {
            newNotes = `${currentNotes}; ${noteToAppend}`;
        } else {
            newNotes = noteToAppend;
        }

        // Update the Notes column
        await googleSheets.sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[newNotes]] },
        });
        console.log(`[updateMealNotes] Successfully updated notes for meal ${mealId} with: ${noteToAppend}`);
    } catch (error) {
        console.error(`[updateMealNotes] Failed to update notes for meal ${mealId}: ${error.message}`);
    }
}

module.exports = { updateMealNotes };
