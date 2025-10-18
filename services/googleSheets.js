const { google } = require('googleapis');
const moment = require('moment-timezone');

class GoogleSheetsService {
    constructor() {
        this.sheets = null;
        this.auth = null;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
        this.sheetName = 'GI_Tracking';
        this.insightsSheetName = 'Insights';
        this.initialized = false;

        // Define the complete column schema
        this.columnSchema = [
            'Timestamp',
            'User',
            'Type',
            'Details',
            'Severity',
            'Category',
            'Meal_Type',
            'Confidence',
            'Follow_Up_Needed',
            'Bristol_Scale',
            'Notes',
            'Date',
            'Source'
        ];

        // Known trigger and safe items
        this.knownTriggers = [
            'coffee', 'citrus', 'tomato', 'spicy', 'carbonated', 'soda',
            'alcohol', 'dairy', 'milk', 'cheese', 'fried', 'gluten', 'bread'
        ];

        this.knownSafe = [
            'rice', 'oats', 'oatmeal', 'banana', 'chai', 'chicken',
            'water', 'herbal tea', 'ginger tea', 'chamomile', 'toast', 'eggs'
        ];
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

            // Initialize Insights sheet with formulas
            await this.initializeInsightsSheet();

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
                                        columnCount: this.columnSchema.length  // Dynamic based on schema
                                    }
                                }
                            }
                        }]
                    }
                });
                console.log(`Created new sheet: ${this.sheetName}`);
            }

            // Check if headers exist and update if needed
            const lastCol = String.fromCharCode(65 + this.columnSchema.length - 1); // A=65, so A + length - 1
            const headerRange = `${this.sheetName}!A1:${lastCol}1`;
            const headerResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: headerRange
            });

            const existingHeaders = headerResponse.data.values ? headerResponse.data.values[0] : [];
            const needsUpdate = existingHeaders.length !== this.columnSchema.length ||
                               !this.columnSchema.every((col, i) => existingHeaders[i] === col);

            if (!headerResponse.data.values || headerResponse.data.values[0]?.length === 0 || needsUpdate) {
                // Add or update headers
                console.log('Updating sheet headers to match schema...');
                const headers = [this.columnSchema];
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: headerRange,
                    valueInputOption: 'RAW',
                    resource: { values: headers }
                });
                console.log(`✅ Headers updated: ${this.columnSchema.join(', ')}`);

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

    /**
     * Auto-categorize an item based on known triggers and safe items
     */
    autoCategorize(type, value) {
        if (!value) return 'Unknown';

        const lowerValue = value.toLowerCase();

        if (type === 'food' || type === 'drink') {
            // Check if it's a known trigger
            if (this.knownTriggers.some(trigger => lowerValue.includes(trigger))) {
                return type === 'food' ? 'Trigger Food' : 'Trigger Drink';
            }

            // Check if it's known safe
            if (this.knownSafe.some(safe => lowerValue.includes(safe))) {
                return type === 'food' ? 'Safe Food' : 'Safe Drink';
            }

            return 'Neutral';
        }

        if (type === 'symptom' || type === 'reflux') {
            return 'Symptom';
        }

        if (type === 'bm') {
            return 'Bowel Movement';
        }

        if (type === 'positive') {
            return 'Improvement';
        }

        return 'Unknown';
    }

    /**
     * Extract meal type from notes or timestamp
     */
    determineMealType(notes, timestamp) {
        if (!notes) {
            // Determine by time if no notes
            const hour = moment(timestamp).hour();
            if (hour >= 5 && hour < 11) return 'Breakfast';
            if (hour >= 11 && hour < 15) return 'Lunch';
            if (hour >= 17 && hour < 22) return 'Dinner';
            return 'Snack';
        }

        const lowerNotes = notes.toLowerCase();
        if (lowerNotes.includes('breakfast')) return 'Breakfast';
        if (lowerNotes.includes('lunch')) return 'Lunch';
        if (lowerNotes.includes('dinner')) return 'Dinner';
        if (lowerNotes.includes('snack')) return 'Snack';

        return '';
    }

    async appendRow(entry) {
        if (!this.initialized) await this.initialize();

        try {
            const timestamp = entry.timestamp || moment().tz(process.env.TIMEZONE || 'America/Los_Angeles').format('YYYY-MM-DD HH:mm:ss');
            const date = moment(timestamp).format('YYYY-MM-DD');

            // Auto-categorize if not provided
            const category = entry.category || this.autoCategorize(entry.type, entry.value || entry.details);

            // Determine meal type for food/drink entries
            const mealType = (entry.type === 'food' || entry.type === 'drink') ?
                           (entry.mealType || this.determineMealType(entry.notes, timestamp)) : '';

            // Determine confidence level
            const confidence = entry.confidence || 'High';

            // Check if follow-up is needed
            const followUpNeeded = (entry.type === 'symptom' && entry.severity === 'severe') ? 'Yes' : 'No';

            // Extract Bristol scale for BM entries
            const bristolScale = entry.type === 'bm' ? (entry.bristolScale || '') : '';

            // Handle notesAppend - merge additional metadata into Notes field
            let notes = entry.notes || '';
            if (entry.notesAppend) {
                if (notes) {
                    notes += '; ' + entry.notesAppend;
                } else {
                    notes = entry.notesAppend;
                }
            }

            // Build row values according to column schema
            const values = [[
                timestamp,                           // Timestamp
                entry.user,                          // User
                entry.type,                          // Type
                entry.value || entry.details || '', // Details
                entry.severity || '',                // Severity
                category,                            // Category
                mealType,                            // Meal_Type
                confidence,                          // Confidence
                followUpNeeded,                      // Follow_Up_Needed
                bristolScale,                        // Bristol_Scale
                notes,                               // Notes (with optional append)
                date,                                // Date
                entry.source || 'DM'                 // Source
            ]];

            const lastCol = String.fromCharCode(65 + this.columnSchema.length - 1);
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A:${lastCol}`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values }
            });

            // Store row number for undo functionality
            const rowNumber = response.data.updates.updatedRange.match(/\d+$/)[0];
            this.lastEntryRow = rowNumber;

            console.log(`✅ Logged to Sheets: ${entry.type} for ${entry.user} (${category})`);
            return { success: true, data: response.data, rowNumber };
        } catch (error) {
            console.error('❌ Error appending row to Google Sheets:', error.message);

            // Return structured error for better UX handling
            return {
                success: false,
                error: {
                    message: error.message,
                    code: error.code || 'UNKNOWN',
                    userMessage: 'I had trouble saving that entry. Please try again.'
                }
            };
        }
    }

    async getRows(filter = {}) {
        if (!this.initialized) await this.initialize();

        try {
            const lastCol = String.fromCharCode(65 + this.columnSchema.length - 1);
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A2:${lastCol}` // Skip header row, get all columns
            });

            if (!response.data.values) return [];

            // Convert rows to objects based on schema
            const rows = response.data.values.map(row => ({
                timestamp: row[0] || '',
                user: row[1] || '',
                type: row[2] || '',
                value: row[3] || '',
                severity: row[4] || '',
                category: row[5] || '',
                mealType: row[6] || '',
                confidence: row[7] || '',
                followUpNeeded: row[8] || '',
                bristolScale: row[9] || '',
                notes: row[10] || '',
                date: row[11] || '',
                source: row[12] || 'DM'
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

    async undoLastEntry(userName) {
        if (!this.initialized) await this.initialize();

        try {
            // Get all entries for the user
            const entries = await this.getAllEntries(userName);
            if (entries.length === 0) {
                return { success: false, message: 'No entries found to undo' };
            }

            // Get the last entry's row number
            const lastEntryIndex = entries.length + 1; // +1 for header row

            // Delete the last row for this user
            const requests = [{
                deleteDimension: {
                    range: {
                        sheetId: await this.getSheetId(),
                        dimension: 'ROWS',
                        startIndex: lastEntryIndex,
                        endIndex: lastEntryIndex + 1
                    }
                }
            }];

            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: { requests }
            });

            const lastEntry = entries[entries.length - 1];
            console.log(`Undid last entry for ${userName}: ${lastEntry.type} - ${lastEntry.value}`);
            return {
                success: true,
                message: `Removed: ${lastEntry.type} - ${lastEntry.value}`,
                entry: lastEntry
            };
        } catch (error) {
            console.error('Error undoing entry:', error);
            return { success: false, message: 'Failed to undo entry' };
        }
    }

    async initializeInsightsSheet() {
        // Don't call initialize() here - this is already called from initialize()
        // Just check if sheets API is ready
        if (!this.sheets) {
            console.log('⚠️ Sheets API not ready, skipping Insights initialization');
            return;
        }

        try {
            // Check if Insights sheet exists
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const insightsExists = response.data.sheets.some(
                sheet => sheet.properties.title === this.insightsSheetName
            );

            if (!insightsExists) {
                // Create the Insights sheet
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: this.insightsSheetName,
                                    gridProperties: {
                                        rowCount: 100,
                                        columnCount: 10
                                    }
                                }
                            }
                        }]
                    }
                });
                console.log(`Created Insights sheet: ${this.insightsSheetName}`);
            }

            // Set up the Insights sheet structure with formulas
            const insightsData = [
                // Headers
                ['Metric', 'Value', 'Last Updated'],

                // Trigger frequency counts
                ['=== TRIGGER FREQUENCY ===', '', ''],
                ['Coffee Triggers', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*coffee*") + COUNTIFS(${this.sheetName}!C:C,"drink",${this.sheetName}!D:D,"*coffee*")`, '=NOW()'],
                ['Citrus Triggers', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*citrus*") + COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*orange*") + COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*lemon*")`, '=NOW()'],
                ['Tomato Triggers', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*tomato*") + COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*pizza*")`, '=NOW()'],
                ['Spicy Food Triggers', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*spicy*")`, '=NOW()'],
                ['Dairy Triggers', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*dairy*") + COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*milk*") + COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*cheese*")`, '=NOW()'],

                // Safe food success rates
                ['', '', ''],
                ['=== SAFE FOOD SUCCESS RATE ===', '', ''],
                ['Rice Entries', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*rice*")`, '=NOW()'],
                ['Oats Entries', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*oats*") + COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*oatmeal*")`, '=NOW()'],
                ['Banana Entries', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*banana*")`, '=NOW()'],
                ['Chai Entries', `=COUNTIFS(${this.sheetName}!C:C,"drink",${this.sheetName}!D:D,"*chai*")`, '=NOW()'],
                ['Chicken Entries', `=COUNTIFS(${this.sheetName}!C:C,"food",${this.sheetName}!D:D,"*chicken*")`, '=NOW()'],

                // Symptom statistics
                ['', '', ''],
                ['=== SYMPTOM STATISTICS ===', '', ''],
                ['Total Symptoms', `=COUNTIF(${this.sheetName}!C:C,"symptom") + COUNTIF(${this.sheetName}!C:C,"reflux")`, '=NOW()'],
                ['Reflux Count', `=COUNTIF(${this.sheetName}!C:C,"reflux")`, '=NOW()'],
                ['Avg Severity (1=mild, 2=moderate, 3=severe)', `=AVERAGE(IF(${this.sheetName}!E:E="mild",1,IF(${this.sheetName}!E:E="moderate",2,IF(${this.sheetName}!E:E="severe",3,""))))`, '=NOW()'],

                // Category breakdown
                ['', '', ''],
                ['=== CATEGORY BREAKDOWN ===', '', ''],
                ['Trigger Foods', `=COUNTIF(${this.sheetName}!F:F,"Trigger Food")`, '=NOW()'],
                ['Safe Foods', `=COUNTIF(${this.sheetName}!F:F,"Safe Food")`, '=NOW()'],
                ['Trigger Drinks', `=COUNTIF(${this.sheetName}!F:F,"Trigger Drink")`, '=NOW()'],
                ['Safe Drinks', `=COUNTIF(${this.sheetName}!F:F,"Safe Drink")`, '=NOW()'],
                ['Neutral Items', `=COUNTIF(${this.sheetName}!F:F,"Neutral")`, '=NOW()'],

                // Time-of-day patterns (requires more complex logic, showing counts by hour)
                ['', '', ''],
                ['=== TIME PATTERNS (Last 7 Days) ===', '', ''],
                ['Morning Symptoms (5am-11am)', `=COUNTIFS(${this.sheetName}!C:C,"symptom",${this.sheetName}!G:G,"Breakfast") + COUNTIFS(${this.sheetName}!C:C,"reflux",${this.sheetName}!G:G,"Breakfast")`, '=NOW()'],
                ['Afternoon Symptoms (11am-5pm)', `=COUNTIFS(${this.sheetName}!C:C,"symptom",${this.sheetName}!G:G,"Lunch") + COUNTIFS(${this.sheetName}!C:C,"reflux",${this.sheetName}!G:G,"Lunch")`, '=NOW()'],
                ['Evening Symptoms (5pm-10pm)', `=COUNTIFS(${this.sheetName}!C:C,"symptom",${this.sheetName}!G:G,"Dinner") + COUNTIFS(${this.sheetName}!C:C,"reflux",${this.sheetName}!G:G,"Dinner")`, '=NOW()'],

                // Follow-up tracking
                ['', '', ''],
                ['=== FOLLOW-UP TRACKING ===', '', ''],
                ['Items Needing Follow-Up', `=COUNTIF(${this.sheetName}!I:I,"Yes")`, '=NOW()'],
                ['High Confidence Logs', `=COUNTIF(${this.sheetName}!H:H,"High")`, '=NOW()'],
                ['Low Confidence Logs (review)', `=COUNTIF(${this.sheetName}!H:H,"Low")`, '=NOW()']
            ];

            // Write the insights data
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${this.insightsSheetName}!A1`,
                valueInputOption: 'USER_ENTERED', // This allows formulas to be processed
                resource: { values: insightsData }
            });

            // Format the Insights sheet
            const insightsSheetId = await this.getInsightsSheetId();
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [
                        {
                            repeatCell: {
                                range: {
                                    sheetId: insightsSheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1
                                },
                                cell: {
                                    userEnteredFormat: {
                                        textFormat: { bold: true, fontSize: 12 },
                                        backgroundColor: { red: 0.2, green: 0.5, blue: 0.8 },
                                        horizontalAlignment: 'CENTER'
                                    }
                                },
                                fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)'
                            }
                        },
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId: insightsSheetId,
                                    gridProperties: { frozenRowCount: 1 }
                                },
                                fields: 'gridProperties.frozenRowCount'
                            }
                        }
                    ]
                }
            });

            console.log('✅ Insights sheet initialized with formulas');
        } catch (error) {
            console.error('Error initializing Insights sheet:', error);
            throw error;
        }
    }

    async getInsightsSheetId() {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId
        });

        const sheet = response.data.sheets.find(
            s => s.properties.title === this.insightsSheetName
        );

        return sheet ? sheet.properties.sheetId : null;
    }

    async clearSheet() {
        if (!this.initialized) await this.initialize();

        try {
            // Clear all data except headers - dynamically calculated range
            const lastCol = String.fromCharCode(65 + this.columnSchema.length - 1);
            await this.sheets.spreadsheets.values.clear({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A2:${lastCol}`
            });

            console.log('Cleared all data from sheet (headers preserved)');
        } catch (error) {
            console.error('Error clearing sheet:', error);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService();