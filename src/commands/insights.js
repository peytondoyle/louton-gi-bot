/**
 * !insights Command
 * Comprehensive health insights for the user
 */

const { EmbedBuilder } = require('discord.js');
const { loadUserRows, loadHealthRows, todayWindow } = require('../insights/loaders');
const {
    sumIntakeKcal,
    getBurnForDate,
    budgetBar,
    computeLatencyMinutes,
    computeRefluxStats,
    mineCombinations,
    computeStreak
} = require('../insights/metrics');
const { trendChip, num, pct } = require('../insights/format');

/**
 * Handle !insights command
 * @param {Object} message - Discord message
 * @param {Object} deps - Dependencies { googleSheets, getUserName, getLogSheetNameForUser, PEYTON_ID }
 */
async function handleInsights(message, deps) {
    const { googleSheets, getUserName, getLogSheetNameForUser, PEYTON_ID } = deps;

    const userId = message.author.id;
    const userName = getUserName(message.author.username);
    const sheetName = getLogSheetNameForUser(userId);
    const isPeyton = (userId === PEYTON_ID);

    console.log(`[INSIGHTS] Starting insights for ${userName} (${sheetName})`);
    const overallStart = Date.now();

    try {
        // ========== LOAD DATA ==========
        const loadStart = Date.now();

        const [userRows, healthMap] = await Promise.all([
            loadUserRows(googleSheets, userName, sheetName, { sinceDays: 30 }),
            isPeyton ? loadHealthRows(googleSheets, { sinceDays: 30 }) : Promise.resolve(new Map())
        ]);

        console.log(`[INSIGHTS] Loaded data in ${Date.now() - loadStart}ms`);

        if (userRows.length === 0) {
            return message.reply('No data found for insights. Start tracking to see your patterns!');
        }

        // ========== COMPUTE METRICS ==========
        const computeStart = Date.now();

        const tz = process.env.TIMEZONE || 'America/Los_Angeles';
        const { dateStr: today } = todayWindow(tz);

        // Budget (today)
        const intake = sumIntakeKcal(userRows, today);
        const burn = isPeyton ? getBurnForDate(healthMap, today) : null;
        const budget = budgetBar(intake, burn);

        // Latency
        const latency = computeLatencyMinutes(userRows);

        // Trends
        const trends = computeRefluxStats(userRows, { days: 14 });

        // Combinations
        const combos = mineCombinations(userRows);

        // Streak
        const streak = computeStreak(userRows);

        console.log(`[INSIGHTS] Computed metrics in ${Date.now() - computeStart}ms`);

        // ========== BUILD EMBED ==========
        const renderStart = Date.now();

        const embed = new EmbedBuilder()
            .setColor(0x4A90E2)
            .setTitle('📊 Your Health Insights')
            .setTimestamp()
            .setFooter({ text: 'Data from your tab only • Deleted rows excluded • Window: last 30 days' });

        const lines = [];

        // Line 1: Budget
        if (intake > 0 || burn) {
            if (burn) {
                lines.push(`🍽 **Budget**: ${num(intake)} / ${num(burn)} kcal  •  ${budget.bar} ${pct(budget.pct)}`);
            } else {
                lines.push(`🍽 **Intake**: ${num(intake)} kcal`);
            }
        }

        // Line 2: Latency
        if (latency.medianMinutes !== null) {
            lines.push(`⏱ **Latency**: median ${latency.medianMinutes} min (n=${latency.samples})`);
        } else {
            lines.push(`⏱ **Latency**: no data yet`);
        }

        // Line 3: Trends
        const trendCountChip = trendChip(trends.labelCount);
        const trendSeverityChip = trendChip(trends.labelSeverity);
        lines.push(`📈 **Trends**: Count — ${trendCountChip} • Severity — ${trendSeverityChip}`);

        // Line 4: Combinations
        if (combos.length > 0) {
            const comboStr = combos
                .map(c => `${c.label} (${c.count}) • lift ${c.lift}`)
                .join(' | ');
            lines.push(`🧩 **Combos**: ${comboStr}`);
        } else {
            lines.push(`🧩 **Combos**: not enough data yet`);
        }

        // Line 5: Streak
        if (streak.symptomFreeDays > 0) {
            const milestoneStr = streak.milestones.length > 0
                ? ` (milestones: ${streak.milestones.join(', ')})`
                : '';
            lines.push(`🏁 **Streak**: ${streak.symptomFreeDays} symptom-free day${streak.symptomFreeDays > 1 ? 's' : ''}${milestoneStr}`);
        } else {
            lines.push(`🏁 **Streak**: 0 days (keep tracking!)`);
        }

        embed.setDescription(lines.join('\n'));

        console.log(`[INSIGHTS] Rendered embed in ${Date.now() - renderStart}ms`);
        console.log(`[INSIGHTS] Total time: ${Date.now() - overallStart}ms`);

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[INSIGHTS] Error:', error);
        await message.reply('❌ Failed to generate insights. Please try again later.');
    }
}

module.exports = { handleInsights };
