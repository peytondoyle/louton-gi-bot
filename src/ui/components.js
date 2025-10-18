// UI Components: Embeds, Buttons, Action Rows
// Provides Discord.js component builders for consistent UI

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, BUTTON_IDS, BUTTON_LABELS, UX } = require('../constants/ux');

/**
 * Build a standardized embed
 * @param {Object} options - Embed configuration
 * @param {string} options.title - Embed title
 * @param {string} options.description - Embed description/body
 * @param {number} options.color - Discord color integer (from COLORS)
 * @param {string} options.footer - Footer text
 * @param {Array} options.fields - Array of {name, value, inline} field objects
 * @returns {EmbedBuilder} Discord embed
 *
 * @example
 * buildEmbed({
 *   title: "Weekly Summary",
 *   description: "Here's your week at a glance",
 *   color: COLORS.info,
 *   footer: "Week of Oct 14"
 * })
 */
function buildEmbed({ title, description, color = COLORS.info, footer, fields = [] }) {
    const embed = new EmbedBuilder()
        .setColor(color);

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (footer) embed.setFooter({ text: footer });
    if (fields && fields.length > 0) embed.addFields(fields);

    return embed;
}

/**
 * Create a divider line for message formatting
 * @returns {string} Divider string
 */
function divider() {
    return UX.DIVIDER;
}

/**
 * Build symptom type clarification buttons
 * @returns {ActionRowBuilder} Button row for symptom types
 *
 * Used when user reports vague symptom and we need clarification
 */
function buttonsSymptomType() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.symptom.reflux)
                .setLabel(BUTTON_LABELS.symptom.reflux)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.symptom.pain)
                .setLabel(BUTTON_LABELS.symptom.pain)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.symptom.bloat)
                .setLabel(BUTTON_LABELS.symptom.bloat)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.symptom.nausea)
                .setLabel(BUTTON_LABELS.symptom.nausea)
                .setStyle(ButtonStyle.Primary)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.symptom.general)
                .setLabel(BUTTON_LABELS.symptom.general)
                .setStyle(ButtonStyle.Secondary)
        );

    return [row, row2];
}

/**
 * Build meal time clarification buttons
 * @returns {ActionRowBuilder} Button row for meal times
 *
 * Used when user logs food/drink without specifying when
 */
function buttonsMealTime() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.meal.breakfast)
                .setLabel(BUTTON_LABELS.meal.breakfast)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.meal.lunch)
                .setLabel(BUTTON_LABELS.meal.lunch)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.meal.dinner)
                .setLabel(BUTTON_LABELS.meal.dinner)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.meal.snack)
                .setLabel(BUTTON_LABELS.meal.snack)
                .setStyle(ButtonStyle.Secondary)
        );

    return [row];
}

/**
 * Build Bristol scale buttons for BM entries
 * @returns {ActionRowBuilder[]} Button rows for Bristol scale (1-7)
 *
 * Used when user mentions bathroom/BM without details
 */
function buttonsBristol() {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.bristol[1])
                .setLabel(BUTTON_LABELS.bristol[1])
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.bristol[2])
                .setLabel(BUTTON_LABELS.bristol[2])
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.bristol[3])
                .setLabel(BUTTON_LABELS.bristol[3])
                .setStyle(ButtonStyle.Success)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.bristol[4])
                .setLabel(BUTTON_LABELS.bristol[4])
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.bristol[5])
                .setLabel(BUTTON_LABELS.bristol[5])
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.bristol[6])
                .setLabel(BUTTON_LABELS.bristol[6])
                .setStyle(ButtonStyle.Primary)
        );

    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.bristol[7])
                .setLabel(BUTTON_LABELS.bristol[7])
                .setStyle(ButtonStyle.Danger)
        );

    return [row1, row2, row3];
}

/**
 * Build severity rating buttons (1-10)
 * @returns {ActionRowBuilder[]} Button rows for severity (1-10)
 *
 * Used after symptom type is clarified
 */
function buttonsSeverity() {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[1])
                .setLabel('1')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[2])
                .setLabel('2')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[3])
                .setLabel('3')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[4])
                .setLabel('4')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[5])
                .setLabel('5')
                .setStyle(ButtonStyle.Primary)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[6])
                .setLabel('6')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[7])
                .setLabel('7')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[8])
                .setLabel('8')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[9])
                .setLabel('9')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.severity[10])
                .setLabel('10')
                .setStyle(ButtonStyle.Danger)
        );

    return [row1, row2];
}

/**
 * Build morning check-in buttons
 * @returns {ActionRowBuilder} Button row for morning check-in
 *
 * Used in daily AM digest to quickly log baseline
 */
function buttonsCheckIn() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.checkin.good)
                .setLabel(BUTTON_LABELS.checkin.good)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.checkin.okay)
                .setLabel(BUTTON_LABELS.checkin.okay)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.checkin.bad)
                .setLabel(BUTTON_LABELS.checkin.bad)
                .setStyle(ButtonStyle.Danger)
        );

    return [row];
}

/**
 * Build undo button
 * @returns {ActionRowBuilder} Button for undoing last entry
 */
function buttonUndo() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.undo)
                .setLabel(BUTTON_LABELS.undo)
                .setStyle(ButtonStyle.Danger)
        );

    return [row];
}

/**
 * Build dismiss button
 * @returns {ActionRowBuilder} Button for dismissing ephemeral messages
 */
function buttonDismiss() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.dismiss)
                .setLabel(BUTTON_LABELS.dismiss)
                .setStyle(ButtonStyle.Secondary)
        );

    return [row];
}

/**
 * Build a success confirmation embed
 * @param {string} message - Success message
 * @param {Object} details - Optional details to display
 * @returns {EmbedBuilder} Success embed
 */
function successEmbed(message, details = null) {
    const embed = buildEmbed({
        title: '✅ Success',
        description: message,
        color: COLORS.success
    });

    if (details) {
        const fields = Object.entries(details).map(([key, value]) => ({
            name: key,
            value: String(value),
            inline: true
        }));
        embed.addFields(fields);
    }

    return embed;
}

/**
 * Build an error embed
 * @param {string} message - Error message
 * @returns {EmbedBuilder} Error embed
 */
function errorEmbed(message) {
    return buildEmbed({
        title: '😅 Oops',
        description: message,
        color: COLORS.error
    });
}

/**
 * Build a caution/warning embed
 * @param {string} message - Warning message
 * @returns {EmbedBuilder} Warning embed
 */
function cautionEmbed(message) {
    return buildEmbed({
        title: '⚠️ Heads-up',
        description: message,
        color: COLORS.caution
    });
}

module.exports = {
    buildEmbed,
    divider,
    buttonsSymptomType,
    buttonsMealTime,
    buttonsBristol,
    buttonsSeverity,
    buttonsCheckIn,
    buttonUndo,
    buttonDismiss,
    successEmbed,
    errorEmbed,
    cautionEmbed
};
