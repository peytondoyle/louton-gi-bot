/**
 * NLU V2 Coverage Report Generator
 * Generates periodic reports and identifies patterns in failures
 */

const fs = require('fs');
const path = require('path');
const { getMetrics, getPerformanceMetrics, getErrorAnalysis } = require('./metrics');

/**
 * Generate comprehensive coverage report
 * @param {Object} options - Report options
 * @returns {Object} - Coverage report
 */
function generateCoverageReport(options = {}) {
    const {
        includePerformance = true,
        includeErrors = true,
        includeTrends = true,
        outputFile = null
    } = options;
    
    const report = {
        timestamp: new Date().toISOString(),
        summary: generateSummary(),
        metrics: getMetrics(),
        performance: includePerformance ? getPerformanceMetrics() : null,
        errors: includeErrors ? getErrorAnalysis() : null,
        trends: includeTrends ? generateTrends() : null,
        recommendations: generateRecommendations()
    };
    
    if (outputFile) {
        saveReport(report, outputFile);
    }
    
    return report;
}

/**
 * Generate executive summary
 * @returns {Object} - Summary data
 */
function generateSummary() {
    const metrics = getMetrics();
    const summary = metrics.summary;
    
    const healthScore = calculateHealthScore(summary);
    const status = getSystemStatus(healthScore);
    
    return {
        health_score: healthScore,
        status: status,
        key_metrics: {
            acceptance_rate: summary.acceptance_rate,
            llm_usage_rate: summary.llm_usage_rate,
            avg_response_time: summary.avg_total_time_ms,
            error_rate: calculateErrorRate(summary)
        },
        alerts: generateAlerts(summary)
    };
}

/**
 * Calculate system health score (0-100)
 * @param {Object} summary - Metrics summary
 * @returns {number} - Health score
 */
function calculateHealthScore(summary) {
    let score = 100;
    
    // Deduct points for low acceptance rate
    if (summary.acceptance_rate < 80) {
        score -= (80 - summary.acceptance_rate) * 2;
    }
    
    // Deduct points for high LLM usage
    if (summary.llm_usage_rate > 25) {
        score -= (summary.llm_usage_rate - 25) * 1.5;
    }
    
    // Deduct points for slow response times
    if (summary.avg_total_time_ms > 1000) {
        score -= (summary.avg_total_time_ms - 1000) / 100;
    }
    
    // Deduct points for high error rate
    const errorRate = calculateErrorRate(summary);
    if (errorRate > 5) {
        score -= (errorRate - 5) * 3;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get system status based on health score
 * @param {number} healthScore - Health score
 * @returns {string} - Status
 */
function getSystemStatus(healthScore) {
    if (healthScore >= 90) return 'excellent';
    if (healthScore >= 80) return 'good';
    if (healthScore >= 70) return 'fair';
    if (healthScore >= 60) return 'poor';
    return 'critical';
}

/**
 * Calculate error rate
 * @param {Object} summary - Metrics summary
 * @returns {number} - Error rate percentage
 */
function calculateErrorRate(summary) {
    const total = summary.total_requests;
    if (total === 0) return 0;
    
    const errors = summary.reject_rate || 0;
    return Math.round(errors * 100) / 100;
}

/**
 * Generate system alerts
 * @param {Object} summary - Metrics summary
 * @returns {Array} - Array of alerts
 */
function generateAlerts(summary) {
    const alerts = [];
    
    if (summary.acceptance_rate < 70) {
        alerts.push({
            type: 'critical',
            message: `Low acceptance rate: ${summary.acceptance_rate}%`,
            recommendation: 'Review rules and improve pattern matching'
        });
    }
    
    if (summary.llm_usage_rate > 30) {
        alerts.push({
            type: 'warning',
            message: `High LLM usage: ${summary.llm_usage_rate}%`,
            recommendation: 'Improve rules to reduce LLM dependency'
        });
    }
    
    if (summary.avg_total_time_ms > 2000) {
        alerts.push({
            type: 'warning',
            message: `Slow response time: ${summary.avg_total_time_ms}ms`,
            recommendation: 'Optimize performance and caching'
        });
    }
    
    const errorRate = calculateErrorRate(summary);
    if (errorRate > 10) {
        alerts.push({
            type: 'critical',
            message: `High error rate: ${errorRate}%`,
            recommendation: 'Investigate and fix error sources'
        });
    }
    
    return alerts;
}

/**
 * Generate trend analysis
 * @returns {Object} - Trend data
 */
function generateTrends() {
    // This would typically analyze historical data
    // For now, return mock trend data
    return {
        acceptance_rate_trend: 'stable',
        llm_usage_trend: 'decreasing',
        response_time_trend: 'improving',
        error_rate_trend: 'stable',
        top_failing_patterns: [
            'Complex multi-item meals',
            'Ambiguous symptom descriptions',
            'Time-based entries without context'
        ],
        improvement_areas: [
            'Secondary intent detection',
            'Context-aware disambiguation',
            'Performance optimization'
        ]
    };
}

/**
 * Generate actionable recommendations
 * @returns {Array} - Array of recommendations
 */
function generateRecommendations() {
    const metrics = getMetrics();
    const recommendations = [];
    
    // Acceptance rate recommendations
    if (metrics.summary.acceptance_rate < 85) {
        recommendations.push({
            priority: 'high',
            category: 'accuracy',
            title: 'Improve Acceptance Rate',
            description: 'Current acceptance rate is below target',
            actions: [
                'Review rejected patterns and add rules',
                'Improve disambiguation logic',
                'Enhance context awareness'
            ]
        });
    }
    
    // LLM usage recommendations
    if (metrics.summary.llm_usage_rate > 20) {
        recommendations.push({
            priority: 'medium',
            category: 'efficiency',
            title: 'Reduce LLM Dependency',
            description: 'High LLM usage increases costs and latency',
            actions: [
                'Add more specific rules',
                'Improve pattern matching',
                'Cache common responses'
            ]
        });
    }
    
    // Performance recommendations
    if (metrics.summary.avg_total_time_ms > 1000) {
        recommendations.push({
            priority: 'medium',
            category: 'performance',
            title: 'Optimize Response Time',
            description: 'Response times are above target',
            actions: [
                'Optimize rule execution',
                'Implement caching',
                'Reduce LLM calls'
            ]
        });
    }
    
    // Error rate recommendations
    const errorRate = calculateErrorRate(metrics.summary);
    if (errorRate > 5) {
        recommendations.push({
            priority: 'high',
            category: 'reliability',
            title: 'Reduce Error Rate',
            description: 'Error rate is above acceptable threshold',
            actions: [
                'Add error handling',
                'Improve validation',
                'Add fallback strategies'
            ]
        });
    }
    
    return recommendations;
}

/**
 * Save report to file
 * @param {Object} report - Report data
 * @param {string} filePath - Output file path
 */
function saveReport(report, filePath) {
    const reportDir = path.dirname(filePath);
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportData = {
        ...report,
        generated_at: new Date().toISOString(),
        version: '2.0'
    };
    
    fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));
}

