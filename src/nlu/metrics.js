/**
 * NLU V2 Metrics System
 * Tracks acceptance rates, LLM usage, and performance metrics
 */

// In-memory metrics storage
const metrics = {
    counters: {
        total_requests: 0,
        strict_accept: 0,
        lenient_accept: 0,
        rescued_accept: 0,
        llm_used: 0,
        llm_success: 0,
        llm_timeout: 0,
        rejected: 0,
        clarification_requested: 0
    },
    timings: {
        rules_parse_time: [],
        llm_parse_time: [],
        total_parse_time: []
    },
    errors: {
        rules_errors: 0,
        llm_errors: 0,
        timeout_errors: 0,
        validation_errors: 0
    },
    intents: {
        food: 0,
        drink: 0,
        symptom: 0,
        reflux: 0,
        bm: 0,
        mood: 0,
        checkin: 0,
        other: 0
    },
    confidence_ranges: {
        '0.0-0.5': 0,
        '0.5-0.6': 0,
        '0.6-0.7': 0,
        '0.7-0.8': 0,
        '0.8-0.9': 0,
        '0.9-1.0': 0
    }
};

/**
 * Record NLU parse metrics
 * @param {Object} result - Parse result
 * @param {Object} options - Parse options
 */
function record(result, options = {}) {
    if (!result) return;
    
    // Increment total requests
    metrics.counters.total_requests++;
    
    // Record intent
    if (result.intent) {
        metrics.intents[result.intent] = (metrics.intents[result.intent] || 0) + 1;
    }
    
    // Record confidence range
    const confidence = result.confidence || 0;
    const range = getConfidenceRange(confidence);
    metrics.confidence_ranges[range]++;
    
    // Record acceptance type
    recordAcceptanceType(result, options);
    
    // Record LLM usage
    if (options.usedLLM) {
        metrics.counters.llm_used++;
        if (result.success !== false) {
            metrics.counters.llm_success++;
        }
    }
    
    // Record timings
    if (options.rulesTime) {
        metrics.timings.rules_parse_time.push(options.rulesTime);
    }
    if (options.llmTime) {
        metrics.timings.llm_parse_time.push(options.llmTime);
    }
    if (options.totalTime) {
        metrics.timings.total_parse_time.push(options.totalTime);
    }
    
    // Record errors
    if (options.error) {
        recordError(options.error, options.errorType);
    }
}

/**
 * Record acceptance type based on result
 * @param {Object} result - Parse result
 * @param {Object} options - Parse options
 */
function recordAcceptanceType(result, options) {
    const confidence = result.confidence || 0;
    const missing = result.missing || [];
    
    if (confidence >= 0.8 && missing.length === 0) {
        metrics.counters.strict_accept++;
    } else if (confidence >= 0.72 && result.slots && result.slots.item) {
        metrics.counters.lenient_accept++;
    } else if (options.rescued) {
        metrics.counters.rescued_accept++;
    } else if (confidence < 0.65 || missing.length > 0) {
        if (options.usedLLM) {
            metrics.counters.llm_used++;
        } else {
            metrics.counters.rejected++;
        }
    }
    
    if (options.clarificationRequested) {
        metrics.counters.clarification_requested++;
    }
}

/**
 * Record error metrics
 * @param {Error} error - Error object
 * @param {string} errorType - Type of error
 */
function recordError(error, errorType) {
    switch (errorType) {
        case 'rules':
            metrics.errors.rules_errors++;
            break;
        case 'llm':
            metrics.errors.llm_errors++;
            break;
        case 'timeout':
            metrics.errors.timeout_errors++;
            metrics.counters.llm_timeout++;
            break;
        case 'validation':
            metrics.errors.validation_errors++;
            break;
        default:
            metrics.errors.rules_errors++;
    }
}

/**
 * Get confidence range for a confidence value
 * @param {number} confidence - Confidence value (0-1)
 * @returns {string} - Confidence range
 */
function getConfidenceRange(confidence) {
    if (confidence < 0.5) return '0.0-0.5';
    if (confidence < 0.6) return '0.5-0.6';
    if (confidence < 0.7) return '0.6-0.7';
    if (confidence < 0.8) return '0.7-0.8';
    if (confidence < 0.9) return '0.8-0.9';
    return '0.9-1.0';
}

/**
 * Get current metrics summary
 * @returns {Object} - Metrics summary
 */
