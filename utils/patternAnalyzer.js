// Advanced Pattern Analysis Engine for Louton GI Bot
const moment = require('moment-timezone');

class PatternAnalyzer {
    /**
     * Analyze trigger correlations - find what foods/drinks precede symptoms
     */
    static async analyzeTriggerCorrelations(entries, userName) {
        const correlations = [];
        const symptoms = entries.filter(e => e.type === 'symptom' || e.type === 'reflux');

        for (const symptom of symptoms) {
            const symptomTime = moment(symptom.timestamp);

            // Look back 3 hours for potential triggers
            const recentEntries = entries.filter(e => {
                if (e.type !== 'food' && e.type !== 'drink') return false;
                const entryTime = moment(e.timestamp);
                const hoursDiff = symptomTime.diff(entryTime, 'hours');
                return hoursDiff >= 0 && hoursDiff <= 3;
            });

            if (recentEntries.length > 0) {
                correlations.push({
                    symptom: symptom.value,
                    severity: symptom.severity,
                    time: symptom.timestamp,
                    potentialTriggers: recentEntries.map(e => ({
                        type: e.type,
                        value: e.value,
                        category: e.category,
                        time: e.timestamp
                    }))
                });
            }
        }

        return correlations;
    }

    /**
     * Find repeated trigger-symptom patterns
     */
    static async findRepeatedPatterns(entries, userName) {
        const patterns = {};

        // Get all trigger correlations
        const correlations = await this.analyzeTriggerCorrelations(entries, userName);

        // Count how often each trigger appears before symptoms
        correlations.forEach(corr => {
            corr.potentialTriggers.forEach(trigger => {
                const key = `${trigger.type}:${trigger.value.toLowerCase()}`;
                if (!patterns[key]) {
                    patterns[key] = {
                        trigger: trigger.value,
                        type: trigger.type,
                        category: trigger.category,
                        count: 0,
                        symptoms: []
                    };
                }
                patterns[key].count++;
                patterns[key].symptoms.push({
                    symptom: corr.symptom,
                    severity: corr.severity,
                    time: corr.time
                });
            });
        });

        // Sort by count (most frequent first)
        return Object.values(patterns)
            .filter(p => p.count >= 2) // Only show if it happened at least twice
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Calculate symptom trends over time
     */
    static async calculateTrends(entries, userName, days = 7) {
        const cutoff = moment().subtract(days, 'days');
        const recentEntries = entries.filter(e =>
            moment(e.timestamp).isAfter(cutoff) &&
            (e.type === 'symptom' || e.type === 'reflux')
        );

        if (recentEntries.length === 0) {
            return { trend: 'no_data', message: 'Not enough data to calculate trends' };
        }

        // Group by day
        const dailyCounts = {};
        recentEntries.forEach(entry => {
            const day = moment(entry.timestamp).format('YYYY-MM-DD');
            if (!dailyCounts[day]) dailyCounts[day] = 0;
            dailyCounts[day]++;
        });

        const numDays = Object.keys(dailyCounts).length;
        const avgPerDay = recentEntries.length / numDays;

        // Compare first half vs second half
        const midpoint = Math.floor(recentEntries.length / 2);
        const firstHalf = recentEntries.slice(0, midpoint);
        const secondHalf = recentEntries.slice(midpoint);

        const improvement = ((firstHalf.length - secondHalf.length) / firstHalf.length) * 100;

        let trend = 'stable';
        let message = '';

        if (improvement > 20) {
            trend = 'improving';
            message = `Your symptoms have improved ${Math.round(improvement)}% recently! 🎉`;
        } else if (improvement < -20) {
            trend = 'worsening';
            message = `Your symptoms have increased ${Math.round(Math.abs(improvement))}% recently. Consider reviewing your trigger foods.`;
        } else {
            trend = 'stable';
            message = `Your symptoms have been relatively stable.`;
        }

        return {
            trend,
            message,
            avgPerDay: avgPerDay.toFixed(1),
            totalSymptoms: recentEntries.length,
            improvement: Math.round(improvement)
        };
    }

    /**
     * Find time-based patterns (when symptoms occur most)
     */
    static async findTimePatterns(entries, userName) {
        const symptoms = entries.filter(e => e.type === 'symptom' || e.type === 'reflux');

        if (symptoms.length < 5) {
            return { hasPattern: false, message: 'Need more data to identify time patterns' };
        }

        // Group by hour of day
        const hourCounts = {};
        symptoms.forEach(entry => {
            const hour = moment(entry.timestamp).hour();
            if (!hourCounts[hour]) hourCounts[hour] = 0;
            hourCounts[hour]++;
        });

        // Find peak hour
        const peakHour = Object.entries(hourCounts)
            .sort((a, b) => b[1] - a[1])[0];

        if (peakHour[1] >= 3) {
            const timeStr = moment().hour(parseInt(peakHour[0])).format('ha');
            return {
                hasPattern: true,
                peakHour: parseInt(peakHour[0]),
                count: peakHour[1],
                message: `You tend to experience symptoms most often around ${timeStr} (${peakHour[1]} times)`
            };
        }

        return { hasPattern: false, message: 'No strong time-based pattern detected' };
    }

    /**
     * Generate insights for a specific trigger
     */
    static async getTriggerInsights(entries, triggerName, userName) {
        const lowerTrigger = triggerName.toLowerCase();

        // Find all instances of this trigger
        const triggerEntries = entries.filter(e =>
            (e.type === 'food' || e.type === 'drink') &&
            e.value.toLowerCase().includes(lowerTrigger)
        );

        if (triggerEntries.length === 0) {
            return { found: false, message: `No entries found for ${triggerName}` };
        }

        // Find symptoms that occurred after this trigger
        const correlatedSymptoms = [];
        triggerEntries.forEach(trigger => {
            const triggerTime = moment(trigger.timestamp);

            // Look forward 3 hours for symptoms
            const symptoms = entries.filter(e => {
                if (e.type !== 'symptom' && e.type !== 'reflux') return false;
                const symptomTime = moment(e.timestamp);
                const hoursDiff = symptomTime.diff(triggerTime, 'hours');
                return hoursDiff >= 0 && hoursDiff <= 3;
            });

            if (symptoms.length > 0) {
                correlatedSymptoms.push(...symptoms);
            }
        });

        const correlation = triggerEntries.length > 0
            ? (correlatedSymptoms.length / triggerEntries.length) * 100
            : 0;

        return {
            found: true,
            triggerName: triggerName,
            totalOccurrences: triggerEntries.length,
            symptomsFollowed: correlatedSymptoms.length,
            correlationRate: Math.round(correlation),
            message: correlatedSymptoms.length > 0
                ? `${triggerName} triggered symptoms ${correlatedSymptoms.length}/${triggerEntries.length} times (${Math.round(correlation)}% correlation)`
                : `${triggerName} hasn't caused any symptoms in tracked instances`
        };
    }

    /**
     * Get weekly summary insights
     */
    static async getWeeklySummary(entries, userName) {
        const weekStart = moment().startOf('week');
        const weekEntries = entries.filter(e =>
            moment(e.timestamp).isAfter(weekStart)
        );

        // Count symptom-free days
        const daysWithSymptoms = new Set();
        const daysTracked = new Set();

        weekEntries.forEach(entry => {
            const day = moment(entry.timestamp).format('YYYY-MM-DD');
            daysTracked.add(day);
            if (entry.type === 'symptom' || entry.type === 'reflux') {
                daysWithSymptoms.add(day);
            }
        });

        const symptomFreeDays = daysTracked.size - daysWithSymptoms.size;

        // Find worst triggers
        const patterns = await this.findRepeatedPatterns(weekEntries, userName);
        const worstTriggers = patterns.slice(0, 3);

        // Find best safe foods
        const safeEntries = weekEntries.filter(e =>
            e.category === 'Safe Food' || e.category === 'Safe Drink'
        );
        const safeCounts = {};
        safeEntries.forEach(e => {
            const key = e.value.toLowerCase();
            safeCounts[key] = (safeCounts[key] || 0) + 1;
        });
        const topSafe = Object.entries(safeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        // Calculate total symptoms
        const totalSymptoms = weekEntries.filter(e =>
            e.type === 'symptom' || e.type === 'reflux'
        ).length;

        return {
            weekStart: weekStart.format('MMM DD'),
            daysTracked: daysTracked.size,
            symptomFreeDays,
            totalSymptoms,
            worstTriggers: worstTriggers.map(t => ({
                name: t.trigger,
                count: t.count,
                type: t.type
            })),
            topSafeFoods: topSafe.map(([name, count]) => ({ name, count })),
            trends: await this.calculateTrends(entries, userName, 7)
        };
    }

    /**
     * Generate personalized recommendations
     */
    static async getRecommendations(entries, userName) {
        const recommendations = [];
        const patterns = await this.findRepeatedPatterns(entries, userName);

        // Recommend avoiding frequent triggers
        if (patterns.length > 0) {
            const topTrigger = patterns[0];
            recommendations.push({
                type: 'avoid',
                priority: 'high',
                message: `Consider avoiding ${topTrigger.trigger} - it's been linked to symptoms ${topTrigger.count} times`
            });
        }

        // Find symptom-free streaks
        const recentEntries = entries.slice(-20);
        const improvements = recentEntries.filter(e => e.category === 'Improvement');
        if (improvements.length >= 3) {
            recommendations.push({
                type: 'positive',
                priority: 'medium',
                message: `You're doing great! ${improvements.length} positive entries recently`
            });
        }

        // Check tracking consistency
        const lastWeek = moment().subtract(7, 'days');
        const recentTracking = entries.filter(e => moment(e.timestamp).isAfter(lastWeek));
        const avgPerDay = recentTracking.length / 7;

        if (avgPerDay < 2) {
            recommendations.push({
                type: 'reminder',
                priority: 'low',
                message: 'Try to log entries more consistently for better insights'
            });
        }

        return recommendations;
    }

    /**
     * Check for combination triggers (e.g., coffee + stress)
     */
    static async findCombinationTriggers(entries, userName) {
        const combinations = {};
        const symptoms = entries.filter(e => e.type === 'symptom' || e.type === 'reflux');

        symptoms.forEach(symptom => {
            const symptomTime = moment(symptom.timestamp);

            // Look back 3 hours for multiple triggers
            const recentTriggers = entries.filter(e => {
                if (e.type !== 'food' && e.type !== 'drink') return false;
                const entryTime = moment(e.timestamp);
                const hoursDiff = symptomTime.diff(entryTime, 'hours');
                return hoursDiff >= 0 && hoursDiff <= 3;
            });

            // If 2+ triggers before symptom, record the combination
            if (recentTriggers.length >= 2) {
                const combo = recentTriggers
                    .map(t => t.value)
                    .sort()
                    .join(' + ');

                if (!combinations[combo]) {
                    combinations[combo] = {
                        items: recentTriggers.map(t => t.value),
                        count: 0,
                        symptoms: []
                    };
                }
                combinations[combo].count++;
                combinations[combo].symptoms.push(symptom.value);
            }
        });

        return Object.entries(combinations)
            .filter(([_, data]) => data.count >= 2)
            .map(([combo, data]) => ({
                combination: combo,
                count: data.count,
                items: data.items,
                message: `${combo} triggered symptoms ${data.count} times together`
            }))
            .sort((a, b) => b.count - a.count);
    }
}

module.exports = PatternAnalyzer;
