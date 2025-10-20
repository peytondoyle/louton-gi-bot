// Button Interaction Handlers
// Processes all button clicks from clarifications, check-ins, and actions

const { BUTTON_IDS, EMOJI, getRandomPhrase, PHRASES, formatPhrase } = require('../constants/ux');
const { successEmbed, errorEmbed, buttonsSeverity, buttonsMealTime } = require('../ui/components');
const contextMemory = require('../utils/contextMemory');
const { EmbedBuilder } = require('discord.js');

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
        } else if (customId.startsWith('intent_')) {
            await handleIntentClarification(interaction);
        } else if (customId === BUTTON_IDS.undo) {
            await handleUndo(interaction, googleSheets);
        } else if (customId === BUTTON_IDS.dismiss) {
            await interaction.message.delete();
        } else if (customId.startsWith('help_')) {
            await handleHelpButton(interaction);
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
 * Handles the user's choice from the intent clarification buttons.
 * @param {Interaction} interaction - Discord button interaction
 */
async function handleIntentClarification(interaction) {
    const userId = interaction.user.id;
    const customId = interaction.customId;

    const pending = pendingClarifications.get(userId);
    if (!pending || pending.type !== 'intent_clarification') {
        await interaction.update({
            content: 'This action has expired. Please send your message again.',
            components: []
        });
        return;
    }

    // Clear the pending clarification
    pendingClarifications.delete(userId);

    if (customId === BUTTON_IDS.intent.cancel) {
        await interaction.update({
            content: 'Ok, action cancelled.',
            components: []
        });
        return;
    }

    let forcedIntent = null;
    if (customId === BUTTON_IDS.intent.log_food) {
        forcedIntent = 'food';
    } else if (customId === BUTTON_IDS.intent.log_symptom) {
        forcedIntent = 'symptom';
    }

    if (forcedIntent) {
        // We need to re-process the original message with the forced intent.
        // This requires access to the `handleNaturalLanguage` function from `index.js`.
        // To avoid circular dependencies, we'll get it from the module cache.
        const { handleNaturalLanguage } = require('../../index');

        // Create a fake message object to pass to the handler
        const fakeMessage = {
            ...interaction.message,
            author: interaction.user,
            content: pending.originalMessage,
            // Re-parsing, so we need a reply method.
            // Let's edit the interaction reply.
            reply: (options) => {
                // First time we just update the original "how should I log this" message
                return interaction.update({ ...options, components: [] });
            }
        };

        // Add a flag to the fake message to indicate it's a re-parse
        fakeMessage.isReparse = true;
        fakeMessage.forcedIntent = forcedIntent;

        console.log(`[ButtonHandler] Re-parsing with forced intent: '${forcedIntent}'`);
        await handleNaturalLanguage(fakeMessage);
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
    if (!pending) {
        await interaction.reply({
            content: `${EMOJI.error} Session expired. Please start over.`,
            ephemeral: true
        });
        return;
    }

    // Extract severity number from button ID
    const severityNum = parseInt(interaction.customId.split('_')[1]);
    const severityLabel = severityNum <= 3 ? 'mild' : (severityNum <= 6 ? 'moderate' : 'severe');

    // Check if this is an NLU clarification
    if (pending.type === 'nlu_clarification') {
        // Import NLU handler functions
        const indexModule = require('../../index');

        // Fill in the missing slot
        pending.parseResult.slots.severity = severityNum;
        pending.parseResult.missing = pending.parseResult.missing.filter(m => m !== 'severity');

        // Clear pending
        pendingClarifications.delete(userId);

        // If all slots filled, log via NLU system
        if (pending.parseResult.missing.length === 0) {
            // We need to call logFromNLU from index.js - for now, manually log
            const { extractMetadata } = require('../nlu/rules');
            const metadata = extractMetadata(pending.originalMessage);

            const notes = [];
            if (pending.parseResult.slots.severity_note) notes.push(pending.parseResult.slots.severity_note);
            notes.push(`adjSeverity=${severityNum}`);

            const result = await googleSheets.appendRow({
                user: user.tag,
                type: pending.parseResult.intent,
                value: pending.parseResult.intent === 'reflux' ? 'reflux' : (pending.parseResult.slots.symptom_type || 'symptom'),
                severity: severityLabel,
                notes: googleSheets.appendNotes ? googleSheets.appendNotes(notes) : notes.join('; '),
                source: 'discord-dm-nlu'
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
                type: pending.parseResult.intent,
                details: pending.parseResult.intent === 'reflux' ? 'reflux' : (pending.parseResult.slots.symptom_type || 'symptom'),
                severity: severityLabel,
                timestamp: Date.now()
            });

            // Success response
            const successMsg = getRandomPhrase(PHRASES.success);
            await interaction.update({
                content: `${EMOJI.success} Logged **${pending.parseResult.intent}** (${severityLabel}).\n\n${successMsg}`,
                components: [],
                embeds: []
            });
        } else {
            // Still missing slots - continue clarification flow
            await interaction.update({
                content: `${EMOJI.thinking} Please continue...`,
                components: [],
                embeds: []
            });
        }
        return;
    }

    // Original severity handler for non-NLU flows
    if (pending.type !== 'severity') {
        await interaction.reply({
            content: `${EMOJI.error} Session expired. Please start over.`,
            ephemeral: true
        });
        return;
    }

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

/**
 * Handles clicks on the buttons from the new conversational help system.
 * Sends an ephemeral message with detailed examples for the chosen topic.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 */
async function handleHelpButton(interaction) {
    const topic = interaction.customId.split(':')[1];

    let title = '';
    let content = '';

    switch (topic) {
        case 'logging':
            title = '💡 Logging Examples';
            content = `
You can log any of these things just by saying them:
- **Foods & Drinks:** \`"I had a banana and oat milk for breakfast"\`
- **Symptoms:** \`"log a mild stomach ache"\` or \`"I have some bad reflux"\`
- **Bowel Movements:** \`"log a BM, bristol 4"\`
- **Mood & Energy:** \`"I'm feeling really energetic today"\` or \`"feeling tired"\`

**Advanced Logging:**
- **With Sides:** \`"A smoothie with protein powder and berries"\`
- **Learned Meals:** \`"I had my usual morning coffee"\` (uses your learned calorie count!)
- **Follow-ups:** After I ask how you're feeling, you can just say \`"better"\` or \`"a little bloated"\`.
            `;
            break;
        case 'asking':
            title = '❓ Asking Questions';
            content = `
I can search and analyze your logs. Just ask me a question in plain English:
- \`"How many times did I have reflux last week?"\`
- \`"What did I eat before I got bloated on Tuesday?"\`
- \`"Show me all the times I logged coffee."\`
- \`"What was my average symptom severity last month?"\`
            `;
            break;
        case 'settings':
            title = '⚙️ Managing Your Settings';
            content = `
You can manage your reminders and preferences with simple phrases:
- \`"show me my settings"\` to see your current configuration.
- \`"turn reminders on"\` or \`"turn reminders off"\`
- \`"set my morning check-in for 8:30am"\`
- \`"disable the evening recap"\`
- \`"change my timezone to America/New_York"\`
            `;
            break;
        default:
            return interaction.reply({ content: 'Sorry, I don\'t recognize that help topic.', ephemeral: true });
    }

    const helpEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(content.trim())
        .setColor('#5865F2');

    await interaction.reply({
        embeds: [helpEmbed],
        ephemeral: true // This makes the message visible only to the user who clicked
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
    pendingClarifications,
    handleHelpButton,
};
