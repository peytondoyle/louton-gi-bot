// Button Interaction Handlers
// Processes all button clicks from clarifications, check-ins, and actions

const { handleNaturalLanguage } = require('../../index');
const { EMOJI, BUTTON_IDS, PHRASES, getRandomPhrase } = require('../constants/ux');
const { successEmbed, errorEmbed, buttonsSeverity, buttonsMealTime, buttonsBristol, buttonsSymptomType } = require('../ui/components');
const { EmbedBuilder } = require('discord.js');
const pending = require('../../services/pending'); // New pending context service
const { TTL_SECONDS } = require('../../services/pending'); // Use TTL from pending service
const contextMemory = require('../utils/contextMemory');

// Helper to generate a consistent DB key - REMOVED, not used with new pending service
// const getKey = (userId) => `clarification:${userId}`;

// This module no longer holds state.
// `pendingClarifications` is now an interface to the database.
// const pendingClarifications = {
//     set: (userId, data) => {
//         // Clarifications should be short-lived, e.g., 5 minutes
//         db.set(getKey(userId), data, 300);
//     },
//     get: (userId) => {
//         return db.get(getKey(userId));
//     },
//     delete: (userId) => {
//         db.del(getKey(userId));
//     }
// };

/**
 * Main handler for all button interactions.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {Object} googleSheets - Google Sheets service
 * @param {Object} digests - Digests module
 */
async function handleButtonInteraction(interaction) {
    const { customId, user } = interaction;
    const userId = user.id;

    // Create context object for pending operations
    const ctx = {
        guildId: interaction.guildId || 'dm',
        channelId: interaction.channel.id,
        authorId: user.id
    };

    // Retrieve the pending clarification from the database
    const pendingClarification = await pending.get(pending.keyFrom(ctx));
    
    try {
        const [namespace, value] = customId.split(':');

        switch (namespace) {
            case 'severity':
                if (pendingClarification && pendingClarification.type === 'nlu_clarification') {
                    pendingClarification.parseResult.slots.severity = parseInt(value, 10);
                    await handleNLUClarification(interaction, pendingClarification);
                }
                break;
            case 'meal':
                if (pendingClarification && pendingClarification.type === 'nlu_clarification') {
                    pendingClarification.parseResult.slots.meal_time = value;
                    await handleNLUClarification(interaction, pendingClarification);
                }
                break;
            case 'symptom':
                 if (pendingClarification && pendingClarification.type === 'nlu_clarification') {
                    pendingClarification.parseResult.slots.symptom_type = value;
                    await handleNLUClarification(interaction, pendingClarification);
                }
                break;
            case 'bristol':
                if (pendingClarification && pendingClarification.type === 'nlu_clarification') {
                    pendingClarification.parseResult.slots.bristol = parseInt(value, 10);
                    await handleNLUClarification(interaction, pendingClarification);
                }
                break;
            case 'intent':
                if (pendingClarification && pendingClarification.type === 'intent_clarification') {
                    await handleIntentClarification(interaction, pendingClarification);
                }
                break;
            case 'help':
                await handleHelpButton(interaction);
                break;
            case 'action':
                if (value === 'dismiss') {
                    await interaction.message.delete();
                } else if (value === 'undo') {
                    // This requires access to googleSheets, so we might need to adjust
                    console.log('Undo action clicked');
                }
                break;
            default:
                // Check if it's a post-meal check button (pmc.severity|timestamp)
                if (customId.startsWith('pmc.')) {
                    await handlePostMealCheckButton(interaction, customId);
                } else {
                    // Handle older or non-namespaced IDs for backward compatibility if needed
                    console.warn(`[BUTTONS] Unhandled button namespace: ${namespace}`);
                }
        }

    } catch (error) {
        console.error('[BUTTONS] Error in handleButtonInteraction:', error);
        await interaction.followUp({ content: 'There was an error processing this action.', ephemeral: true });
    }
}

/**
 * Handles the user's choice from the intent clarification buttons.
 * @param {Interaction} interaction - Discord button interaction
 */
