const moment = require('moment-timezone');
const chrono = require('chrono-node');

const DEFAULT_TZ = 'America/New_York';

const time = {
    /**
     * Parses a natural language string to find a date.
     * @param {string} text - The input string (e.g., "last tuesday at 5pm").
     * @param {string} [tz] - The IANA timezone to interpret the date in.
     * @returns {Date|null} A JavaScript Date object, or null if parsing fails.
     */
    parse(text, tz = DEFAULT_TZ) {
        // We provide a reference date to chrono to help it parse relative times like "yesterday".
        const referenceDate = moment().tz(tz).toDate();
        const results = chrono.parse(text, referenceDate, { forwardDate: true });
        return results.length > 0 ? results[0].start.date() : null;
    },

    /**
     * Gets the current moment object in a specific timezone.
     * @param {string} [tz] - The IANA timezone.
     * @returns {moment.Moment} A moment object.
     */
    now(tz = DEFAULT_TZ) {
        return moment().tz(tz);
    },

    /**
     * Formats a date into a string.
     * @param {Date|string|moment.Moment} date - The date to format.
     * @param {string} formatStr - The format string (e.g., 'YYYY-MM-DD HH:mm').
     * @param {string} [tz] - The IANA timezone to format the date in.
     * @returns {string} The formatted date string.
     */
    format(date, formatStr, tz = DEFAULT_TZ) {
        return moment(date).tz(tz).format(formatStr);
    },

    /**
     * Provides a reference to the moment library for more complex operations.
     */
    moment: moment,
};

module.exports = time;
