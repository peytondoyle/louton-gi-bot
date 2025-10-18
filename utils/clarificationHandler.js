// Clarification Request Handler for Ambiguous Messages
const { EmbedBuilder } = require('discord.js');

// Store pending clarifications (in-memory for now)
const pendingClarifications = new Map();

class ClarificationHandler {
    /**
     * Check if a message needs clarification
     */
    static needsClarification(message, nlpResult) {
        // Vague feeling statements
        const vagueWords = ['not feeling great', 'not good', 'uncomfortable', 'off', 'weird', 'rough', 'bad day'];
        if (vagueWords.some(word => message.toLowerCase().includes(word))) {
            return {
                type: 'symptom_type',
                message: message,
                confidence: 'needs_clarification'
            };
        }

        // Ambiguous food without context
        const ambiguousFoods = ['crackers', 'snack', 'something', 'food', 'ate something'];
        if (ambiguousFoods.some(word => message.toLowerCase().includes(word)) &&
            !message.toLowerCase().includes('breakfast') &&
            !message.toLowerCase().includes('lunch') &&
            !message.toLowerCase().includes('dinner')) {
            return {
                type: 'meal_context',
                message: message,
                confidence: 'needs_clarification'
            };
        }

        // Bathroom references without detail
        const bathroomRefs = ['bathroom', 'restroom'];
        if (bathroomRefs.some(word => message.toLowerCase().includes(word)) &&
            !message.toLowerCase().includes('bm') &&
            !message.toLowerCase().includes('bristol') &&
            !message.toLowerCase().includes('normal') &&
            !message.toLowerCase().includes('hard') &&
            !message.toLowerCase().includes('loose')) {
            return {
                type: 'bm_detail',
                message: message,
                confidence: 'needs_clarification'
            };
        }

        // General "better" or "worse" without context
        if ((message.toLowerCase().includes('feeling better') ||
             message.toLowerCase().includes('feeling worse')) &&
            message.split(' ').length < 5) {
            return {
                type: 'improvement_type',
                message: message,
                confidence: 'needs_clarification'
            };
        }

        return null;
    }

    /**
     * Generate clarification prompt based on type
     */
    static async askClarification(type, message, discordMessage) {
        const userId = discordMessage.author.id;

        // Store the pending clarification
        pendingClarifications.set(userId, {
            type,
            originalMessage: message,
            timestamp: Date.now()
        });

        let embed;

        switch (type) {
            case 'symptom_type':
                embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('🤔 I want to log this correctly')
                    .setDescription(`You said: "${message}"\n\nWhat type of symptom are you experiencing?`)
                    .addFields(
                        { name: '1️⃣ Reflux/Heartburn', value: 'Acid reflux, burning sensation', inline: false },
                        { name: '2️⃣ Stomach Pain/Cramps', value: 'Abdominal pain or cramping', inline: false },
                        { name: '3️⃣ Bloating/Gas', value: 'Feeling bloated or gassy', inline: false },
                        { name: '4️⃣ Nausea', value: 'Feeling sick or nauseous', inline: false },
                        { name: '5️⃣ General Discomfort', value: 'Overall discomfort', inline: false }
                    )
                    .setFooter({ text: 'Reply with a number (1-5) or describe more specifically' });
                break;

            case 'meal_context':
                embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('🍽️ When did you have this?')
                    .setDescription(`You mentioned: "${message}"\n\nWhen was this?`)
                    .addFields(
                        { name: '🌅 Breakfast', value: 'Morning meal', inline: true },
                        { name: '🌞 Lunch', value: 'Midday meal', inline: true },
                        { name: '🌙 Dinner', value: 'Evening meal', inline: true },
                        { name: '🥨 Snack', value: 'Between meals', inline: true }
                    )
                    .setFooter({ text: 'Reply with the meal type or just tell me when you ate it' });
                break;

            case 'bm_detail':
                embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('📝 Bowel Movement Details')
                    .setDescription(`I'll log this bowel movement. Can you provide more details?`)
                    .addFields(
                        { name: '1️⃣ Normal/Healthy', value: 'Bristol scale 3-4', inline: false },
                        { name: '2️⃣ Hard/Constipated', value: 'Bristol scale 1-2', inline: false },
                        { name: '3️⃣ Loose/Diarrhea', value: 'Bristol scale 5-7', inline: false }
                    )
                    .setFooter({ text: 'Reply with a number or describe it (hard/normal/loose)' });
                break;

            case 'improvement_type':
                embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('😊 Tell me more!')
                    .setDescription(`You said: "${message}"\n\nWhat specifically is better/worse?`)
                    .addFields(
                        { name: '✅ Symptom Improvement', value: 'Which symptom improved?', inline: false },
                        { name: '😊 General Wellbeing', value: 'Overall feeling better', inline: false },
                        { name: '💪 Milestone', value: 'Something to celebrate!', inline: false }
                    )
                    .setFooter({ text: 'Let me know so I can log it properly!' });
                break;

            default:
                embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('🤔 Can you clarify?')
                    .setDescription(`You said: "${message}"\n\nI'm not quite sure what to log. Can you provide more details?`);
        }

        await discordMessage.reply({ embeds: [embed] });
        return true;
    }

