/**
 * Chart Command Handler
 * Renders and sends PNG charts as Discord attachments
 */

const { AttachmentBuilder } = require('discord.js');
const { renderToBuffer } = require('../charts/ChartService');
const {
    loadIntakeBurnSeries,
    loadRefluxSeveritySeries,
    loadLatencySamples,
    loadTriggerLiftBars,
    computeQuartiles
} = require('../charts/datasets');
const {
    buildBudgetBar,
    buildIntakeBurnArea,
    buildRefluxTrend,
    buildLatencyDistribution,
    buildTriggerLiftBars
} = require('../charts/builders');

/**
 * Handle !chart command
 * @param {Object} message - Discord message
 * @param {string} args - Command arguments
 * @param {Object} deps - { googleSheets, getUserPrefs, getLogSheetNameForUser, PEYTON_ID }
 */
async function handleChart(message, args, deps) {
    const { googleSheets, getUserPrefs, getLogSheetNameForUser, PEYTON_ID } = deps;

    const userId = message.author.id;
    const isPeyton = (userId === PEYTON_ID);
    const sheetName = getLogSheetNameForUser(userId);

    // Parse args: !chart <type> [period]
    const parts = (args || '').trim().toLowerCase().split(/\s+/);
    const chartType = parts[0];
    const period = parts[1] || 'today';

    if (!chartType) {
        return message.reply('Usage: `!chart <type> [period]`\n\nTypes: budget, intake, reflux, latency, triggers\nPeriods: today, 7d, 14d, 28d, 30d\n\nExample: `!chart budget today`');
    }

    // Get user prefs for timezone
    const prefs = await getUserPrefs(userId, googleSheets);
    const tz = prefs.TZ || 'America/Los_Angeles';

    // Parse days from period
    const daysMap = { 'today': 1, '7d': 7, '14d': 14, '28d': 28, '30d': 30 };
    const days = daysMap[period] || 7;

    await message.channel.sendTyping(); // Show loading indicator

    try {
        let buffer, caption;

        switch (chartType) {
            case 'budget':
                ({ buffer, caption } = await renderBudgetChart({ googleSheets, userId, isPeyton, sheetName, tz, days }));
                break;

            case 'intake':
                ({ buffer, caption } = await renderIntakeChart({ googleSheets, userId, isPeyton, sheetName, tz, days }));
                break;

            case 'reflux':
                ({ buffer, caption } = await renderRefluxChart({ googleSheets, userId, sheetName, tz, days }));
                break;

            case 'latency':
                ({ buffer, caption } = await renderLatencyChart({ googleSheets, userId, sheetName, tz, days }));
                break;

            case 'triggers':
                ({ buffer, caption } = await renderTriggersChart({ googleSheets, userId, sheetName, tz, days }));
                break;

            default:
                return message.reply(`❌ Unknown chart type: \`${chartType}\`\n\nAvailable: budget, intake, reflux, latency, triggers`);
        }

        if (!buffer) {
            return message.reply(caption || '❌ Failed to generate chart. Please try again.');
        }

        // Send chart as attachment
        const attachment = new AttachmentBuilder(buffer, { name: 'chart.png' });
        await message.channel.send({
            content: caption,
            files: [attachment]
        });

        console.log(`[CHARTS] ✅ Sent ${chartType} chart to user ${userId}`);
    } catch (error) {
        console.error('[CHARTS] ❌ Error generating chart:', error);
        await message.reply('❌ Failed to generate chart. Please try again later.');
    }
}

/**
 * Render budget chart
 */
