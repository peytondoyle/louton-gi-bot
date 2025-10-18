const moment = require('moment-timezone');
const googleSheets = require('../services/googleSheets');

class Analyzer {
    constructor() {
        this.triggerFoods = ['coffee', 'alcohol', 'spicy', 'dairy', 'gluten', 'citrus', 'tomato', 'refresher', 'soda'];
        this.safeFoods = ['chai', 'water', 'herbal tea', 'ginger', 'rice', 'banana', 'oatmeal'];
    }

    async getTodaySummary(userName) {
        const entries = await googleSheets.getTodayEntries(userName);
        return entries;
    }

    async getWeeklySummary(userName) {
        const entries = await googleSheets.getWeekEntries(userName);

        if (entries.length === 0) {
            return {
                totalEntries: 0,
                mostActiveDay: null,
                symptomDays: 0,
                topFoods: [],
                commonSymptoms: [],
                avgDailyEntries: 0
            };
        }

        // Calculate statistics
        const dayGroups = {};
        const foods = {};
        const symptoms = {};
        const symptomDaysSet = new Set();

        entries.forEach(entry => {
            const day = moment(entry.timestamp).format('YYYY-MM-DD');

            // Group by day
            if (!dayGroups[day]) dayGroups[day] = 0;
            dayGroups[day]++;

            // Track foods
            if (entry.type === 'food' || entry.type === 'drink') {
                const food = entry.value.toLowerCase();
                if (!foods[food]) foods[food] = 0;
                foods[food]++;
            }

            // Track symptoms
            if (entry.type === 'symptom' || entry.type === 'reflux') {
                symptomDaysSet.add(day);
                const symptom = entry.value.toLowerCase();
                if (!symptoms[symptom]) symptoms[symptom] = 0;
                symptoms[symptom]++;
            }
        });

        // Find most active day
        const mostActiveDay = Object.entries(dayGroups)
            .sort(([, a], [, b]) => b - a)[0];

        // Get top foods
        const topFoods = Object.entries(foods)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([food]) => food);

