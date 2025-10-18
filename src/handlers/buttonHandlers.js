// Button Interaction Handlers
// Processes all button clicks from clarifications, check-ins, and actions

const { BUTTON_IDS, EMOJI, getRandomPhrase, PHRASES, formatPhrase } = require('../constants/ux');
const { successEmbed, errorEmbed, buttonsSeverity, buttonsMealTime } = require('../ui/components');
const contextMemory = require('../utils/contextMemory');

// Store pending clarifications awaiting secondary input
// userId -> { type, data, timestamp }
const pendingClarifications = new Map();

/**
 * Main button interaction router
 * @param {Interaction} interaction - Discord button interaction
 * @param {Object} googleSheets - Google Sheets service
 * @param {Object} digests - Digests module
 */
async function handleButtonInteraction(interaction, googleSheets, digests) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    try {
        // Route based on button ID prefix
        if (customId.startsWith('symptom_')) {
            await handleSymptomType(interaction, googleSheets);
        } else if (customId.startsWith('severity_')) {
            await handleSeverity(interaction, googleSheets);
        } else if (customId.startsWith('meal_')) {
            await handleMealTime(interaction, googleSheets);
        } else if (customId.startsWith('bristol_')) {
            await handleBristol(interaction, googleSheets);
        } else if (customId.startsWith('checkin_')) {
            await digests.handleCheckInResponse(interaction, googleSheets, contextMemory);
        } else if (customId === BUTTON_IDS.undo) {
            await handleUndo(interaction, googleSheets);
        } else if (customId === BUTTON_IDS.dismiss) {
            await interaction.message.delete();
        }
    } catch (error) {
        console.error(`Error handling button interaction ${customId}:`, error);

        // Try to respond with error
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: `${EMOJI.error} ${getRandomPhrase(PHRASES.error)}`,
                    ephemeral: true
                });
            }
        } catch (e) {
            console.error('Failed to send error response:', e);
        }
    }
}

/**
 * Handle symptom type selection
 * After symptom type selected, ask for severity (1-10)
 */
async function handleSymptomType(interaction, googleSheets) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    const user = interaction.user;

    // Map button ID to symptom details
    const symptomMap = {
        [BUTTON_IDS.symptom.reflux]: { type: 'reflux', value: 'reflux', label: 'Reflux/Heartburn' },
        [BUTTON_IDS.symptom.pain]: { type: 'symptom', value: 'stomach pain', label: 'Stomach Pain' },
        [BUTTON_IDS.symptom.bloat]: { type: 'symptom', value: 'bloating', label: 'Bloating/Gas' },
        [BUTTON_IDS.symptom.nausea]: { type: 'symptom', value: 'nausea', label: 'Nausea' },
        [BUTTON_IDS.symptom.general]: { type: 'symptom', value: 'general discomfort', label: 'General Discomfort' }
    };

    const symptom = symptomMap[customId];
    if (!symptom) return;

    // Store pending clarification
    pendingClarifications.set(userId, {
        type: 'severity',
        symptomData: symptom,
        timestamp: Date.now()
    });

    // Ask for severity
    await interaction.update({
        content: `${EMOJI.symptom} **${symptom.label}**\n\nHow severe is it? (1 = mild, 10 = severe)`,
        components: buttonsSeverity(),
        embeds: []
    });
}

/**
 * Handle severity selection
 * Logs the symptom with selected severity
 */
async function handleSeverity(interaction, googleSheets) {
    const userId = interaction.user.id;
    const user = interaction.user;

    const pending = pendingClarifications.get(userId);
    if (!pending || pending.type !== 'severity') {
        await interaction.reply({
            content: `${EMOJI.error} Session expired. Please start over.`,
            ephemeral: true
        });
        return;
    }

    // Extract severity number from button ID
    const severityNum = parseInt(interaction.customId.split('_')[1]);
    const severityLabel = severityNum <= 3 ? 'mild' : (severityNum <= 6 ? 'moderate' : 'severe');

    // Clear pending
    pendingClarifications.delete(userId);

    // Log to sheets
    const result = await googleSheets.appendRow({
        user: user.tag,
        type: pending.symptomData.type,
        value: pending.symptomData.value,
        severity: severityLabel,
        notes: `Severity: ${severityNum}/10`,
        source: 'DM'
    });

    if (!result.success) {
        await interaction.update({
            content: `${EMOJI.error} ${result.error.userMessage}`,
            components: [],
            embeds: []
        });
        return;
    }

    // Add to context memory
    contextMemory.push(userId, {
        type: pending.symptomData.type,
        details: pending.symptomData.value,
        severity: severityLabel,
        timestamp: Date.now()
    });

    // Success response
    const successMsg = getRandomPhrase(PHRASES.success);
    await interaction.update({
        content: `${EMOJI.success} Logged **${pending.symptomData.label}** (${severityLabel}).\n\n${successMsg}`,
        components: [],
        embeds: []
    });

    // Check for rough patch
    if (contextMemory.hasRoughPatch(userId)) {
        setTimeout(async () => {
            try {
                await interaction.followUp({
                    content: getRandomPhrase(PHRASES.roughPatch),
                    ephemeral: true
                });
            } catch (e) {
                console.error('Failed to send rough patch message:', e);
            }
        }, 1000);
    }
}

/**
 * Handle meal time selection
 * Logs food/drink with selected meal time in notes
 */
