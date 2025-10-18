const { google } = require('googleapis');
const moment = require('moment-timezone');

class GoogleSheetsService {
    constructor() {
        this.sheets = null;
        this.auth = null;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
        this.sheetName = 'GI_Tracking';
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Create auth client using service account credentials
            this.auth = new google.auth.JWT({
                email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            // Initialize sheets API
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });

            // Initialize sheet structure
            await this.initializeSheet();

            this.initialized = true;
            console.log('✅ Google Sheets service initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Google Sheets:', error.message);
            throw error;
        }
    }

    async initializeSheet() {
        try {
            // Check if sheet exists
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const sheetExists = response.data.sheets.some(
                sheet => sheet.properties.title === this.sheetName
            );

            if (!sheetExists) {
                // Create the sheet
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: this.sheetName,
                                    gridProperties: {
                                        rowCount: 10000,
                                        columnCount: 8
                                    }
                                }
                            }
                        }]
                    }
                });
                console.log(`Created new sheet: ${this.sheetName}`);
            }

            // Check if headers exist
            const headerRange = `${this.sheetName}!A1:H1`;
            const headerResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: headerRange
            });

            if (!headerResponse.data.values || headerResponse.data.values[0]?.length === 0) {
                // Add headers
                const headers = [['Timestamp', 'User', 'Type', 'Details', 'Severity', 'Notes', 'Date', 'Source']];
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: headerRange,
                    valueInputOption: 'RAW',
                    resource: { values: headers }
                });

                // Format headers (bold and frozen)
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: await this.getSheetId(),
                                        startRowIndex: 0,
                                        endRowIndex: 1
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            textFormat: { bold: true },
                                            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                                        }
                                    },
                                    fields: 'userEnteredFormat(textFormat,backgroundColor)'
                                }
                            },
                            {
                                updateSheetProperties: {
                                    properties: {
                                        sheetId: await this.getSheetId(),
                                        gridProperties: { frozenRowCount: 1 }
                                    },
                                    fields: 'gridProperties.frozenRowCount'
                                }
                            }
                        ]
                    }
                });
                console.log('Added headers to sheet');
            }
        } catch (error) {
            console.error('Error initializing sheet:', error);
            throw error;
        }
    }

    async getSheetId() {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId
        });

        const sheet = response.data.sheets.find(
            s => s.properties.title === this.sheetName
        );

        return sheet.properties.sheetId;
    }

    async appendRow(entry) {
        if (!this.initialized) await this.initialize();

        try {
            const timestamp = entry.timestamp || moment().tz(process.env.TIMEZONE || 'America/Los_Angeles').format('YYYY-MM-DD HH:mm:ss');
            const date = moment(timestamp).format('YYYY-MM-DD');

            const values = [[
                timestamp,
                entry.user,
                entry.type,
                entry.value || entry.details || '',
                entry.severity || '',
                entry.notes || '',
                date,
                entry.source || 'DM'  // Default to DM if not specified
            ]];

            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A:H`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values }
            });

            console.log(`Logged entry to Google Sheets: ${entry.type} for ${entry.user}`);
            return response.data;
        } catch (error) {
            console.error('Error appending row to Google Sheets:', error);
            throw error;
        }
    }

    async getRows(filter = {}) {
        if (!this.initialized) await this.initialize();

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A2:H` // Skip header row, include Source column
            });

            if (!response.data.values) return [];

            // Convert rows to objects
            const rows = response.data.values.map(row => ({
                timestamp: row[0] || '',
                user: row[1] || '',
                type: row[2] || '',
                value: row[3] || '',
                severity: row[4] || '',
                notes: row[5] || '',
                date: row[6] || '',
                source: row[7] || 'DM'
            }));

            // Apply filters
            let filteredRows = rows;

            if (filter.user) {
                filteredRows = filteredRows.filter(row => row.user === filter.user);
            }

            if (filter.date) {
                const filterDate = moment(filter.date).format('YYYY-MM-DD');
                filteredRows = filteredRows.filter(row => row.date === filterDate);
            }

            if (filter.startDate && filter.endDate) {
                const start = moment(filter.startDate);
                const end = moment(filter.endDate);
                filteredRows = filteredRows.filter(row => {
                    const rowDate = moment(row.timestamp);
                    return rowDate.isBetween(start, end, null, '[]');
                });
            }

            if (filter.type) {
                filteredRows = filteredRows.filter(row => row.type === filter.type);
            }

            return filteredRows;
        } catch (error) {
            console.error('Error getting rows from Google Sheets:', error);
            return [];
        }
    }

    async getTodayEntries(userName = null) {
        const today = moment().tz(process.env.TIMEZONE || 'America/Los_Angeles').startOf('day');
        const filter = {
            date: today.format('YYYY-MM-DD')
        };

        if (userName) filter.user = userName;

        return this.getRows(filter);
    }

    async getWeekEntries(userName = null) {
        const weekStart = moment().tz(process.env.TIMEZONE || 'America/Los_Angeles').startOf('week');
        const weekEnd = moment().tz(process.env.TIMEZONE || 'America/Los_Angeles').endOf('week');

        const filter = {
            startDate: weekStart,
            endDate: weekEnd
        };

        if (userName) filter.user = userName;

        return this.getRows(filter);
    }

    async getAllEntries(userName = null) {
        const filter = {};
        if (userName) filter.user = userName;
        return this.getRows(filter);
    }

    async getEntriesDateRange(startDate, endDate, userName = null) {
        const filter = {
            startDate: moment(startDate),
            endDate: moment(endDate)
        };

        if (userName) filter.user = userName;

        return this.getRows(filter);
    }

    async getLastEntry(userName = null) {
        const entries = await this.getAllEntries(userName);
        return entries.length > 0 ? entries[entries.length - 1] : null;
    }

    async countEntriesByType(type, userName = null) {
        const entries = await this.getAllEntries(userName);
        return entries.filter(entry => entry.type === type).length;
    }

    async getUniqueUsers() {
        const entries = await this.getAllEntries();
        const users = new Set(entries.map(entry => entry.user));
        return Array.from(users);
    }

    async clearSheet() {
        if (!this.initialized) await this.initialize();

        try {
            // Clear all data except headers
            await this.sheets.spreadsheets.values.clear({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A2:G`
            });

            console.log('Cleared all data from sheet (headers preserved)');
        } catch (error) {
            console.error('Error clearing sheet:', error);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService();