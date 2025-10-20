const { google } = require('googleapis');

/**
 * Locates a meal row in Google Sheets by reference.
 * @param {object} googleSheets - The authenticated Google Sheets instance.
 * @param {object} mealRef - The reference to the meal row: { tab: string, rowId?: number, timestampISO?: string, item?: string }.
 * @returns {Promise<object|null>} The found row object (with _rawData.rowIndex) or null.
 */
async function getMealRowByRef(googleSheets, mealRef) {
    if (!mealRef || !mealRef.tab) return null;

    // 1) Use rowId if available and the Sheets adapter supports it
    // For now, we'll fall back to timestamp lookup as googleSheets.getRowById is not exposed.
    // if (mealRef.rowId) return googleSheets.getRowById(mealRef.tab, mealRef.rowId); 

    // 2) Fallback: locate by Timestamp within ±2 min AND same Item (best effort)
    const ts = new Date(mealRef.timestampISO);
    if (!isFinite(ts.getTime())) return null; // Ensure timestamp is valid

    try {
        const allRows = await googleSheets.getRows({}, mealRef.tab); // Get all rows from the specified tab
        const rows = allRows.rows || [];
        const winMs = 2 * 60 * 1000; // 2 minutes window

        const foundRow = rows.find(r => {
            // Check item (case-insensitive) if available in mealRef
            const itemMatch = mealRef.item ? (r.Item && r.Item.toLowerCase() === mealRef.item.toLowerCase()) : true;
            
            // Check timestamp within window
            const rowTimestamp = new Date(r.Timestamp);
            const timeMatch = isFinite(rowTimestamp.getTime()) && Math.abs(rowTimestamp.getTime() - ts.getTime()) <= winMs;

            return itemMatch && timeMatch;
        });

        return foundRow || null;
    } catch (error) {
        console.error(`[getMealRowByRef] Error looking up meal by ref ${JSON.stringify(mealRef)}: ${error.message}`);
        return null;
    }
}

/**
 * Updates the Notes column of a specific meal row in Google Sheets.
 * The mealRef is an object containing { tab: string, rowId: number, timestampISO: string }.
 * @param {object} googleSheets - The authenticated Google Sheets instance.
 * @param {object} mealRef - The reference to the meal row.
 * @param {string[]} tokens - An array of notes tokens to append.
 * @returns {Promise<{ok: boolean, reason?: string, notes?: string}>} Result of the update operation.
 */
async function updateMealNotes(googleSheets, mealRef, tokens) {
    if (!mealRef?.tab) return { ok: false, reason: 'NO_MEAL_REF' };

    const row = await getMealRowByRef(googleSheets, mealRef);
    if (!row || !row._rawData || typeof row._rawData.rowIndex === 'undefined') return { ok: false, reason: 'MEAL_NOT_FOUND' };

    const rowIndex = row._rawData.rowIndex + 1; // +1 because sheet rows are 1-indexed
    const existing = (row.Notes ?? '').toString();
    const parts = existing.split(';').map(s => s.trim()).filter(Boolean);
    for (const t of tokens) if (!parts.includes(t)) parts.push(t);
    const next = parts.join('; ');

    // Assuming googleSheets.updateRow method exists or can be simulated
    // For now, use direct API call as googleSheets.updateRow is not directly available
    try {
        const rangeToUpdate = `${mealRef.tab}!K${rowIndex}`;
        await googleSheets.sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range: rangeToUpdate,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[next]] },
        });
        console.log(`[updateMealNotes] Successfully updated notes for meal ${mealRef.tab}:${rowIndex} with: ${next}`);
        return { ok: true, notes: next };
    } catch (error) {
        console.error(`[updateMealNotes] Failed to update notes for meal ${JSON.stringify(mealRef)}: ${error.message}`);
        return { ok: false, reason: error.message };
    }
}

module.exports = { updateMealNotes };