async function renderBudgetChart({ googleSheets, userId, isPeyton, sheetName, tz, days }) {
    const data = await loadIntakeBurnSeries({
        googleSheets,
        userId,
        sheetName,
        healthSheet: 'Health_Peyton',
        tz,
        days
    });

    if (data.intake.length === 0 || data.intake.every(v => v === 0)) {
        return {
            buffer: null,
            caption: '📊 No intake data found for this period. Start logging to see your budget!'
        };
    }

    const config = buildBudgetBar({
        labels: data.labels,
        intake: data.intake,
        burn: isPeyton ? data.burn : null,
        target: null // Could add user goal here
    });

    const buffer = await renderToBuffer(config);

    const totalIntake = data.intake.reduce((a, b) => a + b, 0);
    const totalBurn = data.burn.filter(b => b !== null).reduce((a, b) => a + b, 0);
    const hasBurn = totalBurn > 0;

    let caption = `📊 **Budget Chart**\n`;
    if (days === 1) {
        caption += `🍽️ Intake: ${totalIntake} kcal`;
        if (hasBurn) {
            const net = totalIntake - totalBurn;
            const pct = ((totalIntake / totalBurn) * 100).toFixed(0);
            caption += ` • 🔥 Burn: ${totalBurn} kcal • ⚖️ Net: ${net >= 0 ? '+' : ''}${net} (${pct}%)`;
        }
    } else {
        caption += `Last ${days} days`;
        if (hasBurn) caption += ` — intake vs burn`;
    }

    return { buffer, caption };
}

/**
 * Render intake vs burn area chart
 */
async function renderIntakeChart({ googleSheets, userId, isPeyton, sheetName, tz, days }) {
    const data = await loadIntakeBurnSeries({
        googleSheets,
        userId,
        sheetName,
        healthSheet: 'Health_Peyton',
        tz,
        days
    });

    if (data.intake.length === 0) {
        return {
            buffer: null,
            caption: '📊 No data found for this period.'
        };
    }

    const config = buildIntakeBurnArea({
        labels: data.labels,
        intake: data.intake,
        burn: isPeyton ? data.burn : null
    });

    const buffer = await renderToBuffer(config);
    const caption = `📊 **Intake vs Burn** — last ${days} days`;

    return { buffer, caption };
}

/**
 * Render reflux trend chart
 */
async function renderRefluxChart({ googleSheets, userId, sheetName, tz, days }) {
    const data = await loadRefluxSeveritySeries({
        googleSheets,
        userId,
        sheetName,
        tz,
        days
    });

    if (data.count.every(c => c === 0)) {
        return {
            buffer: null,
            caption: `📊 No reflux events in the last ${days} days. Great streak! 🎉`
        };
    }

    const config = buildRefluxTrend({
        labels: data.labels,
        count: data.count,
        avgSeverity: data.avgSeverity,
        ma7: data.ma7
    });

    const buffer = await renderToBuffer(config);

    const totalCount = data.count.reduce((a, b) => a + b, 0);
    const caption = `📊 **Reflux Trend** (${days} days) — ${totalCount} events • count & severity with MA7`;

    return { buffer, caption };
}

/**
 * Render latency distribution chart
 */
async function renderLatencyChart({ googleSheets, userId, sheetName, tz, days }) {
    const samples = await loadLatencySamples({
        googleSheets,
        userId,
        sheetName,
        tz,
        days
    });

    if (samples.length < 3) {
        return {
            buffer: null,
            caption: `📊 Not enough data yet (${samples.length} samples). Need at least 3 meal→symptom pairs.`
        };
    }

    const config = buildLatencyDistribution({ samples });
    const buffer = await renderToBuffer(config);

    const quartiles = computeQuartiles(samples);
    const caption = `📊 **Latency Distribution** (${days} days) — median ${quartiles.median} min (n=${samples.length})`;

    return { buffer, caption };
}

/**
 * Render triggers chart
 */
async function renderTriggersChart({ googleSheets, userId, sheetName, tz, days }) {
    const data = await loadTriggerLiftBars({
        googleSheets,
        userId,
        sheetName,
        tz,
        days
    });

    if (data.labels.length === 0) {
        return {
            buffer: null,
            caption: `📊 No strong trigger combinations detected (lift ≥1.3, min n=3). Keep tracking!`
        };
    }

    const config = buildTriggerLiftBars({
        labels: data.labels,
        lift: data.lift,
        counts: data.counts
    });

    const buffer = await renderToBuffer(config);
    const caption = `📊 **Trigger Combinations** (${days} days) — Top ${data.labels.length} by lift (min n=3)`;

    return { buffer, caption };
}

module.exports = {
    handleChart
};
