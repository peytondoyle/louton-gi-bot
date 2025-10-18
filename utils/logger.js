const fs = require('fs').promises;
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { parse } = require('csv-parse/sync');
const moment = require('moment');

class Logger {
    constructor() {
        this.logsDir = path.join(__dirname, '..', 'logs');
        this.ensureLogsDirectory();
    }

    async ensureLogsDirectory() {
        try {
            await fs.mkdir(this.logsDir, { recursive: true });
        } catch (error) {
            console.error('Error creating logs directory:', error);
        }
    }

    getFileName() {
        const now = moment();
        return path.join(this.logsDir, `symptoms_${now.format('YYYY_MM')}.csv`);
    }

    async logEntry(entry) {
        const fileName = this.getFileName();

        // Check if file exists
        let fileExists = false;
        try {
            await fs.access(fileName);
            fileExists = true;
        } catch {
            fileExists = false;
        }

        // Create CSV writer
        const csvWriter = createCsvWriter({
            path: fileName,
            header: [
                { id: 'timestamp', title: 'Timestamp' },
                { id: 'user', title: 'User' },
                { id: 'type', title: 'Type' },
                { id: 'value', title: 'Value' },
                { id: 'severity', title: 'Severity' },
                { id: 'notes', title: 'Notes' }
            ],
            append: fileExists
        });

        try {
            await csvWriter.writeRecords([entry]);
            console.log(`Logged entry: ${entry.type} for ${entry.user}`);
            return true;
        } catch (error) {
            console.error('Error logging entry:', error);
            return false;
        }
    }

    async getEntriesByDate(date, userName = null) {
        const fileName = this.getFileName();

        try {
            const fileContent = await fs.readFile(fileName, 'utf-8');
            const records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true
            });

            // Filter by date and optionally by user
            const targetDate = moment(date).format('YYYY-MM-DD');
            return records.filter(record => {
                const recordDate = moment(record.timestamp).format('YYYY-MM-DD');
                const dateMatch = recordDate === targetDate;
                const userMatch = userName ? record.user === userName : true;
                return dateMatch && userMatch;
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return []; // File doesn't exist yet
            }
            console.error('Error reading entries:', error);
            return [];
        }
    }

    async getEntriesDateRange(startDate, endDate, userName = null) {
        const fileName = this.getFileName();

        try {
            const fileContent = await fs.readFile(fileName, 'utf-8');
            const records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true
            });

            // Filter by date range and optionally by user
            const start = moment(startDate);
            const end = moment(endDate);

            return records.filter(record => {
                const recordDate = moment(record.timestamp);
                const dateMatch = recordDate.isBetween(start, end, null, '[]');
                const userMatch = userName ? record.user === userName : true;
                return dateMatch && userMatch;
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return []; // File doesn't exist yet
            }
            console.error('Error reading entries:', error);
            return [];
        }
    }

    async getAllEntries(userName = null) {
        const fileName = this.getFileName();

        try {
            const fileContent = await fs.readFile(fileName, 'utf-8');
            const records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true
            });

            if (userName) {
                return records.filter(record => record.user === userName);
            }
            return records;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return []; // File doesn't exist yet
            }
            console.error('Error reading all entries:', error);
            return [];
        }
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
}

module.exports = new Logger();