        // Get common symptoms
        const commonSymptoms = Object.entries(symptoms)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([symptom]) => symptom);

        return {
            totalEntries: entries.length,
            mostActiveDay: mostActiveDay ? moment(mostActiveDay[0]).format('dddd') : null,
            symptomDays: symptomDaysSet.size,
            topFoods,
            commonSymptoms,
            avgDailyEntries: entries.length / 7
        };
    }

    async getStreakData(userName) {
        const allEntries = await googleSheets.getAllEntries(userName);

        if (allEntries.length === 0) {
            return {
                trackingStreak: 0,
                triggerFreeStreak: 0,
                bestStreak: 0
            };
        }

        // Sort entries by date
        const sortedEntries = allEntries.sort((a, b) =>
            moment(a.timestamp).diff(moment(b.timestamp))
        );

        // Calculate tracking streak
        let trackingStreak = 0;
        let currentDate = moment();
        const today = moment().format('YYYY-MM-DD');

        // Check backwards from today
        for (let i = 0; i <= 30; i++) {
            const checkDate = moment().subtract(i, 'days').format('YYYY-MM-DD');
            const hasEntry = sortedEntries.some(entry =>
                moment(entry.timestamp).format('YYYY-MM-DD') === checkDate
            );

            if (hasEntry) {
                trackingStreak++;
            } else if (checkDate !== today) {
                break; // Streak broken (unless it's today and they haven't logged yet)
            }
        }

        // Calculate trigger-free streak
        let triggerFreeStreak = 0;
        let foundTrigger = false;

        for (let i = sortedEntries.length - 1; i >= 0 && !foundTrigger; i--) {
            const entry = sortedEntries[i];
            const entryText = entry.value.toLowerCase();

            // Check if entry contains trigger foods
            const hasTrigger = this.triggerFoods.some(trigger =>
                entryText.includes(trigger)
            );

            if (!hasTrigger && (entry.type === 'food' || entry.type === 'drink')) {
                const daysSinceEntry = moment().diff(moment(entry.timestamp), 'days');
                if (daysSinceEntry <= triggerFreeStreak + 1) {
                    triggerFreeStreak = daysSinceEntry;
                }
            } else if (hasTrigger) {
                foundTrigger = true;
            }
        }

        // Calculate best streak (simplified - just tracking streak for now)
        const bestStreak = Math.max(trackingStreak,
            await this.calculateBestStreak(sortedEntries));

        return {
            trackingStreak,
            triggerFreeStreak,
            bestStreak
        };
    }

    async calculateBestStreak(entries) {
        if (entries.length === 0) return 0;

        const dates = [...new Set(entries.map(e =>
            moment(e.timestamp).format('YYYY-MM-DD')
        ))].sort();

        let maxStreak = 1;
        let currentStreak = 1;

        for (let i = 1; i < dates.length; i++) {
            const prevDate = moment(dates[i - 1]);
            const currDate = moment(dates[i]);

            if (currDate.diff(prevDate, 'days') === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }

        return maxStreak;
    }

    async analyzePatterns(userName) {
        const entries = await googleSheets.getAllEntries(userName);

        if (entries.length < 20) {
            return null; // Not enough data
        }

        // Analyze food frequency
        const foodFrequency = {};
        const symptomAfterFood = {};
        const timePatterns = { morning: 0, afternoon: 0, evening: 0, night: 0 };

        entries.forEach((entry, index) => {
            // Count food frequency
            if (entry.type === 'food' || entry.type === 'drink') {
                const food = entry.value.toLowerCase();
                if (!foodFrequency[food]) foodFrequency[food] = 0;
                foodFrequency[food]++;

                // Check for symptoms within 4 hours after this food
                for (let j = index + 1; j < entries.length && j < index + 10; j++) {
                    const nextEntry = entries[j];
                    const timeDiff = moment(nextEntry.timestamp).diff(moment(entry.timestamp), 'hours');

                    if (timeDiff <= 4 && (nextEntry.type === 'symptom' || nextEntry.type === 'reflux')) {
                        if (!symptomAfterFood[food]) symptomAfterFood[food] = 0;
                        symptomAfterFood[food]++;
                        break;
                    }
                }
            }

            // Analyze time patterns for symptoms
            if (entry.type === 'symptom' || entry.type === 'reflux') {
                const hour = moment(entry.timestamp).hour();
                if (hour >= 5 && hour < 12) timePatterns.morning++;
                else if (hour >= 12 && hour < 17) timePatterns.afternoon++;
                else if (hour >= 17 && hour < 22) timePatterns.evening++;
                else timePatterns.night++;
            }
        });

        // Get top foods
        const topFoods = Object.entries(foodFrequency)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([food, count]) => ({ food, count }));

        // Find correlations
        const correlations = [];
        Object.entries(symptomAfterFood).forEach(([food, count]) => {
            const totalOccurrences = foodFrequency[food] || 1;
            const percentage = Math.round((count / totalOccurrences) * 100);

            if (percentage > 30) {
                correlations.push(`⚠️ ${food}: symptoms ${percentage}% of the time`);
            }
        });

        // Find peak symptom times
        const peakTimes = [];
        const maxTime = Math.max(...Object.values(timePatterns));
        Object.entries(timePatterns).forEach(([time, count]) => {
            if (count === maxTime && count > 0) {
                peakTimes.push(time.charAt(0).toUpperCase() + time.slice(1));
            }
        });

        // Generate recommendations
        const recommendations = [];

        // Check for trigger foods
        const commonTriggers = entries.filter(e =>
            (e.type === 'food' || e.type === 'drink') &&
            this.triggerFoods.some(trigger => e.value.toLowerCase().includes(trigger))
        );

        if (commonTriggers.length > entries.length * 0.2) {
            recommendations.push('💡 Consider reducing trigger foods (coffee, alcohol, spicy foods)');
        }

        // Check for safe food usage
        const safeFoodCount = entries.filter(e =>
            (e.type === 'food' || e.type === 'drink') &&
            this.safeFoods.some(safe => e.value.toLowerCase().includes(safe))
        ).length;

        if (safeFoodCount < entries.length * 0.3) {
            recommendations.push('💚 Try incorporating more gut-friendly foods (ginger, rice, bananas)');
        }

        // Check symptom frequency
        const symptomCount = entries.filter(e =>
            e.type === 'symptom' || e.type === 'reflux'
        ).length;

        if (symptomCount > entries.length * 0.4) {
            recommendations.push('🩺 High symptom frequency - consider consulting your healthcare provider');
        }

        if (peakTimes.includes('Evening') || peakTimes.includes('Night')) {
            recommendations.push('🕐 Symptoms peak in evening/night - try eating dinner earlier');
        }

        return {
            topFoods,
            correlations,
            peakTimes,
            recommendations
        };
    }

    async generateReport(userName, days = 7) {
        const endDate = moment();
        const startDate = moment().subtract(days, 'days');
        const entries = await googleSheets.getEntriesDateRange(startDate, endDate, userName);

        if (entries.length === 0) {
            return 'No data available for the specified period.';
        }

        // Group entries by type
        const grouped = {
            food: [],
            drink: [],
            symptom: [],
            reflux: [],
            bm: []
        };

        entries.forEach(entry => {
            if (grouped[entry.type]) {
                grouped[entry.type].push(entry);
            }
        });

        // Calculate statistics
        const stats = {
            totalEntries: entries.length,
            avgEntriesPerDay: (entries.length / days).toFixed(1),
            foodEntries: grouped.food.length,
            drinkEntries: grouped.drink.length,
            symptomEntries: grouped.symptom.length + grouped.reflux.length,
            bmEntries: grouped.bm.length
        };

        // Find patterns
        const patterns = await this.analyzePatterns(userName);

        return {
            period: `${startDate.format('MMM DD')} - ${endDate.format('MMM DD, YYYY')}`,
            stats,
            grouped,
            patterns
        };
    }
}

module.exports = new Analyzer();