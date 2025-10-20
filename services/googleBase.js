/**
 * Google Sheets Base Utilities
 * Common helper functions for Google Sheets operations
 */

/**
 * Convert column index to A1 notation
 * @param {number} columnIndex - Zero-based column index
 * @returns {string} - A1 notation (e.g., 0 -> A, 25 -> Z, 26 -> AA)
 */
function a1(columnIndex) {
    let result = '';
    while (columnIndex >= 0) {
        result = String.fromCharCode(65 + (columnIndex % 26)) + result;
        columnIndex = Math.floor(columnIndex / 26) - 1;
    }
    return result;
}

/**
 * Get sheet by name from spreadsheet
 * @param {Object} sheets - Google Sheets API instance
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Name of the sheet
 * @returns {Promise<Object>} - Sheet object
 */
async function getSheet(sheets, spreadsheetId, sheetName) {
    try {
        const response = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId
        });
        
        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) {
            throw new Error(`Sheet "${sheetName}" not found`);
        }
        
        return sheet;
    } catch (error) {
        console.error(`Error getting sheet "${sheetName}":`, error.message);
        throw error;
    }
}

/**
 * Execute batch update on spreadsheet
 * @param {Object} sheets - Google Sheets API instance
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {Array} requests - Array of request objects
 * @returns {Promise<Object>} - Batch update response
 */
async function batchUpdate(sheets, spreadsheetId, requests) {
    try {
        const response = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: requests
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Error executing batch update:', error.message);
        throw error;
    }
}

/**
 * Convert A1 notation to column index
 * @param {string} a1Notation - A1 notation (e.g., A, Z, AA)
 * @returns {number} - Zero-based column index
 */
function a1ToColumnIndex(a1Notation) {
    let result = 0;
    for (let i = 0; i < a1Notation.length; i++) {
        result = result * 26 + (a1Notation.charCodeAt(i) - 64);
    }
    return result - 1;
}

/**
 * Get range for entire column
 * @param {string} sheetName - Name of the sheet
 * @param {number} columnIndex - Zero-based column index
 * @returns {string} - A1 range notation
 */
function getColumnRange(sheetName, columnIndex) {
    const columnLetter = a1(columnIndex);
    return `${sheetName}!${columnLetter}:${columnLetter}`;
}

/**
 * Get range for specific cell
 * @param {string} sheetName - Name of the sheet
 * @param {number} row - One-based row number
 * @param {number} column - Zero-based column index
 * @returns {string} - A1 range notation
 */
function getCellRange(sheetName, row, column) {
    const columnLetter = a1(column);
    return `${sheetName}!${columnLetter}${row}`;
}

/**
 * Get range for specific area
 * @param {string} sheetName - Name of the sheet
 * @param {number} startRow - One-based start row
 * @param {number} endRow - One-based end row
 * @param {number} startColumn - Zero-based start column
 * @param {number} endColumn - Zero-based end column
 * @returns {string} - A1 range notation
 */
function getAreaRange(sheetName, startRow, endRow, startColumn, endColumn) {
    const startColumnLetter = a1(startColumn);
    const endColumnLetter = a1(endColumn);
    return `${sheetName}!${startColumnLetter}${startRow}:${endColumnLetter}${endRow}`;
}

module.exports = {
    a1,
    getSheet,
    batchUpdate,
    a1ToColumnIndex,
    getColumnRange,
    getCellRange,
    getAreaRange
};
