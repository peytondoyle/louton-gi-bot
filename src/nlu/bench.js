/**
 * NLU V2 Performance Benchmarking
 * Validates <1ms fast path performance and load testing
 */

const { performance } = require('perf_hooks');
const { understand } = require('./understand-v2');
const { postprocess } = require('./postprocess');
const { disambiguate } = require('./disambiguate');

// Test data sets
const testCases = {
    simple: [
        "I had chicken salad",
        "drank water",
        "stomach pain",
        "reflux",
        "bm bristol 4"
    ],
    complex: [
        "I had chicken salad with ranch dressing and vegetables for lunch",
        "drank coffee with oat milk this morning",
        "severe stomach pain after eating spicy food",
        "mild reflux with heartburn",
        "bm bristol 6 with loose stool"
    ],
    edge: [
        "chiken salad with ranche dressing",
        "cofee with oatmilk",
        "stomache pain level 8",
        "reflx with hartburn",
        "bm bristol 6 with loose stol"
    ]
};

/**
 * Benchmark a single test case
 * @param {string} text - Input text
 * @param {Object} options - Benchmark options
 * @returns {Object} - Benchmark results
 */
async function benchmarkCase(text, options = {}) {
    const {
        iterations = 100,
        warmup = 10,
        includeMemory = true
    } = options;
    
    // Warmup runs
    for (let i = 0; i < warmup; i++) {
        await understand(text, { userId: 'benchmark', tz: 'America/Los_Angeles' });
    }
    
    const results = {
        text,
        iterations,
        timings: [],
        memory: [],
        errors: 0
    };
    
    // Benchmark runs
    for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const startMemory = includeMemory ? process.memoryUsage() : null;
        
        try {
            const result = await understand(text, { userId: 'benchmark', tz: 'America/Los_Angeles' });
            const endTime = performance.now();
            const endMemory = includeMemory ? process.memoryUsage() : null;
            
            results.timings.push(endTime - startTime);
            
            if (includeMemory && startMemory && endMemory) {
                results.memory.push({
                    heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                    heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                    external: endMemory.external - startMemory.external
                });
            }
        } catch (error) {
            results.errors++;
            console.warn(`Benchmark error for "${text}":`, error.message);
        }
    }
    
    // Calculate statistics
    results.stats = calculateStats(results.timings);
    if (includeMemory) {
        results.memoryStats = calculateMemoryStats(results.memory);
    }
    
    return results;
}

/**
 * Run comprehensive benchmark suite
 * @param {Object} options - Benchmark options
 * @returns {Object} - Benchmark results
 */
async function runBenchmarkSuite(options = {}) {
    const {
        iterations = 100,
        warmup = 10,
        includeMemory = true,
        testCategories = ['simple', 'complex', 'edge']
    } = options;
    
    console.log('🚀 Starting NLU V2 Performance Benchmark...\n');
    
    const suite = {
        startTime: performance.now(),
        categories: {},
        summary: {},
        recommendations: []
    };
    
    // Run benchmarks for each category
    for (const category of testCategories) {
        console.log(`📊 Benchmarking ${category} cases...`);
        
        const categoryResults = [];
        const cases = testCases[category] || [];
        
        for (const testCase of cases) {
            const result = await benchmarkCase(testCase, {
                iterations,
                warmup,
                includeMemory
            });
            categoryResults.push(result);
        }
        
        suite.categories[category] = {
            cases: categoryResults,
            summary: calculateCategorySummary(categoryResults)
        };
        
        console.log(`✅ ${category} completed`);
    }
    
    suite.endTime = performance.now();
    suite.summary = calculateSuiteSummary(suite.categories);
    suite.recommendations = generateRecommendations(suite);
    
    console.log('\n📈 Benchmark Complete!');
    console.log(`Total time: ${(suite.endTime - suite.startTime).toFixed(2)}ms`);
    
    return suite;
}

/**
 * Calculate statistics for timing data
 * @param {Array} timings - Array of timing values
 * @returns {Object} - Statistics
 */