/**
 * Generate daily report
 * @param {string} outputDir - Output directory
 * @returns {string} - Report file path
 */
function generateDailyReport(outputDir = './reports') {
    const date = new Date().toISOString().split('T')[0];
    const fileName = `nlu_coverage_${date}.json`;
    const filePath = path.join(outputDir, fileName);
    
    const report = generateCoverageReport({
        includePerformance: true,
        includeErrors: true,
        includeTrends: true,
        outputFile: filePath
    });
    
    return filePath;
}

/**
 * Generate weekly report
 * @param {string} outputDir - Output directory
 * @returns {string} - Report file path
 */
function generateWeeklyReport(outputDir = './reports') {
    const date = new Date();
    const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
    const weekStr = weekStart.toISOString().split('T')[0];
    const fileName = `nlu_coverage_week_${weekStr}.json`;
    const filePath = path.join(outputDir, fileName);
    
    const report = generateCoverageReport({
        includePerformance: true,
        includeErrors: true,
        includeTrends: true,
        outputFile: filePath
    });
    
    return filePath;
}

/**
 * Generate console-friendly report
 * @returns {string} - Formatted report
 */
function generateConsoleReport() {
    const report = generateCoverageReport();
    
    let output = '\n📊 NLU V2 Coverage Report\n';
    output += '='.repeat(50) + '\n\n';
    
    // Summary
    output += `🏥 Health Score: ${report.summary.health_score}/100 (${report.summary.status})\n`;
    output += `📈 Acceptance Rate: ${report.summary.key_metrics.acceptance_rate}%\n`;
    output += `🤖 LLM Usage: ${report.summary.key_metrics.llm_usage_rate}%\n`;
    output += `⚡ Avg Response Time: ${report.summary.key_metrics.avg_response_time}ms\n`;
    output += `❌ Error Rate: ${report.summary.key_metrics.error_rate}%\n\n`;
    
    // Alerts
    if (report.summary.alerts.length > 0) {
        output += '🚨 Alerts:\n';
        report.summary.alerts.forEach(alert => {
            output += `  ${alert.type.toUpperCase()}: ${alert.message}\n`;
        });
        output += '\n';
    }
    
    // Recommendations
    if (report.recommendations.length > 0) {
        output += '💡 Top Recommendations:\n';
        report.recommendations.slice(0, 3).forEach(rec => {
            output += `  ${rec.priority.toUpperCase()}: ${rec.title}\n`;
        });
        output += '\n';
    }
    
    output += '='.repeat(50) + '\n';
    
    return output;
}

module.exports = {
    generateCoverageReport,
    generateDailyReport,
    generateWeeklyReport,
    generateConsoleReport,
    generateSummary,
    generateTrends,
    generateRecommendations
};
