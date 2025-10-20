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
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(BUTTON_IDS.symptomReflux).setLabel('Reflux').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.symptomPain).setLabel('Pain').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.symptomBloat).setLabel('Bloating').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.symptomNausea).setLabel('Nausea').setStyle(ButtonStyle.Secondary),
        );
}

/**
 * Build meal time clarification buttons
 * @returns {ActionRowBuilder} Button row for meal times
 *
 * Used when user logs food/drink without specifying when
 */
function buttonsMealTime() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(BUTTON_IDS.mealBreakfast).setLabel('Breakfast').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.mealLunch).setLabel('Lunch').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.mealDinner).setLabel('Dinner').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.mealSnack).setLabel('Snack').setStyle(ButtonStyle.Secondary),
        );
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
            new ButtonBuilder().setCustomId(BUTTON_IDS.bristol1).setLabel('1').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.bristol2).setLabel('2').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.bristol3).setLabel('3').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.bristol4).setLabel('4').setStyle(ButtonStyle.Success),
        );
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(BUTTON_IDS.bristol5).setLabel('5').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.bristol6).setLabel('6').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.bristol7).setLabel('7').setStyle(ButtonStyle.Secondary),
        );
    return [row1, row2];
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
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity1).setLabel('1').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity2).setLabel('2').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity3).setLabel('3').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity4).setLabel('4').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity5).setLabel('5').setStyle(ButtonStyle.Success),
        );
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity6).setLabel('6').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity7).setLabel('7').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity8).setLabel('8').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity9).setLabel('9').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(BUTTON_IDS.severity10).setLabel('10').setStyle(ButtonStyle.Danger),
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
 * Build intent clarification buttons
 * @returns {ActionRowBuilder} Button row for clarifying user intent
 *
 * Used when NLU confidence is low or intent is 'other'
 */
function buttonsIntentClarification() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(BUTTON_IDS.intentLogFood).setLabel('Log Food').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(BUTTON_IDS.intentLogSymptom).setLabel('Log Symptom').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_IDS.intentCancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
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

/**
 * Builds the main conversational help embed and buttons.
 * @returns {{embeds: import('discord.js').EmbedBuilder[], components: import('discord.js').ActionRowBuilder[]}}
 */
function buildConversationalHelp() {
    const helpEmbed = new EmbedBuilder()
        .setColor('#5865F2') // Discord blurple
        .setTitle('👋 Hi there! I\'m your conversational GI tracker.')
        .setDescription(
            "You can talk to me just like you're sending a text. Here are the main things I can do:"
        )
        .addFields(
            {
                name: '📝 Log Anything',
                value: 'Just tell me what you ate, what symptoms you\'re feeling, or how your mood is.\n*e.g., "I had a big salad for lunch"*\n*e.g., "Ugh, I have a bad headache"*',
                inline: false,
            },
            {
                name: '🧠 Ask Me Questions',
                value: 'I can analyze your data and give you answers in plain English.\n*e.g., "How many times did I have reflux last week?"*\n*e.g., "What did I eat before I got bloated on Tuesday?"*',
                inline: false,
            },
            {
                name: '⚙️ Manage Your Settings',
                value: 'You can control your reminders and preferences just by asking.\n*e.g., "Turn on my reminders" or "Show me my settings"*',
                inline: false,
            }
        )
        .setFooter({ text: 'Click the buttons below for more examples!' });

    const helpButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.helpLogging)
                .setLabel('Logging Examples')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💡'),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.helpAsking)
                .setLabel('Asking Questions')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('❓'),
            new ButtonBuilder()
                .setCustomId(BUTTON_IDS.helpSettings)
                .setLabel('My Settings')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚙️'),
        );

    return { embeds: [helpEmbed], components: [helpButtons] };
}


module.exports = {
    buildEmbed,
    divider,
    buttonsSymptomType,
    buttonsMealTime,
    buttonsBristol,
    buttonsSeverity,
    buttonsCheckIn,
    buttonsIntentClarification,
    buttonUndo,
    buttonDismiss,
    successEmbed,
    errorEmbed,
    cautionEmbed,
    buildConversationalHelp
};
