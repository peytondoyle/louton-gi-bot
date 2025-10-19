/**
 * NLU Metrics & Coverage Tracking V2
 * Monitors acceptance rates, LLM usage, rescue effectiveness
 */

const metrics = {
    total: 0,
    accepted: { strict: 0, lenient: 0, minimal: 0 },
    rescued: { swap: 0, beverage: 0, llm: 0 },
    clarified: 0,
    rejected: 0,
    llmCalls: 0,
    llmCacheHits: 0,
    byIntent: {},
    startTime: Date.now()
};

function record(parseResult) {
    metrics.total++;

    // Track by intent
    const intent = parseResult.intent || 'unknown';
    if (!metrics.byIntent[intent]) {
        metrics.byIntent[intent] = { count: 0, avgConf: 0, confSum: 0 };
    }
    metrics.byIntent[intent].count++;
    metrics.byIntent[intent].confSum += (parseResult.confidence || 0);
    metrics.byIntent[intent].avgConf = metrics.byIntent[intent].confSum / metrics.byIntent[intent].count;

    // Track decision
    const decision = parseResult.decision || 'unknown';
    if (decision === 'strict') metrics.accepted.strict++;
    if (decision === 'lenient') metrics.accepted.lenient++;
    if (decision === 'minimal_core') metrics.accepted.minimal++;
    if (decision.startsWith('rescued')) {
        if (decision.includes('swap')) metrics.rescued.swap++;
        if (decision.includes('beverage')) metrics.rescued.beverage++;
        if (decision.includes('llm')) metrics.rescued.llm++;
    }
    if (decision === 'needs_clarification') metrics.clarified++;
    if (decision === 'rejected') metrics.rejected++;
}

function recordLLMCall(cacheHit = false) {
    metrics.llmCalls++;
    if (cacheHit) metrics.llmCacheHits++;
}

function getReport() {
    const total = metrics.total || 1; // Avoid division by zero

    return {
        total: metrics.total,
        uptime: ((Date.now() - metrics.startTime) / (1000 * 60 * 60)).toFixed(1) + 'h',

        acceptance: {
            strict: `${metrics.accepted.strict} (${((metrics.accepted.strict / total) * 100).toFixed(1)}%)`,
            lenient: `${metrics.accepted.lenient} (${((metrics.accepted.lenient / total) * 100).toFixed(1)}%)`,
            minimal: `${metrics.accepted.minimal} (${((metrics.accepted.minimal / total) * 100).toFixed(1)}%)`
        },

        rescued: {
            swap: metrics.rescued.swap,
            beverage: metrics.rescued.beverage,
            llm: metrics.rescued.llm,
            total: metrics.rescued.swap + metrics.rescued.beverage + metrics.rescued.llm,
            pct: (((metrics.rescued.swap + metrics.rescued.beverage + metrics.rescued.llm) / total) * 100).toFixed(1) + '%'
        },

        clarified: `${metrics.clarified} (${((metrics.clarified / total) * 100).toFixed(1)}%)`,
        rejected: `${metrics.rejected} (${((metrics.rejected / total) * 100).toFixed(1)}%)`,

        llm: {
            calls: metrics.llmCalls,
            cacheHits: metrics.llmCacheHits,
            rate: ((metrics.llmCalls / total) * 100).toFixed(1) + '%',
            target: '≤25%'
        },

        byIntent: Object.entries(metrics.byIntent)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .map(([intent, stats]) => ({
                intent,
                count: stats.count,
                pct: ((stats.count / total) * 100).toFixed(1) + '%',
                avgConf: (stats.avgConf * 100).toFixed(0) + '%'
            }))
    };
}

function reset() {
    metrics.total = 0;
    metrics.accepted = { strict: 0, lenient: 0, minimal: 0 };
    metrics.rescued = { swap: 0, beverage: 0, llm: 0 };
    metrics.clarified = 0;
    metrics.rejected = 0;
    metrics.llmCalls = 0;
    metrics.llmCacheHits = 0;
    metrics.byIntent = {};
    metrics.startTime = Date.now();
}

module.exports = {
    record,
    recordLLMCall,
    getReport,
    reset
};
