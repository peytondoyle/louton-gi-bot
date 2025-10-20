const moment = require('moment-timezone');

const ProactiveAnalyst = {
    /**
     * Finds potential correlations between food/drink intake and subsequent symptoms.
     * @param {string} userId - The user's Discord ID.
     * @param {object} services - { googleSheets, getUserProfile }
     * @returns {Promise<Array<object>>} A list of potential correlations found.
     */
    async findFoodSymptomCorrelations(userId, services) {
        const { googleSheets, getUserProfile } = services;
        const profile = await getUserProfile(userId, googleSheets);
        const tz = profile.prefs.TZ || 'America/Los_Angeles';
        const sheetName = googleSheets.getLogSheetNameForUser(userId);

        // 1. Fetch the last 28 days of data for analysis.
        const allEntries = await googleSheets.getRows({ days: 28 }, sheetName);
        if (allEntries.length < 10) {
            console.log(`[PROACTIVE] Not enough data to analyze for user ${userId}.`);
            return [];
        }

        const symptoms = allEntries.filter(e => e.Type === 'symptom' || e.Type === 'reflux');
        const foods = allEntries.filter(e => e.Type === 'food' || e.Type === 'drink');

        if (symptoms.length === 0 || foods.length === 0) {
            return []; // No correlations possible without both foods and symptoms.
        }

        const correlations = new Map(); // Key: "food_item:symptom_type", Value: { count: number, dates: [] }

        // 2. For each symptom, look for preceding foods within a time window.
        for (const symptom of symptoms) {
            const symptomTime = moment(symptom.Timestamp).tz(tz);
            const symptomType = symptom.Details.toLowerCase().trim();

            const windowStart = symptomTime.clone().subtract(4, 'hours');

            const precedingFoods = foods.filter(food => {
                const foodTime = moment(food.Timestamp).tz(tz);
                return foodTime.isBetween(windowStart, symptomTime);
            });

            // 3. For each preceding food, increment its correlation count.
            for (const food of precedingFoods) {
                const foodItem = food.Details.toLowerCase().trim();
                const key = `${foodItem}:${symptomType}`;

                const current = correlations.get(key) || { count: 0, dates: [] };
                current.count++;
                current.dates.push(symptomTime.format('YYYY-MM-DD'));
                correlations.set(key, current);
            }
        }

        // 4. Filter for significant correlations.
        const significantCorrelations = [];
        for (const [key, data] of correlations.entries()) {
            // A correlation is significant if it happened at least 3 times.
            if (data.count >= 3) {
                const [food, symptom] = key.split(':');
                significantCorrelations.push({
                    food,
                    symptom,
                    count: data.count,
                    lastInstance: data.dates[data.dates.length - 1], // The most recent date it happened
                });
            }
        }

        console.log(`[PROACTIVE] Found ${significantCorrelations.length} significant correlations for user ${userId}.`);
        return significantCorrelations;
    }
};

module.exports = ProactiveAnalyst;
