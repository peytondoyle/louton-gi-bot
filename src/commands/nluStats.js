/**
 * !nlu-stats Command
 * Show NLU performance metrics and cache stats
 */

const { EmbedBuilder } = require('discord.js');
const { getStats: getCacheStats } = require('../../services/sheetsCache');

// In-memory NLU metrics tracking
const nluMetrics = {
    totalCalls: 0,
    cacheHits: 0,
    llmFallbacks: 0,
    byIntent: {},
    lastReset: Date.now()
};

/**
 * Record NLU parse
 * @param {Object} result - Parse result with intent, confidence
 * @param {boolean} fromCache - Whether result was from cache
 * @param {boolean} usedLLM - Whether LLM fallback was used
 */
function recordNLUParse(result, { fromCache = false, usedLLM = false } = {}) {
    nluMetrics.totalCalls++;

    if (fromCache) nluMetrics.cacheHits++;
    if (usedLLM) nluMetrics.llmFallbacks++;

    const intent = result.intent || 'unknown';
    if (!nluMetrics.byIntent[intent]) {
        nluMetrics.byIntent[intent] = {
            count: 0,
            avgConfidence: 0,
            confidenceSum: 0
        };
    }

    nluMetrics.byIntent[intent].count++;
    nluMetrics.byIntent[intent].confidenceSum += (result.confidence || 0);
    nluMetrics.byIntent[intent].avgConfidence =
        nluMetrics.byIntent[intent].confidenceSum / nluMetrics.byIntent[intent].count;
}

/**
 * Handle !nlu-stats command
 * @param {Object} message - Discord message
 */
async function handleNLUStats(message) {
    try {
        // Get V2 metrics
        let v2Report = null;
        try {
            const { getReport } = require('../nlu/metrics-v2');
            v2Report = getReport();
        } catch (e) {
            // V2 metrics not available
        }

        const cacheStats = getCacheStats();
        const uptime = Date.now() - nluMetrics.lastReset;
        const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(1);

        // Calculate cache hit rate
        const cacheHitRate = nluMetrics.totalCalls > 0
            ? ((nluMetrics.cacheHits / nluMetrics.totalCalls) * 100).toFixed(1)
            : 0;

        // Calculate LLM call rate
        const llmCallRate = nluMetrics.totalCalls > 0
            ? ((nluMetrics.llmFallbacks / nluMetrics.totalCalls) * 100).toFixed(1)
            : 0;

        // Build intent breakdown
        const intentBreakdown = Object.entries(nluMetrics.byIntent)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10) // Top 10
            .map(([intent, stats]) => {
                const pct = ((stats.count / nluMetrics.totalCalls) * 100).toFixed(1);
                const conf = (stats.avgConfidence * 100).toFixed(0);
                return `• **${intent}**: ${stats.count} (${pct}%) • ~${conf}% conf`;
            })
            .join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('📊 NLU Performance Stats')
            .setDescription(`Metrics since last reset (${uptimeHours}h ago)`)
            .addFields(
                {
                    name: '🧠 NLU Calls',
                    value: `Total: ${nluMetrics.totalCalls}\nCache hits: ${nluMetrics.cacheHits} (${cacheHitRate}%)\nLLM fallbacks: ${nluMetrics.llmFallbacks} (${llmCallRate}%)`,
                    inline: true
                },
                {
                    name: '💾 Cache Stats',
                    value: `Keys: ${cacheStats.keys}\nHits: ${cacheStats.hits}\nMisses: ${cacheStats.misses}\nSize: ~${Math.round(cacheStats.vsize / 1024)}KB`,
                    inline: true
                }
            )
            .setTimestamp();

        if (intentBreakdown) {
            embed.addFields({
                name: '🎯 Intent Breakdown (Top 10)',
                value: intentBreakdown || 'No data yet',
                inline: false
            });
        }

        // Add V2 metrics if available
        if (v2Report) {
            const v2Summary =
                `**Acceptance**: Strict ${v2Report.acceptance.strict}, Lenient ${v2Report.acceptance.lenient}\n` +
                `**Rescued**: ${v2Report.rescued.total} (${v2Report.rescued.pct}) - swap:${v2Report.rescued.swap}, beverage:${v2Report.rescued.beverage}, llm:${v2Report.rescued.llm}\n` +
                `**Clarified**: ${v2Report.clarified} | **Rejected**: ${v2Report.rejected}\n` +
                `**LLM Rate**: ${v2Report.llm.rate} (target: ${v2Report.llm.target})`;

            embed.addFields({
                name: '🚀 NLU V2 Coverage',
                value: v2Summary,
                inline: false
            });
        }

        embed.setFooter({ text: 'Use /reset-stats to clear metrics' });

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[NLU-STATS] Error:', error);
        await message.reply('❌ Failed to generate NLU stats.');
    }
}

/**
 * Reset NLU metrics
 */
function resetNLUMetrics() {
    nluMetrics.totalCalls = 0;
    nluMetrics.cacheHits = 0;
    nluMetrics.llmFallbacks = 0;
    nluMetrics.byIntent = {};
    nluMetrics.lastReset = Date.now();
    console.log('[NLU-STATS] Metrics reset');
}

module.exports = {
    handleNLUStats,
    recordNLUParse,
    resetNLUMetrics,
    nluMetrics
};