function calculateStats(timings) {
    if (timings.length === 0) {
        return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...timings].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = sorted[0];
    const max = sorted[count - 1];
    const p50 = sorted[Math.floor(count * 0.5)];
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];
    
    return {
        count,
        avg: Math.round(avg * 100) / 100,
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        p50: Math.round(p50 * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        p99: Math.round(p99 * 100) / 100
    };
}

/**
 * Calculate memory statistics
 * @param {Array} memory - Array of memory usage objects
 * @returns {Object} - Memory statistics
 */
function calculateMemoryStats(memory) {
    if (memory.length === 0) {
        return { avgHeapUsed: 0, maxHeapUsed: 0, avgHeapTotal: 0, maxHeapTotal: 0 };
    }
    
    const heapUsed = memory.map(m => m.heapUsed);
    const heapTotal = memory.map(m => m.heapTotal);
    
    return {
        avgHeapUsed: Math.round(heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length),
        maxHeapUsed: Math.max(...heapUsed),
        avgHeapTotal: Math.round(heapTotal.reduce((a, b) => a + b, 0) / heapTotal.length),
        maxHeapTotal: Math.max(...heapTotal)
    };
}

/**
 * Calculate category summary
 * @param {Array} results - Category results
 * @returns {Object} - Category summary
 */
function calculateCategorySummary(results) {
    const allTimings = results.flatMap(r => r.timings);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
    
    return {
        totalCases: results.length,
        totalIterations: results.reduce((sum, r) => sum + r.iterations, 0),
        totalErrors,
        errorRate: totalErrors / results.reduce((sum, r) => sum + r.iterations, 0) * 100,
        performance: calculateStats(allTimings)
    };
}

/**
 * Calculate suite summary
 * @param {Object} categories - Category results
 * @returns {Object} - Suite summary
 */
function calculateSuiteSummary(categories) {
    const allTimings = Object.values(categories)
        .flatMap(cat => cat.cases)
        .flatMap(case_ => case_.timings);
    
    const totalCases = Object.values(categories)
        .reduce((sum, cat) => sum + cat.summary.totalCases, 0);
    
    const totalErrors = Object.values(categories)
        .reduce((sum, cat) => sum + cat.summary.totalErrors, 0);
    
    const totalIterations = Object.values(categories)
        .reduce((sum, cat) => sum + cat.summary.totalIterations, 0);
    
    return {
        totalCases,
        totalIterations,
        totalErrors,
        errorRate: totalErrors / totalIterations * 100,
        performance: calculateStats(allTimings),
        categories: Object.keys(categories).length
    };
}

/**
 * Generate performance recommendations
 * @param {Object} suite - Benchmark suite results
 * @returns {Array} - Recommendations
 */
function generateRecommendations(suite) {
    const recommendations = [];
    const summary = suite.summary;
    
    // Performance recommendations
    if (summary.performance.avg > 1) {
        recommendations.push({
            type: 'performance',
            priority: 'high',
            message: `Average response time (${summary.performance.avg}ms) exceeds target (1ms)`,
            suggestion: 'Optimize rules engine and reduce LLM calls'
        });
    }
    
    if (summary.performance.p95 > 5) {
        recommendations.push({
            type: 'performance',
            priority: 'medium',
            message: `95th percentile (${summary.performance.p95}ms) exceeds target (5ms)`,
            suggestion: 'Investigate slow cases and optimize bottlenecks'
        });
    }
    
    if (summary.performance.p99 > 10) {
        recommendations.push({
            type: 'performance',
            priority: 'high',
            message: `99th percentile (${summary.performance.p99}ms) exceeds target (10ms)`,
            suggestion: 'Add timeout handling and fallback strategies'
        });
    }
    
    // Error rate recommendations
    if (summary.errorRate > 1) {
        recommendations.push({
            type: 'reliability',
            priority: 'medium',
            message: `Error rate (${summary.errorRate.toFixed(2)}%) exceeds target (1%)`,
            suggestion: 'Improve error handling and validation'
        });
    }
    
    // Memory recommendations
    const memoryIssues = Object.values(suite.categories)
        .some(cat => cat.cases.some(case_ => 
            case_.memoryStats && case_.memoryStats.maxHeapUsed > 1024 * 1024 // 1MB
        ));
    
    if (memoryIssues) {
        recommendations.push({
            type: 'memory',
            priority: 'low',
            message: 'High memory usage detected',
            suggestion: 'Review memory allocation and garbage collection'
        });
    }
    
    return recommendations;
}

