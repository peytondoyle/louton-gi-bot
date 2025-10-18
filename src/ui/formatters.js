// UI Formatters: Progress bars, trend chips, section blocks, lists
// Provides visual formatting utilities for Discord messages

const { UX, EMOJI } = require('../constants/ux');

/**
 * Create a text-based progress bar
 * @param {number} percentage - Value between 0 and 100
 * @param {number} width - Number of blocks in the bar (default: 5)
 * @returns {string} Progress bar like "▮▮▮▯▯ 60%"
 *
 * @example
 * progressBar(60) // "▮▮▮▯▯ 60%"
 * progressBar(100, 10) // "▮▮▮▮▮▮▮▮▮▮ 100%"
 */
function progressBar(percentage, width = 5) {
    const clampedPct = Math.max(0, Math.min(100, percentage));
    const filled = Math.round((clampedPct / 100) * width);
    const empty = width - filled;

    const filledBlocks = '▮'.repeat(filled);
    const emptyBlocks = '▯'.repeat(empty);

    return `${filledBlocks}${emptyBlocks} ${Math.round(clampedPct)}%`;
}

/**
 * Create a trend indicator chip with emoji
 * @param {number} deltaPct - Percentage change (positive = improvement, negative = decline)
 * @returns {string} Colored circle emoji + trend text
 *
 * @example
 * trendChip(15) // "🟢 +15% improvement"
 * trendChip(-5) // "🟡 -5% (stable)"
 * trendChip(-20) // "🔴 -20% decline"
 */
function trendChip(deltaPct) {
    const rounded = Math.round(deltaPct);

    if (deltaPct >= 10) {
        return `🟢 +${rounded}% improvement`;
    } else if (deltaPct <= -10) {
        return `🔴 ${rounded}% decline`;
    } else {
        return `🟡 ${rounded >= 0 ? '+' : ''}${rounded}% (stable)`;
    }
}

/**
 * Create a formatted section with title and body
 * @param {string} title - Section title (will be bolded)
 * @param {string} body - Section content
 * @returns {string} Formatted markdown section
 *
 * @example
 * section("Overview", "7 days tracked, 4 symptom-free")
 * // **Overview**
 * // 7 days tracked, 4 symptom-free
 */
function section(title, body) {
    return `**${title}**\n${body}`;
}

/**
 * Create a formatted list with max item limit
 * @param {string[]} items - Array of items to list
 * @param {number} max - Maximum items to show (default: UX.MAX_SECTION_LINES)
 * @returns {string} Formatted list with "… and N more" if truncated
 *
 * @example
 * list(["Coffee", "Citrus", "Tomato", "Dairy", "Spicy"], 3)
 * // • Coffee
 * // • Citrus
 * // • Tomato
 * // … and 2 more
 */
function list(items, max = UX.MAX_SECTION_LINES) {
    if (!items || items.length === 0) return '• None';

    const displayItems = items.slice(0, max);
    const remaining = items.length - max;

    let result = displayItems.map(item => `• ${item}`).join('\n');

    if (remaining > 0) {
        result += `\n… and ${remaining} more`;
    }

    return result;
}

/**
 * Create a key-value pair line with bold label
 * @param {string} label - The label text
 * @param {string|number} value - The value to display
 * @returns {string} Formatted "**Label:** value"
 *
 * @example
 * kv("Days Tracked", 7) // "**Days Tracked:** 7"
 * kv("Symptom-Free Days", "4 days") // "**Symptom-Free Days:** 4 days"
 */
function kv(label, value) {
    return `**${label}:** ${value}`;
}

/**
 * Create a mini-stats block (multiple KVs in one line)
 * @param {Object} stats - Object with label: value pairs
 * @returns {string} Formatted stats in grid-like structure
 *
 * @example
 * miniStats({ "Logged": 42, "Symptoms": 8, "Streak": "5 days" })
 * // **Logged:** 42  |  **Symptoms:** 8  |  **Streak:** 5 days
 */
function miniStats(stats) {
    return Object.entries(stats)
        .map(([label, value]) => `**${label}:** ${value}`)
        .join('  |  ');
}

/**
 * Format a trigger item with count and emoji
 * @param {string} name - Trigger name
 * @param {number} count - Number of occurrences
 * @param {string} type - Type of trigger (food/drink)
 * @returns {string} Formatted trigger line
 *
 * @example
 * formatTrigger("Coffee", 5, "drink") // "💧 Coffee (5×)"
 */
function formatTrigger(name, count, type = 'food') {
    const emoji = type === 'drink' ? EMOJI.drink : EMOJI.food;
    return `${emoji} **${name}** (${count}×)`;
}

/**
 * Format a time range for display
 * @param {string} start - Start time
 * @param {string} end - End time
 * @returns {string} Formatted time range
 *
 * @example
 * timeRange("5am", "11am") // "5am–11am"
 */
function timeRange(start, end) {
    return `${start}–${end}`;
}

/**
 * Create a divider line
 * @returns {string} Visual divider
 */
function divider() {
    return UX.DIVIDER;
}

/**
 * Format a severity level with visual indicator
 * @param {string} severity - mild, moderate, or severe
 * @returns {string} Severity with emoji indicator
 *
 * @example
 * severityBadge("mild") // "🟢 Mild"
 * severityBadge("severe") // "🔴 Severe"
 */
function severityBadge(severity) {
    if (!severity) return '⚪ Unknown';

    const lower = severity.toLowerCase();
    const badges = {
        mild: '🟢 Mild',
        moderate: '🟡 Moderate',
        severe: '🔴 Severe'
    };

    return badges[lower] || '⚪ Unknown';
}

/**
 * Format a count with proper pluralization
 * @param {number} count - The count
 * @param {string} singular - Singular form
 * @param {string} plural - Plural form (optional, will add 's' if not provided)
 * @returns {string} Formatted count with word
 *
 * @example
 * pluralize(1, "symptom") // "1 symptom"
 * pluralize(5, "symptom") // "5 symptoms"
 * pluralize(1, "entry", "entries") // "1 entry"
 */
function pluralize(count, singular, plural = null) {
    if (count === 1) return `${count} ${singular}`;
    return `${count} ${plural || singular + 's'}`;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

module.exports = {
    progressBar,
    trendChip,
    section,
    list,
    kv,
    miniStats,
    formatTrigger,
    timeRange,
    divider,
    severityBadge,
    pluralize,
    truncate
};