    /**
     * Process clarification response
     */
    static async processClarificationResponse(userId, response) {
        const pending = pendingClarifications.get(userId);

        if (!pending) {
            return null; // No pending clarification
        }

        // Clear the pending clarification
        pendingClarifications.delete(userId);

        // Check if it's been too long (>5 minutes)
        if (Date.now() - pending.timestamp > 300000) {
            return { expired: true };
        }

        const result = {
            originalMessage: pending.originalMessage,
            type: pending.type,
            clarification: response
        };

        // Parse the response based on type
        switch (pending.type) {
            case 'symptom_type':
                result.parsedType = this.parseSymptomType(response);
                break;

            case 'meal_context':
                result.parsedContext = this.parseMealContext(response);
                break;

            case 'bm_detail':
                result.parsedDetail = this.parseBMDetail(response);
                break;

            case 'improvement_type':
                result.parsedImprovement = this.parseImprovement(response);
                break;
        }

        return result;
    }

    /**
     * Parse symptom type from clarification
     */
    static parseSymptomType(response) {
        const lower = response.toLowerCase();

        if (lower.includes('1') || lower.includes('reflux') || lower.includes('heartburn')) {
            return { type: 'reflux', value: 'reflux', category: 'Symptom' };
        }
        if (lower.includes('2') || lower.includes('pain') || lower.includes('cramp')) {
            return { type: 'symptom', value: 'stomach pain', category: 'Symptom' };
        }
        if (lower.includes('3') || lower.includes('bloat') || lower.includes('gas')) {
            return { type: 'symptom', value: 'bloating', category: 'Symptom' };
        }
        if (lower.includes('4') || lower.includes('nausea') || lower.includes('sick')) {
            return { type: 'symptom', value: 'nausea', category: 'Symptom' };
        }
        if (lower.includes('5') || lower.includes('discomfort')) {
            return { type: 'symptom', value: 'general discomfort', category: 'Symptom' };
        }

        // Default: use their description
        return { type: 'symptom', value: response, category: 'Symptom' };
    }

    /**
     * Parse meal context from clarification
     */
    static parseMealContext(response) {
        const lower = response.toLowerCase();

        if (lower.includes('breakfast') || lower.includes('morning')) {
            return { context: 'breakfast', time: 'morning' };
        }
        if (lower.includes('lunch') || lower.includes('noon') || lower.includes('midday')) {
            return { context: 'lunch', time: 'afternoon' };
        }
        if (lower.includes('dinner') || lower.includes('evening') || lower.includes('night')) {
            return { context: 'dinner', time: 'evening' };
        }
        if (lower.includes('snack')) {
            return { context: 'snack', time: 'between meals' };
        }

        return { context: 'meal', time: 'unspecified' };
    }

    /**
     * Parse BM detail from clarification
     */
    static parseBMDetail(response) {
        const lower = response.toLowerCase();

        if (lower.includes('1') || lower.includes('normal') || lower.includes('healthy')) {
            return { description: 'normal', bristol: '3-4' };
        }
        if (lower.includes('2') || lower.includes('hard') || lower.includes('constipat')) {
            return { description: 'hard/constipated', bristol: '1-2' };
        }
        if (lower.includes('3') || lower.includes('loose') || lower.includes('diarrhea')) {
            return { description: 'loose/diarrhea', bristol: '5-7' };
        }

        // Try to extract Bristol scale number
        const bristolMatch = response.match(/\b([1-7])\b/);
        if (bristolMatch) {
            return { description: `Bristol ${bristolMatch[1]}`, bristol: bristolMatch[1] };
        }

        return { description: response, bristol: 'unknown' };
    }

    /**
     * Parse improvement type from clarification
     */
    static parseImprovement(response) {
        const lower = response.toLowerCase();

        if (lower.includes('reflux') || lower.includes('heartburn')) {
            return { type: 'symptom_improvement', symptom: 'reflux' };
        }
        if (lower.includes('pain') || lower.includes('stomach')) {
            return { type: 'symptom_improvement', symptom: 'stomach pain' };
        }
        if (lower.includes('bloat')) {
            return { type: 'symptom_improvement', symptom: 'bloating' };
        }
        if (lower.includes('milestone') || lower.includes('celebrate')) {
            return { type: 'milestone', description: response };
        }

        return { type: 'general_wellbeing', description: response };
    }

    /**
     * Check if user has pending clarification
     */
    static hasPendingClarification(userId) {
        return pendingClarifications.has(userId);
    }

    /**
     * Clear expired clarifications
     */
    static clearExpired() {
        const now = Date.now();
        for (const [userId, data] of pendingClarifications.entries()) {
            if (now - data.timestamp > 300000) { // 5 minutes
                pendingClarifications.delete(userId);
            }
        }
    }
}

// Clean up expired clarifications every minute
setInterval(() => {
    ClarificationHandler.clearExpired();
}, 60000);

module.exports = ClarificationHandler;