async function handleMealTime(interaction, googleSheets) {
    const userId = interaction.user.id;
    const user = interaction.user;

    const pending = pendingClarifications.get(userId);
    if (!pending || pending.type !== 'mealTime') {
        await interaction.reply({
            content: `${EMOJI.error} Session expired. Please start over.`,
            ephemeral: true
        });
        return;
    }

    // Map button ID to meal time
    const mealMap = {
        [BUTTON_IDS.meal.breakfast]: 'Breakfast',
        [BUTTON_IDS.meal.lunch]: 'Lunch',
        [BUTTON_IDS.meal.dinner]: 'Dinner',
        [BUTTON_IDS.meal.snack]: 'Snack'
    };

    const mealTime = mealMap[interaction.customId];
    if (!mealTime) return;

    // Clear pending
    pendingClarifications.delete(userId);

    // Log to sheets with meal time in notes
    const result = await googleSheets.appendRow({
        user: user.tag,
        type: pending.entryData.type,
        value: pending.entryData.value,
        notes: pending.entryData.notes || '',
        notesAppend: mealTime,
        mealType: mealTime,
        source: 'DM'
    });

    if (!result.success) {
        await interaction.update({
            content: `${EMOJI.error} ${result.error.userMessage}`,
            components: [],
            embeds: []
        });
        return;
    }

    // Add to context memory
    contextMemory.push(userId, {
        type: pending.entryData.type,
        details: pending.entryData.value,
        timestamp: Date.now()
    });

    // Success response
    const emoji = pending.entryData.type === 'food' ? EMOJI.food : EMOJI.drink;
    const successMsg = getRandomPhrase(PHRASES.success);
    await interaction.update({
        content: `${emoji} Logged **${pending.entryData.value}** (${mealTime}).\n\n${successMsg}`,
        components: [],
        embeds: []
    });
}

/**
 * Handle Bristol scale selection for BM entries
 */
async function handleBristol(interaction, googleSheets) {
    const userId = interaction.user.id;
    const user = interaction.user;

    const pending = pendingClarifications.get(userId);
    if (!pending || pending.type !== 'bristol') {
        await interaction.reply({
            content: `${EMOJI.error} Session expired. Please start over.`,
            ephemeral: true
        });
        return;
    }

    // Extract Bristol number
    const bristolNum = interaction.customId.split('_')[1];

    // Clear pending
    pendingClarifications.delete(userId);

    // Log to sheets
    const result = await googleSheets.appendRow({
        user: user.tag,
        type: 'bm',
        value: `Bristol ${bristolNum}`,
        bristolScale: bristolNum,
        notes: pending.notes || '',
        source: 'DM'
    });

    if (!result.success) {
        await interaction.update({
            content: `${EMOJI.error} ${result.error.userMessage}`,
            components: [],
            embeds: []
        });
        return;
    }

    // Add to context memory
    contextMemory.push(userId, {
        type: 'bm',
        details: `Bristol ${bristolNum}`,
        timestamp: Date.now()
    });

    // Success response
    const successMsg = getRandomPhrase(PHRASES.success);
    await interaction.update({
        content: `${EMOJI.bm} Logged BM (Bristol ${bristolNum}).\n\n${successMsg}`,
        components: [],
        embeds: []
    });
}

/**
 * Handle undo last entry
 */
async function handleUndo(interaction, googleSheets) {
    const user = interaction.user;

    await interaction.deferReply({ ephemeral: true });

    const result = await googleSheets.undoLastEntry(user.tag);

    if (result.success) {
        await interaction.editReply({
            content: `${EMOJI.success} ${result.message}`
        });
    } else {
        await interaction.editReply({
            content: `${EMOJI.error} ${result.message}`
        });
    }
}

/**
 * Request symptom type clarification
 * Call this from NLP handler when symptom is vague
 */
async function requestSymptomClarification(message) {
    const { buttonsSymptomType } = require('../ui/components');

    await message.reply({
        content: `${EMOJI.symptom} I want to log this correctly.\n\nWhat type of symptom are you experiencing?`,
        components: buttonsSymptomType()
    });
}

/**
 * Request meal time clarification
 * Call this from NLP handler when food/drink lacks time context
 */
async function requestMealTimeClarification(message, entryData) {
    const { buttonsMealTime } = require('../ui/components');

    // Store pending clarification
    pendingClarifications.set(message.author.id, {
        type: 'mealTime',
        entryData: entryData,
        timestamp: Date.now()
    });

    await message.reply({
        content: `${EMOJI.food} When did you have this?`,
        components: buttonsMealTime()
    });
}

/**
 * Request Bristol scale clarification
 * Call this from NLP handler when BM lacks detail
 */
async function requestBristolClarification(message, notes = '') {
    const { buttonsBristol } = require('../ui/components');

    // Store pending clarification
    pendingClarifications.set(message.author.id, {
        type: 'bristol',
        notes: notes,
        timestamp: Date.now()
    });

    await message.reply({
        content: `${EMOJI.bm} I'll log this bowel movement. Can you provide more details?`,
        components: buttonsBristol()
    });
}

// Cleanup expired pending clarifications every 5 minutes
setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 minutes

    for (const [userId, data] of pendingClarifications.entries()) {
        if (now - data.timestamp > TIMEOUT) {
            pendingClarifications.delete(userId);
        }
    }
}, 5 * 60 * 1000);

module.exports = {
    handleButtonInteraction,
    requestSymptomClarification,
    requestMealTimeClarification,
    requestBristolClarification,
    pendingClarifications
};