/**
 * Run load test
 * @param {Object} options - Load test options
 * @returns {Object} - Load test results
 */
async function runLoadTest(options = {}) {
    const {
        duration = 60000, // 1 minute
        concurrency = 10,
        testCase = "I had chicken salad"
    } = options;
    
    console.log(`🔥 Starting load test (${duration}ms, ${concurrency} concurrent)...`);
    
    const startTime = performance.now();
    const results = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        timings: [],
        errors: []
    };
    
    const workers = [];
    
    // Start concurrent workers
    for (let i = 0; i < concurrency; i++) {
        workers.push(loadTestWorker(testCase, startTime + duration, results));
    }
    
    // Wait for all workers to complete
    await Promise.all(workers);
    
    const endTime = performance.now();
    const actualDuration = endTime - startTime;
    
    results.duration = actualDuration;
    results.requestsPerSecond = results.totalRequests / (actualDuration / 1000);
    results.successRate = results.successfulRequests / results.totalRequests * 100;
    results.performance = calculateStats(results.timings);
    
    console.log(`✅ Load test complete: ${results.requestsPerSecond.toFixed(2)} req/s`);
    
    return results;
}

/**
 * Load test worker
 * @param {string} testCase - Test case to run
 * @param {number} endTime - End time for test
 * @param {Object} results - Shared results object
 */
async function loadTestWorker(testCase, endTime, results) {
    while (performance.now() < endTime) {
        const startTime = performance.now();
        
        try {
            await understand(testCase, { userId: 'loadtest', tz: 'America/Los_Angeles' });
            
            const duration = performance.now() - startTime;
            results.timings.push(duration);
            results.successfulRequests++;
        } catch (error) {
            results.failedRequests++;
            results.errors.push({
                error: error.message,
                timestamp: performance.now()
            });
        }
        
        results.totalRequests++;
    }
}

/**
 * Generate benchmark report
 * @param {Object} suite - Benchmark results
 * @returns {string} - Formatted report
 */
function generateReport(suite) {
    let report = '\n📊 NLU V2 Performance Report\n';
    report += '='.repeat(50) + '\n\n';
    
    // Summary
    report += `📈 Summary:\n`;
    report += `  Total Cases: ${suite.summary.totalCases}\n`;
    report += `  Total Iterations: ${suite.summary.totalIterations}\n`;
    report += `  Error Rate: ${suite.summary.errorRate.toFixed(2)}%\n`;
    report += `  Avg Response Time: ${suite.summary.performance.avg}ms\n`;
    report += `  95th Percentile: ${suite.summary.performance.p95}ms\n`;
    report += `  99th Percentile: ${suite.summary.performance.p99}ms\n\n`;
    
    // Category breakdown
    report += `📊 Category Breakdown:\n`;
    for (const [category, data] of Object.entries(suite.categories)) {
        report += `  ${category}:\n`;
        report += `    Cases: ${data.summary.totalCases}\n`;
        report += `    Avg Time: ${data.summary.performance.avg}ms\n`;
        report += `    Error Rate: ${data.summary.errorRate.toFixed(2)}%\n`;
    }
    
    // Recommendations
    if (suite.recommendations.length > 0) {
        report += `\n💡 Recommendations:\n`;
        suite.recommendations.forEach(rec => {
            report += `  ${rec.priority.toUpperCase()}: ${rec.message}\n`;
        });
    }
    
    report += '\n' + '='.repeat(50) + '\n';
    
    return report;
}

module.exports = {
    benchmarkCase,
    runBenchmarkSuite,
    runLoadTest,
    generateReport,
    testCases
};
