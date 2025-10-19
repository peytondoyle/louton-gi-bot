/**
 * Formatting Helpers for Insights
 * Tiny formatters for displaying metrics
 */

/**
 * Format trend label with emoji chip
 * @param {string} label - 'improving', 'stable', or 'worsening'
 * @returns {string} - Formatted chip
 */
function trendChip(label) {
    const chips = {
        improving: '🟢 Improving',
        stable: '🟠 Stable',
        worsening: '🔴 Worsening'
    };

    return chips[label] || '⚪ Unknown';
}

/**
 * Create a progress bar from 0-1 percentage
 * @param {number} pct - Percentage (0-1)
 * @returns {string} - Progress bar with 5 blocks
 */
function progressBar(pct) {
    if (pct === null || isNaN(pct)) return '▯▯▯▯▯';

    const clamped = Math.max(0, Math.min(1, pct));
    const filled = Math.round(clamped * 5);

    return '▮'.repeat(filled) + '▯'.repeat(5 - filled);
}

/**
 * Format key-value pair with alignment
 * @param {string} label - Label text
 * @param {*} value - Value to display
 * @returns {string} - Formatted string
 */
function kv(label, value) {
    return `**${label}:** ${value}`;
}

/**
 * Format number with thousands separator
 * @param {number} n - Number to format
 * @returns {string} - Formatted number
 */
function num(n) {
    if (n === null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString();
}

/**
 * Format percentage
 * @param {number} n - Decimal (0-1) or percentage (0-100)
 * @param {boolean} isDecimal - True if n is 0-1, false if 0-100
 * @returns {string} - Formatted percentage
 */
function pct(n, isDecimal = true) {
    if (n === null || isNaN(n)) return '—';

    const value = isDecimal ? n * 100 : n;
    return `${Math.round(value)}%`;
}

module.exports = {
    trendChip,
    progressBar,
    kv,
    num,
    pct
};
