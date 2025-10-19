/**
 * Charts Menu - Interactive browser for available charts
 * Shows buttons to quickly generate charts
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Handle !charts menu command
 * @param {Object} message - Discord message
 */
async function handleChartsMenu(message) {
    const embed = new EmbedBuilder()
        .setColor(0x5AC8FA)
        .setTitle('📊 Available Charts')
        .setDescription('Click a button below to generate a chart, or use `!chart <type> <period>`')
        .addFields(
            {
                name: '💰 Budget',
                value: '**Today** - Intake vs Burn vs Goal\n**7d** - Weekly budget overview',
                inline: true
            },
            {
                name: '🍽️ Intake',
                value: '**7d** - 7-day intake vs burn area chart',
                inline: true
            },
            {
                name: '🔥 Reflux',
                value: '**14d** - Count, severity, and MA7 trend\n**28d** - Monthly view',
                inline: true
            },
            {
                name: '⏱️ Latency',
                value: '**30d** - Meal → symptom time distribution',
                inline: true
            },
            {
                name: '🧩 Triggers',
                value: '**30d** - Top combination lifts (min n=3)',
                inline: true
            }
        )
        .setFooter({ text: 'Charts show data from your tab only • Respects deleted entries' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('chart:budget:today')
            .setLabel('Budget Today')
            .setEmoji('💰')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('chart:budget:7d')
            .setLabel('Budget 7d')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('chart:intake:7d')
            .setLabel('Intake 7d')
            .setEmoji('🍽️')
            .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('chart:reflux:14d')
            .setLabel('Reflux 14d')
            .setEmoji('🔥')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('chart:latency:30d')
            .setLabel('Latency 30d')
            .setEmoji('⏱️')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('chart:triggers:30d')
            .setLabel('Triggers 30d')
            .setEmoji('🧩')
            .setStyle(ButtonStyle.Primary)
    );

    await message.reply({
        embeds: [embed],
        components: [row1, row2]
    });
}

/**
 * Handle chart button interactions
 * @param {Object} interaction - Discord button interaction
 * @param {Object} deps - Dependencies
 */
async function handleChartButton(interaction, deps) {
    const customId = interaction.customId;

    if (!customId.startsWith('chart:')) return;

    // Parse: chart:type:period
    const parts = customId.split(':');
    if (parts.length < 3) {
        return interaction.reply({ content: '❌ Invalid chart request.', ephemeral: true });
    }

    const chartType = parts[1];
    const period = parts[2];

    // Defer reply (charts take time to render)
    await interaction.deferReply();

    // Build args string and call chart handler
    const args = `${chartType} ${period}`;

    // Create synthetic message
    const syntheticMessage = {
        ...interaction.message,
        author: interaction.user,
        channel: interaction.channel,
        reply: async (content) => {
            if (typeof content === 'string') {
                return interaction.editReply({ content });
            }
            return interaction.editReply(content);
        }
    };

    const { handleChart } = require('./chart');
    await handleChart(syntheticMessage, args, deps);
}

module.exports = {
    handleChartsMenu,
    handleChartButton
};