function getMetrics() {
    const total = metrics.counters.total_requests;
    
    if (total === 0) {
        return {
            summary: 'No requests recorded',
            metrics: metrics
        };
    }
    
    const acceptanceRate = (
        metrics.counters.strict_accept + 
        metrics.counters.lenient_accept + 
        metrics.counters.rescued_accept
    ) / total * 100;
    
    const llmUsageRate = metrics.counters.llm_used / total * 100;
    const rejectRate = metrics.counters.rejected / total * 100;
    
    const avgRulesTime = calculateAverage(metrics.timings.rules_parse_time);
    const avgLlmTime = calculateAverage(metrics.timings.llm_parse_time);
    const avgTotalTime = calculateAverage(metrics.timings.total_parse_time);
    
    return {
        summary: {
            total_requests: total,
            acceptance_rate: Math.round(acceptanceRate * 100) / 100,
            llm_usage_rate: Math.round(llmUsageRate * 100) / 100,
            reject_rate: Math.round(rejectRate * 100) / 100,
            avg_rules_time_ms: Math.round(avgRulesTime * 100) / 100,
            avg_llm_time_ms: Math.round(avgLlmTime * 100) / 100,
            avg_total_time_ms: Math.round(avgTotalTime * 100) / 100
        },
        breakdown: {
            strict_accept: metrics.counters.strict_accept,
            lenient_accept: metrics.counters.lenient_accept,
            rescued_accept: metrics.counters.rescued_accept,
            llm_used: metrics.counters.llm_used,
            llm_success: metrics.counters.llm_success,
            llm_timeout: metrics.counters.llm_timeout,
            rejected: metrics.counters.rejected,
            clarification_requested: metrics.counters.clarification_requested
        },
        intents: metrics.intents,
        confidence_distribution: metrics.confidence_ranges,
        errors: metrics.errors,
        raw_metrics: metrics
    };
}

/**
 * Calculate average of array
 * @param {Array} arr - Array of numbers
 * @returns {number} - Average value
 */
function calculateAverage(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Reset all metrics
 */
function reset() {
    // Reset counters
    for (const key in metrics.counters) {
        metrics.counters[key] = 0;
    }
    
    // Reset timings
    for (const key in metrics.timings) {
        metrics.timings[key] = [];
    }
    
    // Reset errors
    for (const key in metrics.errors) {
        metrics.errors[key] = 0;
    }
    
    // Reset intents
    for (const key in metrics.intents) {
        metrics.intents[key] = 0;
    }
    
    // Reset confidence ranges
    for (const key in metrics.confidence_ranges) {
        metrics.confidence_ranges[key] = 0;
    }
}

/**
 * Get performance metrics
 * @returns {Object} - Performance metrics
 */
function getPerformanceMetrics() {
    const rulesTimes = metrics.timings.rules_parse_time;
    const llmTimes = metrics.timings.llm_parse_time;
    const totalTimes = metrics.timings.total_parse_time;
    
    return {
        rules_performance: {
            count: rulesTimes.length,
            avg_ms: calculateAverage(rulesTimes),
            min_ms: Math.min(...rulesTimes),
            max_ms: Math.max(...rulesTimes),
            p95_ms: calculatePercentile(rulesTimes, 95),
            p99_ms: calculatePercentile(rulesTimes, 99)
        },
        llm_performance: {
            count: llmTimes.length,
            avg_ms: calculateAverage(llmTimes),
            min_ms: Math.min(...llmTimes),
            max_ms: Math.max(...llmTimes),
            p95_ms: calculatePercentile(llmTimes, 95),
            p99_ms: calculatePercentile(llmTimes, 99)
        },
        total_performance: {
            count: totalTimes.length,
            avg_ms: calculateAverage(totalTimes),
            min_ms: Math.min(...totalTimes),
            max_ms: Math.max(...totalTimes),
            p95_ms: calculatePercentile(totalTimes, 95),
            p99_ms: calculatePercentile(totalTimes, 99)
        }
    };
}

/**
 * Calculate percentile
 * @param {Array} arr - Array of numbers
 * @param {number} percentile - Percentile to calculate
 * @returns {number} - Percentile value
 */
function calculatePercentile(arr, percentile) {
    if (!arr || arr.length === 0) return 0;
    
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
}

/**
 * Get error analysis
 * @returns {Object} - Error analysis
 */
function getErrorAnalysis() {
    const total = metrics.counters.total_requests;
    
    if (total === 0) {
        return { summary: 'No requests recorded' };
    }
    
    const errorRate = (
        metrics.errors.rules_errors + 
        metrics.errors.llm_errors + 
        metrics.errors.timeout_errors + 
        metrics.errors.validation_errors
    ) / total * 100;
    
    return {
        total_errors: metrics.errors.rules_errors + metrics.errors.llm_errors + metrics.errors.timeout_errors + metrics.errors.validation_errors,
        error_rate: Math.round(errorRate * 100) / 100,
        breakdown: {
            rules_errors: metrics.errors.rules_errors,
            llm_errors: metrics.errors.llm_errors,
            timeout_errors: metrics.errors.timeout_errors,
            validation_errors: metrics.errors.validation_errors
        },
        llm_success_rate: metrics.counters.llm_used > 0 ? 
            Math.round((metrics.counters.llm_success / metrics.counters.llm_used) * 100) / 100 : 0
    };
}

module.exports = {
    record,
    getMetrics,
    reset,
    getPerformanceMetrics,
    getErrorAnalysis
};