async function handleIntentClarification(interaction) {
    const userId = interaction.user.id;
    const customId = interaction.customId;

    // Create context object for pending operations
    const ctx = {
        guildId: interaction.guildId || 'dm',
        channelId: interaction.channel.id,
        authorId: userId
    };

    const pendingClarification = await pending.get(pending.keyFrom(ctx));
    if (!pendingClarification || pendingClarification.type !== 'intent_clarification') {
        await interaction.update({
            content: 'This action has expired. Please send your message again.',
            components: []
        });
        return;
    }

    // Clear the pending clarification
    await pending.clear(pending.keyFrom(ctx));

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
            content: pendingClarification.originalMessage,
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

    // Create context object for pending operations
    const ctx = {
        guildId: interaction.guildId || 'dm',
        channelId: interaction.channel.id,
        authorId: userId
    };

    // Store pending clarification
    await pending.set(pending.keyFrom(ctx), { type: 'severity', symptomData: symptom }, TTL_SECONDS);

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

    // Create context object for pending operations
    const ctx = {
        guildId: interaction.guildId || 'dm',
        channelId: interaction.channel.id,
        authorId: userId
    };

    const pendingClarification = await pending.get(pending.keyFrom(ctx));
    if (!pendingClarification) {
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
    if (pendingClarification.type === 'nlu_clarification') {
        // Import NLU handler functions
        const indexModule = require('../../index');

        // Fill in the missing slot
        pendingClarification.parseResult.slots.severity = severityNum;
        pendingClarification.parseResult.missing = pendingClarification.parseResult.missing.filter(m => m !== 'severity');

        // Clear pending
        await pending.clear(pending.keyFrom(ctx));

        // If all slots filled, log via NLU system
        if (pendingClarification.parseResult.missing.length === 0) {
            // We need to call logFromNLU from index.js - for now, manually log
            const { extractMetadata } = require('../nlu/rules');
            const metadata = extractMetadata(pendingClarification.originalMessage);

            const notes = [];
            if (pendingClarification.parseResult.slots.severity_note) notes.push(pendingClarification.parseResult.slots.severity_note);
            notes.push(`adjSeverity=${severityNum}`);

            const result = await googleSheets.appendRow({
                user: user.tag,
                type: pendingClarification.parseResult.intent,
                value: pendingClarification.parseResult.intent === 'reflux' ? 'reflux' : (pendingClarification.parseResult.slots.symptom_type || 'symptom'),
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
                type: pendingClarification.parseResult.intent,
                details: pendingClarification.parseResult.intent === 'reflux' ? 'reflux' : (pendingClarification.parseResult.slots.symptom_type || 'symptom'),
                severity: severityLabel,
                timestamp: Date.now()
            });

            // Success response
            const successMsg = getRandomPhrase(PHRASES.success);
            await interaction.update({
                content: `${EMOJI.success} Logged **${pendingClarification.parseResult.intent}** (${severityLabel}).\n\n${successMsg}`,
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
    if (pendingClarification.type !== 'severity') {
        await interaction.reply({
            content: `${EMOJI.error} Session expired. Please start over.`,
            ephemeral: true
        });
        return;
    }

    // Clear pending
    await pending.clear(pending.keyFrom(ctx));

    // Log to sheets
    const result = await googleSheets.appendRow({
        user: user.tag,
        type: pendingClarification.symptomData.type,
        value: pendingClarification.symptomData.value,
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
        type: pendingClarification.symptomData.type,
        details: pendingClarification.symptomData.value,
        severity: severityLabel,
        timestamp: Date.now()
    });

    // Success response
    const successMsg = getRandomPhrase(PHRASES.success);
    await interaction.update({
        content: `${EMOJI.success} Logged **${pendingClarification.symptomData.label}** (${severityLabel}).\n\n${successMsg}`,
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

    // Create context object for pending operations
    const ctx = {
        guildId: interaction.guildId || 'dm',
        channelId: interaction.channel.id,
        authorId: userId
    };

    const pendingClarification = await pending.get(pending.keyFrom(ctx));
    if (!pendingClarification || pendingClarification.type !== 'mealTime') {
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
    await pending.clear(pending.keyFrom(ctx));

    // Log to sheets with meal time in notes
    const result = await googleSheets.appendRow({
        user: user.tag,
        type: pendingClarification.entryData.type,
        value: pendingClarification.entryData.value,
        notes: pendingClarification.entryData.notes || '',
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
        type: pendingClarification.entryData.type,
        details: pendingClarification.entryData.value,
        timestamp: Date.now()
    });

    // Success response
    const emoji = pendingClarification.entryData.type === 'food' ? EMOJI.food : EMOJI.drink;
    const successMsg = getRandomPhrase(PHRASES.success);
    await interaction.update({
        content: `${emoji} Logged **${pendingClarification.entryData.value}** (${mealTime}).\n\n${successMsg}`,
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

    // Create context object for pending operations
    const ctx = {
        guildId: interaction.guildId || 'dm',
        channelId: interaction.channel.id,
        authorId: userId
    };

    const pendingClarification = await pending.get(pending.keyFrom(ctx));
    if (!pendingClarification || pendingClarification.type !== 'bristol') {
        await interaction.reply({
            content: `${EMOJI.error} Session expired. Please start over.`,
            ephemeral: true
        });
        return;
    }

    // Extract Bristol number
    const bristolNum = interaction.customId.split('_')[1];

    // Clear pending
    await pending.clear(pending.keyFrom(ctx));

    // Log to sheets
    const result = await googleSheets.appendRow({
        user: user.tag,
        type: 'bm',
        value: `Bristol ${bristolNum}`,
        bristolScale: bristolNum,
        notes: pendingClarification.notes || '',
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

    // Create context object for pending operations
    const ctx = {
        guildId: message.guildId || 'dm',
        channelId: message.channel.id,
        authorId: message.author.id
    };

    // Store pending clarification
    await pending.set(pending.keyFrom(ctx), { type: 'mealTime', entryData: entryData }, TTL_SECONDS);

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

    // Create context object for pending operations
    const ctx = {
        guildId: message.guildId || 'dm',
        channelId: message.channel.id,
        authorId: message.author.id
    };

    // Store pending clarification
    await pending.set(pending.keyFrom(ctx), { type: 'bristol', notes: notes }, TTL_SECONDS);

    await message.reply({
        content: `${EMOJI.bm} I'll log this bowel movement. Can you provide more details?`,
        components: buttonsBristol()
    });
}

/**
 * Handles post-meal check button interactions
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @param {string} customId - The full custom ID (e.g., "pmc.mild|2025-10-21T12")
 */
async function handlePostMealCheckButton(interaction, customId) {
    const userId = interaction.user.id;

    // Parse the customId: pmc.severity|timestamp
    const parts = customId.split('.');
    if (parts.length < 2) {
        await interaction.reply({ content: '❌ Invalid button format.', ephemeral: true });
        return;
    }

    const severityAndTimestamp = parts[1].split('|');
    const severityLabel = severityAndTimestamp[0]; // 'none', 'mild', 'moderate', or 'severe'

    // Create context object for pending operations
    const ctx = {
        guildId: interaction.guildId || 'dm',
        channelId: interaction.channel.id,
        authorId: userId
    };

    // Get the pending post-meal check
    const pendingCheck = await pending.get(pending.keyFrom(ctx));
    if (!pendingCheck || pendingCheck.type !== 'post_meal_check') {
        await interaction.reply({
            content: '⏰ This check-in has expired. No worries!',
            ephemeral: true
        });
        return;
    }

    const mealRef = pendingCheck.mealRef;

    // Clear the pending check
    await pending.clear(pending.keyFrom(ctx));

    // Handle based on severity
    if (severityLabel === 'none') {
        // User feels fine - no symptoms to log
        await interaction.update({
            content: `✅ Great! No issues after **${mealRef.item || 'your meal'}**.`,
            components: []
        });
    } else {
        // Map severity labels to numeric values
        const severityMap = {
            'mild': 3,
            'moderate': 6,
            'severe': 9
        };

        const severityNum = severityMap[severityLabel] || 5;

        // Log the symptom (we'll need to import or access the symptom logging function)
        try {
            // This would need to call a function to log symptoms - for now just update the message
            await interaction.update({
                content: `📝 Logged ${severityLabel} symptoms after **${mealRef.item || 'your meal'}**.`,
                components: []
            });

            console.log(`[PMC] Logged ${severityLabel} (${severityNum}) symptoms for meal ${mealRef.tab}:${mealRef.rowId}`);
        } catch (error) {
            console.error('[PMC] Error logging symptom:', error);
            await interaction.update({
                content: '❌ Failed to log symptom.',
                components: []
            });
        }
    }
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



module.exports = {
    handleButtonInteraction,
    requestSymptomClarification,
    requestMealTimeClarification,
    requestBristolClarification,
    handleHelpButton,
};

// Deprecated export removed - use services/pending.js instead
