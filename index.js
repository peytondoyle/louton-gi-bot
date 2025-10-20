require('dotenv').config();

// Auto-setup credentials on Replit
if (process.env.REPL_ID && !require('fs').existsSync('credentials.json')) {
    console.log('🔧 Setting up credentials from environment variables...');
    require('./setup-credentials');
}

const { Client, GatewayIntentBits, EmbedBuilder, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const moment = require('moment-timezone');
const googleSheets = require('./services/googleSheets');
const analyzer = require('./utils/analyzer');
const NLPHandler = require('./utils/nlpHandler');
const PatternAnalyzer = require('./utils/patternAnalyzer');
const ClarificationHandler = require('./utils/clarificationHandler');
const keepAlive = require('./keep_alive');

// NLU System imports - V2 UPGRADE
const { understand, formatParseResult } = require('./src/nlu/understand-v2');
const { extractMetadata } = require('./src/nlu/rules');
const { getWindowStartTime } = require('./src/nlu/ontology');
const { record: recordNLUMetrics } = require('./src/nlu/metrics-v2');
const { postprocess } = require('./src/nlu/postprocess');

// Command Palette System
const { handleHelpPalette } = require('./src/commands/helpPalette');
const { CommandRegistry } = require('./src/commands/registry');

// Charts System
const { handleChart } = require('./src/commands/chart');
const { handleChartsMenu, handleChartButton } = require('./src/commands/chartsMenu');

// UX System imports
const { EMOJI, PHRASES, getRandomPhrase, BUTTON_IDS } = require('./src/constants/ux');
const { buttonsSeverity, buttonsMealTime, buttonsBristol, buttonsSymptomType, trendChip } = require('./src/ui/components');
const { buildPostLogChips } = require('./src/ui/chips');
const contextMemory = require('./src/utils/contextMemory');
const digests = require('./src/scheduler/digests');
const buttonHandlers = require('./src/handlers/buttonHandlers');
const uxButtons = require('./src/handlers/uxButtons');
const { isDuplicate } = require('./src/utils/dedupe');
const { validateQuality } = require('./src/utils/qualityCheck');

// Calorie estimation
const { estimateCaloriesForItemAndSides } = require('./src/nutrition/estimateCalories');

// Reminders & preferences
const { getUserPrefs, setUserPrefs } = require('./services/prefs');
const { scheduleAll, updateUserSchedule } = require('./src/scheduler/reminders');
const { scheduleContextualFollowups } = require('./src/handlers/contextualFollowups');
const dndCommands = require('./src/commands/dnd');
const { markInteracted, isUnderWatch } = require('./src/reminders/responseWatcher');

// Start keep-alive server for Replit deployment
keepAlive();

// ========== Phase 5: Performance & Monitoring ==========
const { startHeartbeat } = require('./src/health/heartbeat');
const { handleNLUStats, recordNLUParse } = require('./src/commands/nluStats');

// Start heartbeat monitor
startHeartbeat();
// ======================================================

// ========== Clean Messaging System (Phase 7) ==========
// Monkey-patch message.reply() globally to remove gray reply bar
const { sendCleanReply } = require('./src/utils/messaging');
const { Message } = require('discord.js');

Message.prototype.reply = function (content, options) {
  return sendCleanReply(this, content, options);
};
console.log('✅ Patched Message.prototype.reply() → clean sends (no gray bar)');
// ======================================================

// Initialize Discord client with DM support
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message], // Required for DMs in Discord.js v14
});

// Debug: Log client configuration
console.log('🔧 Initializing Discord client with:');
console.log('   Intents: Guilds, GuildMessages, MessageContent, DirectMessages');
console.log('   Partials: Channel, Message (required for DM support)');

// Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const USER1_NAME = process.env.USER1_NAME || 'User1';
const USER2_NAME = process.env.USER2_NAME || 'User2';
const TIMEZONE = process.env.TIMEZONE || 'America/Los_Angeles';
const ENABLE_REMINDERS = process.env.ENABLE_REMINDERS === 'true';

// User IDs for multi-user support
const PEYTON_ID = process.env.PEYTON_ID || "552563833814646806";
const LOUIS_ID = process.env.LOUIS_ID || "552563833814646807";

// Per-user daily calorie goals (in-memory storage)
const userGoals = new Map();

// Symptom follow-up timers (userId -> timeoutId)
const pendingFollowups = new Map();

// Trigger foods and drinks to track
const TRIGGER_ITEMS = {
    positive: ['chai', 'water', 'herbal tea', 'ginger tea', 'chamomile'],
    warning: ['refresher', 'coffee', 'alcohol', 'soda', 'energy drink'],
    problematic: ['spicy', 'dairy', 'gluten', 'fried', 'citrus', 'tomato']
};

// Motivational responses
const RESPONSES = {
    positive: [
        "Great choice! Your gut will thank you! 💚",
        "Excellent! Keep up the healthy habits! 🌟",
        "That's wonderful! You're taking care of yourself! 💪",
        "Perfect! Your digestive system loves this! ✨"
    ],
    warning: [
        "Noted! Remember to monitor how you feel after this. 📝",
        "Got it! Let's track how this affects you. 📊",
        "Recorded! Keep an eye on any symptoms. 👀",
        "Logged! Consider alternatives if you notice patterns. 💭"
    ],
    symptom: [
        "I've logged that. Take care of yourself! 💙",
        "Recorded. Remember to stay hydrated! 💧",
        "Got it. Let me know if symptoms persist. 📝",
        "Noted. Your tracking will help identify patterns! 📈"
    ],
    general: [
        "Logged successfully! 📝",
        "Got it, I've recorded that! ✅",
        "Entry saved! Keep tracking! 📊",
        "Recorded! Great job staying consistent! 🎯"
    ]
};

// Command handlers
const commands = {
    '!food': handleFood,
    '!symptom': handleSymptom,
    '!bm': handleBM,
    '!reflux': handleReflux,
    '!drink': handleDrink,
    '!help': handleHelpPalette,        // Command Palette (interactive)
    '!palette': handleHelpPalette,     // Alias
    '!commands': handleHelpPalette,    // Alias
    '!howto': handleHowto,
    '!today': handleToday,
    '!week': handleWeek,
    '!streak': handleStreak,
    '!patterns': handlePatterns,
    '!undo': handleUndo,
    '!insights': handleInsights,
    '!triggers': handleTriggers,
    '!trends': handleTrends,
    '!weekly': handleWeeklySummary,
    '!goal': handleGoal,
    '!reminders': handleReminders,
    '!dnd': handleDND,
    '!timezone': handleTimezone,
    '!snooze': handleSnooze,
    '!nlu-stats': handleNLUStats,
    '!chart': (msg, args) => handleChart(msg, args, { googleSheets, getUserPrefs, getLogSheetNameForUser: googleSheets.getLogSheetNameForUser, PEYTON_ID }),
    '!charts': handleChartsMenu,
    '!test': handleTest
};

// Add raw event debug listener
client.on('raw', (packet) => {
    // Only log MESSAGE_CREATE events for debugging
    if (packet.t === 'MESSAGE_CREATE') {
        console.log('🔔 Raw MESSAGE_CREATE event received');
    }
});

// Bot ready event
client.once('ready', async () => {
    const timestamp = new Date().toLocaleString('en-US', {
        timeZone: TIMEZONE,
        dateStyle: 'medium',
        timeStyle: 'medium'
    });

    console.log(`✅ Louton GI Bot is online as ${client.user.tag}`);
    console.log(`🕐 Bot ready at: ${timestamp}`);
    console.log(`📍 Mode: ${CHANNEL_ID ? 'Channel + DM' : 'DM Only'}`);

    // Initialize Google Sheets
    try {
        await googleSheets.initialize();
        console.log('✅ Connected to Google Sheets');

        // Ensure tabs exist for multi-user support
        console.log('🔧 Ensuring user tabs exist...');
        await googleSheets.ensureSheetAndHeaders('Peyton', [
            'Timestamp', 'User', 'Type', 'Details', 'Severity', 'Notes', 'Date', 'Source', 'Calories'
        ]);
        await googleSheets.ensureSheetAndHeaders('Louis', [
            'Timestamp', 'User', 'Type', 'Details', 'Severity', 'Notes', 'Date', 'Source', 'Calories'
        ]);
        await googleSheets.ensureSheetAndHeaders('Health_Peyton', [
            'Date', 'Active_kcal', 'Basal_kcal', 'Total_kcal', 'Steps', 'Exercise_min', 'Weight', 'Source'
        ]);
        console.log('✅ User tabs ensured: Peyton, Louis, Health_Peyton');

        // Set up proactive reminders (per-user, timezone-aware)
        console.log('🔔 Setting up proactive reminders...');
        await scheduleAll(client, googleSheets, {
            getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),
            getTodayEntries: googleSheets.getTodayEntries.bind(googleSheets),
            setUserPrefs: (id, partial) => setUserPrefs(id, partial, googleSheets)
        });
        console.log('✅ Proactive reminders initialized');
    } catch (error) {
        console.error('❌ Failed to connect to Google Sheets:', error.message);
        console.log('The bot will continue but data logging will fail.');
    }

    // Set up scheduled reminders if enabled (legacy)
    if (ENABLE_REMINDERS) {
        setupReminders();
    }

    console.log('🚀 Bot is fully operational and ready for commands!');
});

// Button interaction listener
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    // ========== PHASE 4.1: RESPONSE WATCHER ==========
    // Check if user is under watch (within 20 min of reminder)
    const userId = interaction.user.id;
    if (isUnderWatch(userId)) {
        const prefs = await getUserPrefs(userId, googleSheets);
        await markInteracted(userId, prefs, googleSheets);
    }

    // Route chart buttons
    if (interaction.customId.startsWith('chart:')) {
        const chartDeps = {
            googleSheets,
            getUserPrefs,
            getLogSheetNameForUser: googleSheets.getLogSheetNameForUser,
            PEYTON_ID
        };
        await handleChartButton(interaction, chartDeps);
        return;
    }

    // Route UX buttons (Phase 2)
    if (interaction.customId.startsWith('ux:')) {
        const uxDeps = {
            googleSheets,
            sendCleanReply,
            getLogSheetNameForUser: googleSheets.getLogSheetNameForUser
        };
        await uxButtons.handleUxButton(interaction, uxDeps);
        return;
    }

    // Route to existing button handlers (severity, mealTime, etc.)
    await buttonHandlers.handleButtonInteraction(interaction, googleSheets, digests);
});

// Add debug test handler
async function handleTest(message) {
    console.log('🧪 Test command received!');
    await message.reply('✅ Bot is working! I can receive and respond to your messages.');
}

// ========== NLU SYSTEM HELPER FUNCTIONS ==========

/**
 * Handle natural language (non-command) messages
 */
async function handleNaturalLanguage(message) {
    // Ensure message has reply() method
    const { ensureReply } = require('./src/utils/ensureReply');
    message = ensureReply(message);

    const text = message.content.trim();
    const userId = message.author.id;
    const userTag = message.author.tag;

    // ========== DEDUPLICATION ==========
    // Ignore duplicate messages from same user within 2-second window
    if (isDuplicate(userId, text, message.createdTimestamp)) {
        console.log(`[ROUTER] ⏭️  Skipping duplicate message from ${userTag}: "${text}"`);
        return;
    }

    // ========== PENDING UX INTERACTIONS ==========
    // Check if user is responding to a pending UX action (photo, custom portion, custom brand)
    const uxDeps = { googleSheets, getLogSheetNameForUser: googleSheets.getLogSheetNameForUser };

    // Handle photo attachments
    if (message.attachments.size > 0) {
        const handled = await uxButtons.handlePhotoMessage(message, uxDeps);
        if (handled) return;
    }

    // Handle custom text input for portion/brand
    const customHandled = await uxButtons.handleCustomInput(message, uxDeps);
    if (customHandled) return;

    // Check for correction syntax first
    if (text.toLowerCase().startsWith('correction:') || text.startsWith('*')) {
        await handleCorrection(message, text);
        return;
    }

    // Track if save succeeded (to prevent false error messages)
    let saveSucceeded = false;

    try {
        // Parse intent and slots with V2
        const userPrefs = await getUserPrefs(userId, googleSheets);
        const tz = userPrefs.TZ || TIMEZONE;

        const result = await understand(text, { userId, tz }, contextMemory);

        // Postprocess for token normalization
        postprocess(result);

        console.log(`🧠 NLU-V2: ${formatParseResult(result)}`);

        // Track V2 metrics
        recordNLUMetrics(result);

        // Phase 5: Track legacy NLU metrics (keep for compatibility)
        recordNLUParse(result, { fromCache: false, usedLLM: false });

        // Auto-enable digests for this user
        digests.autoEnableForUser(userId);

        // ========== CONVERSATION GUARD ==========
        // Only log specific intents to Sheets - don't log greetings, thanks, chit-chat
        const LOGGABLE_INTENTS = ['food', 'drink', 'symptom', 'reflux', 'bm', 'mood', 'checkin'];

        // Handle non-loggable conversational intents
        if (result.intent === 'greeting') {
            const greetings = ['Morning! 🌞', 'Hey! 👋', 'Hi there! 👋', 'Hello! 😊'];
            await message.reply(greetings[Math.floor(Math.random() * greetings.length)] + ' How are you feeling?');
            return;
        }

        if (result.intent === 'thanks') {
            const responses = ['You\'re welcome! 😊', 'Anytime! 👍', 'Happy to help! ✨', 'No problem! 😊'];
            await message.reply(responses[Math.floor(Math.random() * responses.length)]);
            return;
        }

        if (result.intent === 'chit_chat') {
            const responses = ['👍', '😊', '✨', '👌'];
            await message.reply(responses[Math.floor(Math.random() * responses.length)]);
            return;
        }

        if (result.intent === 'farewell') {
            const farewells = ['Goodnight! 🌙', 'See you later! 👋', 'Bye! Take care! 💙', 'Talk to you soon! ✨'];
            await message.reply(farewells[Math.floor(Math.random() * farewells.length)]);
            return;
        }

        // Confidence threshold: Don't auto-log if confidence < 80%
        if (LOGGABLE_INTENTS.includes(result.intent) && result.confidence < 0.8) {
            await message.reply({
                content: `${EMOJI.thinking} I'm not quite sure what you mean. Try:\n` +
                        `• "had oats for lunch"\n• "mild heartburn"\n• "bad poop"\n` +
                        `Or use commands like \`!food\`, \`!symptom\`, etc.`
            });
            return;
        }

        // If intent is not loggable and not conversational, ask for clarification
        if (!LOGGABLE_INTENTS.includes(result.intent)) {
            await message.reply({
                content: `${EMOJI.thinking} I'm not quite sure what you mean. Try:\n` +
                        `• "had oats for lunch"\n• "mild heartburn"\n• "bad poop"\n` +
                        `Or use commands like \`!food\`, \`!symptom\`, etc.`
            });
            return;
        }

        // ========== QUALITY CHECK ==========
        // Validate input quality before logging
        const qualityCheck = validateQuality(result);
        if (!qualityCheck.isValid) {
            await message.reply({
                content: `${EMOJI.thinking} ${qualityCheck.reason}`
            });
            return;
        }

        // Handle based on whether we have missing slots
        if (result.missing.length === 0) {
            // All slots present - log immediately
            saveSucceeded = await logFromNLU(message, result);
        } else {
            // Ask for missing slots via buttons
            await requestMissingSlots(message, result);
        }
    } catch (error) {
        console.error('NLU Error:', error);

        // Only send error if save didn't succeed
        if (!saveSucceeded) {
            await message.reply(`${EMOJI.error} ${getRandomPhrase(PHRASES.error)}`);
        } else {
            console.warn('[NLU] Error after successful save (not shown to user):', error.message);
        }
    }
}

/**
 * Log entry from NLU parse result
 * @returns {Promise<boolean>} - True if save succeeded, false otherwise
 * NEVER THROWS after successful append - all post-save work is fire-and-forget
 */
async function logFromNLU(message, parseResult) {
    const { intent, slots } = parseResult;
    const userId = message.author.id;
    const userTag = message.author.tag;
    const isPeyton = (userId === PEYTON_ID);

    // ========== BUILD APPEND PAYLOAD ==========
    const { buildNotesFromParse } = require('./src/utils/notesBuild');

    let notesString;
    if (slots._validatedNotes) {
        notesString = slots._validatedNotes;
        console.log('[NOTES] Using validated Notes v2.1');
    } else {
        notesString = buildNotesFromParse(parseResult);
        console.log('[NOTES] Built Notes from parse (fallback)');
    }

    // Extract metadata (pass intent as itemType) - for legacy calorie estimation
    const metadata = extractMetadata(message.content, intent);

    // Build legacy notes array (for calorie multipliers only)
    const notes = [];

    // Add meal time or inferred time window
    if (slots.meal_time) {
        notes.push(`meal=${slots.meal_time}`);
        if (slots.meal_time_note) {
            notes.push(slots.meal_time_note);
        }
    } else if (slots.time) {
        notes.push(`time=${new Date(slots.time).toLocaleTimeString()}`);
    }

    // Add portion info (new format)
    let portionMultiplier = 1.0;
    if (metadata.portion) {
        if (metadata.portion.normalized_g) {
            notes.push(`portion_g=${metadata.portion.normalized_g}`);
        }
        if (metadata.portion.normalized_ml) {
            notes.push(`portion_ml=${metadata.portion.normalized_ml}`);
        }
        if (metadata.portion.raw) {
            notes.push(`portion=${metadata.portion.raw}`);
        }
        portionMultiplier = metadata.portion.multiplier || 1.0;
    }

    // Legacy quantity/brand (kept for backward compatibility)
    if (metadata.quantity && !metadata.portion) {
        notes.push(`qty=${metadata.quantity}`);
    }
    if (metadata.brand) notes.push(`brand=${metadata.brand}`);

    // Brand-specific info (variant detection)
    if (metadata.brandInfo) {
        notes.push(`brand_variant=${metadata.brandInfo.brand}`);
        if (metadata.brandInfo.variant) {
            notes.push(`variant=${metadata.brandInfo.variant}`);
        }
        // Update portion multiplier if brand has specific calorie info
        if (metadata.brandInfo.multiplier && !metadata.portion) {
            portionMultiplier = metadata.brandInfo.multiplier;
        }
    }

    // Caffeine detection
    if (metadata.caffeine) {
        if (metadata.caffeine.isDecaf) {
            notes.push('decaf');
        } else if (metadata.caffeine.hasCaffeine) {
            notes.push('caffeine');
        }
    }

    // Sides are already in slots from extractItem
    if (slots.sides) notes.push(`sides=${slots.sides}`);

    // Add severity note if auto-detected
    if (slots.severity_note) notes.push(slots.severity_note);
    if (slots.bristol_note) notes.push(slots.bristol_note);

    // Estimate calories for Peyton only (with portion multiplier)
    let caloriesVal = null;
    if (intent === 'food' && isPeyton) {
        try {
            const baseCalories = await estimateCaloriesForItemAndSides(slots.item, slots.sides);
            if (baseCalories != null) {
                // Apply portion multiplier
                caloriesVal = Math.round(baseCalories * portionMultiplier);
                console.log(`[CAL] Base: ${baseCalories} kcal × ${portionMultiplier.toFixed(2)} = ${caloriesVal} kcal`);
            } else {
                notes.push('calories=pending');
            }
        } catch (error) {
            console.error('[CAL] Error estimating calories:', error);
            notes.push('calories=pending');
        }
    } else if (intent === 'food' && !isPeyton) {
        // Louis: explicitly no calorie tracking
        notes.push('calories=disabled');
    }

    // Build Details field with null guards
    let details = '';
    switch (intent) {
        case 'bm':
            details = slots.bristol ? `Bristol ${slots.bristol}` : 'BM';
            break;
        case 'food':
        case 'drink':
            details = (slots.item || 'entry').trim();
            break;
        case 'symptom':
            details = (slots.symptom_type || 'symptom').trim();
            break;
        case 'reflux':
            details = 'reflux';
            break;
        default:
            details = 'entry';
    }

    // Build row object using validated Notes
    const rowObj = {
        'Timestamp': new Date().toISOString(),
        'User': userTag,
        'Type': intent,
        'Details': details,
        'Severity': (intent === 'symptom' || intent === 'reflux') ? (slots.severity ? mapSeverityToLabel(slots.severity) : '') : '',
        'Notes': notesString, // Use validated/safe Notes string
        'Date': new Date().toISOString().slice(0, 10),
        'Source': 'discord-dm-nlu',
        'Calories': (caloriesVal != null && caloriesVal > 0) ? caloriesVal : ''
    };

    // Get the correct sheet for this user
    const sheetName = googleSheets.getLogSheetNameForUser(userId);

    // ========== 1. APPEND ROW (Critical - can fail) ==========
    const result = await googleSheets.appendRowToSheet(sheetName, rowObj);

    if (!result.success) {
        await message.reply(`${EMOJI.error} ${result.error.userMessage}`);
        return false; // Save failed
    }

    console.log(`[SAVE] ✅ Successfully appended to ${sheetName}`);

    // ========== 2. POST-SAVE: WRAPPED TO NEVER THROW ==========
    // Build undo reference safely
    let rowIndex = result.rowIndex || 2;
    try {
        if (!result.rowIndex) {
            const rowsResult = await googleSheets.getRows({}, sheetName);
            rowIndex = rowsResult?.rows?.length ? rowsResult.rows.length + 1 : 2;
        }
    } catch (e) {
        console.warn('[UNDO] Could not determine row index, using default:', 2);
        rowIndex = 2;
    }

    const undoId = `${sheetName}:${rowIndex}`;

    // ========== SEND SUCCESS MESSAGE (ALWAYS, even if chips fail) ==========
    let confirmText = '';
    const emoji = getTypeEmoji(intent);

    if (intent === 'food' || intent === 'drink') {
        if (isPeyton && caloriesVal != null && caloriesVal > 0) {
            confirmText = `✅ Logged **${rowObj.Details}** — ≈${caloriesVal} kcal.`;
        } else if (isPeyton && caloriesVal == null) {
            confirmText = `✅ Logged **${rowObj.Details}** (calories pending).`;
        } else {
            confirmText = `✅ Logged **${rowObj.Details}**.`;
        }
    } else {
        // BM, symptom, reflux
        confirmText = `${emoji} Logged **${rowObj.Details}**.`;
    }

    // Send success message IMMEDIATELY (before any chips/followups)
    let sentMessage = null;
    try {
        const chips = buildPostLogChips({ undoId, intent });
        sentMessage = await message.reply({
            content: confirmText,
            components: chips
        });
        console.log('[UI] ✅ Success message sent with chips');
    } catch (chipError) {
        // Chips failed, send without chips
        console.warn('[UI] Chips failed, sending plain success:', chipError.message);
        try {
            sentMessage = await message.reply({ content: confirmText });
        } catch (fallbackError) {
            console.error('[UI] Even fallback failed:', fallbackError);
            // At this point, save worked but we can't message user - log it
        }
    }

    // ========== POST-SUCCESS NON-FATAL OPERATIONS (Fire-and-forget) ==========
    // All operations use .catch() - failures logged but don't affect user experience

    // Context memory (synchronous, safe)
    try {
        contextMemory.push(userId, {
            type: intent,
            details: rowObj.Details,
            severity: rowObj.Severity,
            timestamp: Date.now()
        });
    } catch (e) {
        console.warn('[POSTSAVE][warn] context memory:', e.message);
    }

    // Trigger warnings (food/drink only) - fire and forget
    if (intent === 'food' || intent === 'drink') {
        checkTriggerWarning(message, userId, rowObj.Details)
            .catch(e => console.warn('[POSTSAVE][warn] trigger warning:', e.message));
    }

    // Contextual follow-ups - fire and forget
    (async () => {
        try {
            const userPrefs = await getUserPrefs(userId, googleSheets);
            const tz = userPrefs.TZ || TIMEZONE;
            await scheduleContextualFollowups({
                googleSheets,
                message,
                parseResult: { intent, slots },
                tz,
                userId,
                userPrefs
            });
        } catch (e) {
            console.warn('[POSTSAVE][warn] followups:', e.message);
        }
    })();

    // Trigger linking (symptom/reflux only) - fire and forget
    if (intent === 'symptom' || intent === 'reflux') {
        offerTriggerLink(message, userId)
            .catch(e => console.warn('[POSTSAVE][warn] trigger link:', e.message));

        checkRoughPatch(message, userId)
            .catch(e => console.warn('[POSTSAVE][warn] rough patch:', e.message));

        surfaceTrendChip(message, userTag, userId)
            .catch(e => console.warn('[POSTSAVE][warn] trend chip:', e.message));

        scheduleSymptomFollowup(userId)
            .catch(e => console.warn('[POSTSAVE][warn] symptom followup:', e.message));
    }

    console.log('[SAVE] ✅ Post-save operations complete');
    return true; // Save succeeded
}

/**
 * Request missing slots from user via buttons
 */
async function requestMissingSlots(message, parseResult) {
    const { intent, slots, missing } = parseResult;

    // Store pending clarification in button handler
    buttonHandlers.pendingClarifications.set(message.author.id, {
        type: 'nlu_clarification',
        parseResult: parseResult,
        originalMessage: message.content,
        timestamp: Date.now()
    });

    if (missing.includes('severity')) {
        // Show severity buttons
        await message.reply({
            content: `${EMOJI.symptom} How severe is it? (1 = mild, 10 = severe)`,
            components: buttonsSeverity()
        });
    } else if (missing.includes('symptom_type')) {
        // Show symptom type buttons
        await message.reply({
            content: `${EMOJI.symptom} What type of symptom?`,
            components: buttonsSymptomType()
        });
    } else if (missing.includes('meal_time')) {
        // Show meal time buttons
        await message.reply({
            content: `${EMOJI.food} When did you have this?`,
            components: buttonsMealTime()
        });
    } else if (missing.includes('bristol')) {
        // Show Bristol scale buttons
        await message.reply({
            content: `${EMOJI.bm} Can you provide more details?`,
            components: buttonsBristol()
        });
    } else if (missing.includes('item')) {
        // Ask for free text item
        await message.reply({
            content: `${EMOJI.food} What did you have? (Type the food/drink name)`
        });
        // Note: Next message will be treated as the item
    }
}

/**
 * Offer to link symptom to recent meal
 */
async function offerTriggerLink(message, userId) {
    const recentEntries = contextMemory.getRecent(userId, 10);

    // Find recent food/drink within 3 hours
    const now = Date.now();
    const recentMeals = recentEntries.filter(e => {
        const isFood = e.type === 'food' || e.type === 'drink';
        const isRecent = (now - e.timestamp) <= (3 * 60 * 60 * 1000); // 3 hours
        return isFood && isRecent;
    });

    if (recentMeals.length > 0) {
        const meal = recentMeals[0];
        const timeAgo = Math.round((now - meal.timestamp) / (60 * 1000)); // minutes

        const linkButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('trigger_link_yes')
                    .setLabel(`Yes, link to ${meal.details}`)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('trigger_link_no')
                    .setLabel('No')
                    .setStyle(ButtonStyle.Secondary)
            );

        await message.reply({
            content: `🔗 Link this symptom to **${meal.details}** (${timeAgo}min ago)?`,
            components: [linkButtons]
        });
    }
}

/**
 * Check if user is in a rough patch and send supportive message
 */
async function checkRoughPatch(message, userId) {
    if (contextMemory.hasRoughPatch(userId)) {
        const phrase = getRandomPhrase(PHRASES.roughPatch);
        await message.channel.send(`${EMOJI.heart} ${phrase}`);
    }
}

/**
 * Schedule a follow-up DM after a symptom is logged (90-150 min delay)
 * @param {string} userId - Discord user ID
 */
async function scheduleSymptomFollowup(userId) {
    // Cancel existing follow-up if any
    if (pendingFollowups.has(userId)) {
        clearTimeout(pendingFollowups.get(userId));
        console.log(`[FOLLOWUP] Cancelled existing follow-up for user ${userId}`);
    }

    // Random delay between 90-150 minutes
    const delayMs = 1000 * 60 * (90 + Math.floor(Math.random() * 61));
    const delayMin = Math.round(delayMs / 1000 / 60);

    console.log(`[FOLLOWUP] Scheduling follow-up for user ${userId} in ${delayMin} minutes`);

    const timeoutId = setTimeout(async () => {
        try {
            const user = await client.users.fetch(userId);
            await user.send(
                '⏳ **Symptom follow-up**\n\n' +
                'How are you feeling now?\n\n' +
                '• Log a follow-up: "feeling better"\n' +
                '• Log water intake: "had 16oz water"\n' +
                '• Type `!today` to see your day'
            );
            console.log(`[FOLLOWUP] ✅ Sent follow-up DM to user ${userId}`);
        } catch (error) {
            console.log(`[FOLLOWUP] ❌ Failed to send follow-up to user ${userId}:`, error.message);
        }

        // Remove from pending map
        pendingFollowups.delete(userId);
    }, delayMs);

    pendingFollowups.set(userId, timeoutId);
}

/**
 * Surface trend chip after symptom log
 */
async function surfaceTrendChip(message, userTag, userId) {
    try {
        const sheetName = googleSheets.getLogSheetNameForUser(userId);
        const entries = await googleSheets.getWeekEntries(userTag, sheetName);
        const trends = await PatternAnalyzer.calculateTrends(entries, userTag, 7);

        if (trends.trend !== 'no_data') {
            const chip = trendChip(trends.improvement);
            await message.channel.send(`📊 ${chip}`);
        }
    } catch (error) {
        // Silently fail - trends are optional
        console.error('Error getting trend chip:', error.message);
    }
}

/**
 * Handle correction messages for lexicon learning
 */
async function handleCorrection(message, text) {
    const userId = message.author.id;
    const userTag = message.author.tag;

    // Extract corrected text
    const correctedText = text.replace(/^correction:\s*/i, '').replace(/^\*+/, '').trim();

    // Undo last entry
    const undoResult = await googleSheets.undoLastEntry(userTag);

    if (!undoResult.success) {
        await message.reply(`${EMOJI.error} ${undoResult.message}`);
        return;
    }

    // Re-parse and log
    const result = await understand(correctedText, { userId }, contextMemory);

    if (result.missing.length === 0) {
        await logFromNLU(message, result);

        // Learn the phrase
        contextMemory.learnPhrase(userId, correctedText, result.intent, result.slots);

        await message.reply(`✅ Corrected and learned! I'll remember "${correctedText}" next time.`);
    } else {
        await requestMissingSlots(message, result);
    }
}

/**
 * Check for trigger warnings
 */
async function checkTriggerWarning(message, userId, itemName) {
    // Check if this item has caused symptoms before (simplified for now)
    // This could be enhanced with actual pattern analysis
}

/**
 * Map severity number to label
 */
function mapSeverityToLabel(severityNum) {
    if (severityNum <= 3) return 'mild';
    if (severityNum <= 6) return 'moderate';
    return 'severe';
}

/**
 * Get emoji for type
 */
function getTypeEmoji(type) {
    const emojiMap = {
        food: EMOJI.food,
        drink: EMOJI.drink,
        symptom: EMOJI.symptom,
        reflux: EMOJI.reflux,
        bm: EMOJI.bm
    };
    return emojiMap[type] || EMOJI.success;
}

// ========== END NLU SYSTEM HELPER FUNCTIONS ==========

// Message handler (supports both DMs and channel messages)
client.on('messageCreate', async (message) => {
    try {
        // Ignore bot messages
        if (message.author.bot) {
            return;
        }

        // ========== PHASE 4.1: RESPONSE WATCHER ==========
        // Check if user is under watch (within 20 min of reminder)
        const userId = message.author.id;
        if (isUnderWatch(userId)) {
            const prefs = await getUserPrefs(userId, googleSheets);
            await markInteracted(userId, prefs, googleSheets);
        }

        // Extract message info
        const isDM = !message.guild;
        const isAllowedChannel = CHANNEL_ID && message.channel.id === CHANNEL_ID;
        const content = (message.content || '').trim();
        const hasPrefix = content.startsWith('!');
        const isSlash = !!message.interaction;
        const isCommand = hasPrefix || isSlash;

        // Permission check: Only process DMs or allowed channel messages
        if (!isDM && !isAllowedChannel) {
            return; // Silently ignore messages from other channels
        }

        // Log routing decision
        const route = isDM && !isCommand ? 'NLU' : (isCommand ? 'COMMAND' : 'IGNORE');
        console.log(`\n[ROUTER] 📨 From: ${message.author.username} | isDM=${isDM} | hasPrefix=${hasPrefix} | Route: ${route}`);
        console.log(`[ROUTER] 📝 Content: "${content}"`);

        // ========== ROUTE 1: DM + No Prefix = NLU ==========
        if (isDM && !isCommand) {
            console.log('[ROUTER] ✅ Routing to NLU handler');
            await handleNaturalLanguage(message);
            return;
        }

        // ========== ROUTE 2: Prefixed = Command ==========
        if (isCommand && hasPrefix) {
            console.log('[ROUTER] ✅ Routing to command handler');

            // Parse command and args
            const args = content.slice(1).split(/\s+/);
            const command = args[0].toLowerCase();
            const commandArgs = args.slice(1).join(' ');

            console.log(`[ROUTER] 🔍 Command: "${command}" | Args: "${commandArgs}"`);

            // Route to command handler
            if (commands[`!${command}`]) {
                await commands[`!${command}`](message, commandArgs);
                console.log(`[ROUTER] ✅ Command !${command} completed`);
            } else {
                console.log(`[ROUTER] ❌ Unknown command: !${command}`);
                await message.reply({
                    content: `❌ Unknown command \`!${command}\`.\n\n💡 **Try:**\n` +
                            `• \`!help\` - Open the interactive Command Palette\n` +
                            `• \`!howto\` - Beginner walkthrough\n` +
                            `• Or just talk naturally: "had pizza for lunch"`
                });
            }
            return;
        }

        // ========== ROUTE 3: Channel + No Prefix = Try NLU if allowed ==========
        if (isAllowedChannel && !isCommand) {
            console.log('[ROUTER] ✅ Routing channel message to NLU handler');
            await handleNaturalLanguage(message);
            return;
        }

        // ========== ROUTE 4: Everything else = Ignore ==========
        console.log('[ROUTER] ⚠️ Message ignored (no matching route)');

    } catch (err) {
        console.error('[ROUTER] ❌ Error in messageCreate handler:', err);
        try {
            if (!message.author.bot) {
                await message.reply('😅 Oops — something went wrong handling that message. Please try again or use a command like `!help`.');
            }
        } catch (replyErr) {
            console.error('[ROUTER] ❌ Failed to send error message:', replyErr);
        }
    }
});

// Command handler functions
async function handleFood(message, args) {
    // Legacy command - redirect to NLU for modern handling
    if (!args) {
        return message.reply('Please tell me what you ate. Example: "had chicken salad for lunch"');
    }

    // Create a synthetic message object for NLU
    const syntheticMessage = {
        ...message,
        content: args // Use the args as the content
    };

    await handleNaturalLanguage(syntheticMessage);
}

async function handleFood_LEGACY_DISABLED(message, args) {
    // LEGACY CODE - Disabled in favor of NLU system
    if (!args) {
        return message.reply('Please specify what you ate. Example: `!food chicken salad`');
    }

    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    // Categorize the food
    const category = NLPHandler.categorizeItem('food', args);

    // Check for trigger foods
    const foodLower = args.toLowerCase();
    let reaction = '✅';
    let response = RESPONSES.general[Math.floor(Math.random() * RESPONSES.general.length)];

    if (category === 'Safe Food' || TRIGGER_ITEMS.positive.some(item => foodLower.includes(item))) {
        reaction = '💪';
        response = RESPONSES.positive[Math.floor(Math.random() * RESPONSES.positive.length)];
    } else if (category === 'Trigger Food' || TRIGGER_ITEMS.warning.some(item => foodLower.includes(item)) || TRIGGER_ITEMS.problematic.some(item => foodLower.includes(item))) {
        reaction = '⚠️';
        response = RESPONSES.warning[Math.floor(Math.random() * RESPONSES.warning.length)];
    }

    // Log to Google Sheets
    await googleSheets.appendRow({
        timestamp,
        user: userName,
        type: 'food',
        value: args,
        severity: null,
        category: category,
        notes: null,
        source: source
    });

    // React and respond
    await message.react(reaction);
    await message.reply(`${response}\n📝 Logged: **${args}** (${category})`);
}

async function handleDrink(message, args) {
    // Legacy command - redirect to NLU
    if (!args) {
        return message.reply('Please tell me what you drank. Example: "had chai with oat milk"');
    }
    await handleNaturalLanguage({ ...message, content: args });
}

async function handleDrink_LEGACY_DISABLED(message, args) {
    if (!args) {
        return message.reply('Please specify what you drank. Example: `!drink chai with oat milk`');
    }

    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    // Categorize the drink
    const category = NLPHandler.categorizeItem('drink', args);

    // Check for trigger drinks
    const drinkLower = args.toLowerCase();
    let reaction = '✅';
    let response = RESPONSES.general[Math.floor(Math.random() * RESPONSES.general.length)];

    if (category === 'Safe Drink' || drinkLower.includes('chai') || drinkLower.includes('water') || drinkLower.includes('tea')) {
        reaction = '💪';
        response = RESPONSES.positive[Math.floor(Math.random() * RESPONSES.positive.length)];
    } else if (category === 'Trigger Drink' || drinkLower.includes('refresher') || drinkLower.includes('coffee') || drinkLower.includes('alcohol')) {
        reaction = '⚠️';
        response = RESPONSES.warning[Math.floor(Math.random() * RESPONSES.warning.length)];
    }

    // Log to Google Sheets
    await googleSheets.appendRow({
        timestamp,
        user: userName,
        type: 'drink',
        value: args,
        severity: null,
        category: category,
        notes: null,
        source: source
    });

    // React and respond
    await message.react(reaction);
    await message.reply(`${response}\n🥤 Logged: **${args}** (${category})`);
}

async function handleSymptom(message, args) {
    // Legacy command - redirect to NLU
    if (!args) {
        return message.reply('Please tell me how you\'re feeling. Example: "stomach pain" or "mild heartburn"');
    }
    await handleNaturalLanguage({ ...message, content: args });
}

async function handleSymptom_LEGACY_DISABLED(message, args) {
    if (!args) {
        return message.reply('Please describe your symptom. Example: `!symptom stomach pain mild`');
    }

    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    // Parse severity from the message
    const severityMatch = args.match(/\b(mild|moderate|severe|1-10|\d+)\b/i);
    let severity = severityMatch ? severityMatch[0] : 'moderate';

    // Remove severity from the symptom description
    const symptomDescription = args.replace(/\b(mild|moderate|severe|1-10|\d+)\b/i, '').trim();

    // Log to Google Sheets
    await googleSheets.appendRow({
        timestamp,
        user: userName,
        type: 'symptom',
        value: symptomDescription,
        severity: severity,
        category: 'Symptom',
        notes: null,
        source: source
    });

    const response = RESPONSES.symptom[Math.floor(Math.random() * RESPONSES.symptom.length)];

    // React and respond
    await message.react('💙');
    await message.reply(`${response}\n🩺 Logged: **${symptomDescription}** (Severity: ${severity})`);
}

async function handleBM(message, args) {
    // Legacy command - redirect to NLU
    const text = args || 'had a bowel movement';
    await handleNaturalLanguage({ ...message, content: text });
}

async function handleBM_LEGACY_DISABLED(message, args) {
    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    // Bristol scale or description
    const description = args || 'normal';

    // Log to Google Sheets
    await googleSheets.appendRow({
        timestamp,
        user: userName,
        type: 'bm',
        value: description,
        severity: null,
        category: 'Bowel Movement',
        notes: null,
        source: source
    });

    // React and respond
    await message.react('📝');
    await message.reply(`Logged BM: **${description}**\n💡 Remember: Consistency in tracking helps identify patterns!`);
}

async function handleReflux(message, args) {
    // Legacy command - redirect to NLU
    const text = args ? `reflux ${args}` : 'reflux';
    await handleNaturalLanguage({ ...message, content: text });
}

async function handleReflux_LEGACY_DISABLED(message, args) {
    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    // Parse severity
    const severityMatch = args.match(/\b(mild|moderate|severe|1-10|\d+)\b/i);
    let severity = severityMatch ? severityMatch[0] : 'moderate';

    // Log to Google Sheets
    await googleSheets.appendRow({
        timestamp,
        user: userName,
        type: 'reflux',
        value: 'reflux episode',
        severity: severity,
        category: 'Symptom',
        notes: args,
        source: source
    });

    // React and respond
    await message.react('🔥');
    await message.reply(`Logged reflux episode (Severity: ${severity})\n💊 Remember to take any prescribed medications and avoid trigger foods.`);
}

async function handleHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📋 Louton GI Bot - All Commands')
        .setDescription('**Preferred:** Just talk naturally! Or use commands below.')
        .addFields(
            {
                name: '✨ Natural Language (Recommended)',
                value: 'Just tell me what you ate or how you feel:\n' +
                       '• "had pizza for lunch"\n' +
                       '• "drinking oat milk latte"\n' +
                       '• "mild heartburn"\n' +
                       '• "bad poop this morning"',
                inline: false
            },
            {
                name: '📊 Daily Summaries',
                value: '`!today` - Compact daily overview\n' +
                       '`!week` - Weekly summary\n' +
                       '`!insights` - Deep analytics (budget, trends, combos, streaks)\n' +
                       '`!patterns` - Pattern analysis\n' +
                       '`!triggers` - Trigger correlations\n' +
                       '`!trends` - Trend analysis\n' +
                       '`!streak` - Symptom-free streak\n' +
                       '`!weekly` - Weekly digest',
                inline: false
            },
            {
                name: '⚙️ Settings & Control',
                value: '`!reminders` - Manage reminder settings\n' +
                       '`!dnd 22:00-07:00` - Set quiet hours\n' +
                       '`!dnd off` - Disable quiet hours\n' +
                       '`!timezone America/New_York` - Set timezone\n' +
                       '`!snooze 3h` - Temporarily pause reminders\n' +
                       '`!goal [number]` - Set daily calorie goal',
                inline: false
            },
            {
                name: '🔧 Utilities',
                value: '`!undo` - Remove last entry\n' +
                       '`!howto` - Interactive walkthrough\n' +
                       '`!help` - This help menu\n' +
                       '`!nlu-stats` - NLU performance metrics\n' +
                       '`!test` - Test bot connection',
                inline: false
            },
            {
                name: '💡 Pro Tips',
                value: '• The bot understands natural language - no need for commands!\n' +
                       '• After logging, use quick buttons: Add portion, Add brand, Add photo, Undo\n' +
                       '• I ignore greetings like "thanks", "lol", "good morning"\n' +
                       '• Your data is private in your own tab',
                inline: false
            }
        )
        .setFooter({ text: 'Type !howto for a beginner-friendly walkthrough' });

    await message.reply({ embeds: [embed] });
}

async function handleHowto(message) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🎯 How to Use Louton GI Bot')
        .setDescription('A beginner-friendly walkthrough!')
        .addFields(
            {
                name: '1️⃣ Just Talk to Me (Natural Language)',
                value:
                    '**No commands needed!** Just say:\n' +
                    '• "had egg bite and jasmine tea for breakfast"\n' +
                    '• "2 slices pizza with pepperoni"\n' +
                    '• "mild heartburn"\n' +
                    '• "hard poop this morning"\n\n' +
                    'I understand natural language and log automatically!',
                inline: false
            },
            {
                name: '2️⃣ Quick Actions (Buttons)',
                value:
                    'After logging, tap buttons to add details:\n' +
                    '📏 **Add portion** - "1 cup", "2 slices", "grande"\n' +
                    '🏷️ **Add brand** - "Oatly Barista", "Cheerios"\n' +
                    '📸 **Add photo** - Upload meal pictures\n' +
                    '↩️ **Undo** - Remove entry (60-sec window)',
                inline: false
            },
            {
                name: '3️⃣ View Your Data',
                value:
                    '`!today` - Today\'s summary (reflux, trends)\n' +
                    '`!insights` - Analytics (latency, patterns, streaks)\n' +
                    '`!week` - Weekly overview\n' +
                    '`!streak` - Symptom-free days',
                inline: false
            },
            {
                name: '4️⃣ Manage Reminders',
                value:
                    '`!reminders` - Turn reminders on/off\n' +
                    '`!dnd 22:00-07:00` - Set quiet hours\n' +
                    '`!snooze 3h` - Pause reminders temporarily\n' +
                    '`!timezone America/New_York` - Set your timezone',
                inline: false
            },
            {
                name: '5️⃣ Fix Mistakes',
                value:
                    '• Click **Undo** button (within 60 seconds)\n' +
                    '• Type `!undo` to remove last entry\n' +
                    '• Type `correction: [new text]` to fix details',
                inline: false
            },
            {
                name: '💡 Good to Know',
                value:
                    '• Greetings ("thanks", "lol") won\'t create logs\n' +
                    '• Be specific: "2 slices" or "grande" helps tracking\n' +
                    '• I learn patterns to identify triggers\n' +
                    '• All your data is private in your tab\n' +
                    '• Type `!help` for complete command list',
                inline: false
            }
        )
        .setFooter({ text: 'Tip: Natural language works best! Just tell me what happened.' });

    await message.reply({ embeds: [embed] });
}

async function handleToday(message) {
    const userId = message.author.id;
    const userName = getUserName(message.author.username);
    const sheetName = googleSheets.getLogSheetNameForUser(userId);
    const isPeyton = (userId === PEYTON_ID);

    try {
        // Fetch today's entries
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success) {
            return message.reply('❌ Failed to fetch today\'s data.');
        }

        const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
        const todayEntries = result.rows.filter(row => {
            return row.Date === today && !row.Notes?.includes('deleted=true');
        });

        if (todayEntries.length === 0) {
            return message.reply('No entries found for today. Start tracking with `!food`, `!symptom`, or other commands!');
        }

        // Calculate intake (food + drink calories)
        let totalIntake = 0;
        todayEntries.forEach(row => {
            if ((row.Type === 'food' || row.Type === 'drink') && row.Calories) {
                const cal = parseInt(row.Calories, 10);
                if (!isNaN(cal)) totalIntake += cal;
            }
        });

        // Calculate reflux stats
        const refluxEntries = todayEntries.filter(row => row.Type === 'reflux');
        const refluxCount = refluxEntries.length;
        let avgRefluxSeverity = 0;
        if (refluxCount > 0) {
            const severities = refluxEntries.map(row => {
                const sev = row.Severity || row.Notes?.match(/severity=(\d+)/)?.[1];
                return sev ? parseInt(sev, 10) : 5;
            }).filter(s => !isNaN(s));
            avgRefluxSeverity = severities.length > 0
                ? (severities.reduce((a, b) => a + b, 0) / severities.length).toFixed(1)
                : 0;
        }

        // Fetch Health_Peyton data for net calories (Peyton only)
        let netCalories = null;
        let burnCalories = null;
        if (isPeyton) {
            try {
                const healthResult = await googleSheets.getRows({}, 'Health_Peyton');
                if (healthResult.success) {
                    const todayHealth = healthResult.rows.find(row => row.Date === today);
                    if (todayHealth && todayHealth.Total_kcal) {
                        burnCalories = parseInt(todayHealth.Total_kcal, 10);
                        if (!isNaN(burnCalories)) {
                            netCalories = totalIntake - burnCalories;
                        }
                    }
                }
            } catch (err) {
                console.log('[TODAY] Health_Peyton not available:', err.message);
            }
        }

        // Calculate 7-day reflux trend
        const sevenDaysAgo = moment().tz(TIMEZONE).subtract(7, 'days').format('YYYY-MM-DD');
        const last7Days = result.rows.filter(row => {
            return row.Date >= sevenDaysAgo && row.Date < today && !row.Notes?.includes('deleted=true');
        });

        const refluxLast7 = last7Days.filter(row => row.Type === 'reflux').length;
        const avgLast7 = refluxLast7 / 7;
        const avgToday = refluxCount; // Today's count

        let trendText = '—';
        let trendColor = 0x808080; // Gray
        if (avgLast7 > 0) {
            const change = ((avgToday - avgLast7) / avgLast7) * 100;
            if (change <= -15) {
                trendText = '📉 Improving';
                trendColor = 0x00FF00; // Green
            } else if (change >= 15) {
                trendText = '📈 Worsening';
                trendColor = 0xFF0000; // Red
            } else {
                trendText = '➡️ Stable';
                trendColor = 0xFFA500; // Orange
            }
        }

        // Build compact embed
        const embed = new EmbedBuilder()
            .setColor(trendColor)
            .setTitle(`📊 Today's Summary`)
            .setDescription(`${moment().tz(TIMEZONE).format('dddd, MMM DD')}`)
            .setTimestamp();

        // Line 1: Intake
        let fields = [];
        if (isPeyton && totalIntake > 0) {
            fields.push({
                name: '🍽 Intake',
                value: `${totalIntake} kcal`,
                inline: true
            });
        }

        // Line 2: Reflux
        if (refluxCount > 0) {
            fields.push({
                name: '🔥 Reflux',
                value: `${refluxCount} event${refluxCount > 1 ? 's' : ''} • avg ${avgRefluxSeverity}`,
                inline: true
            });
        } else {
            fields.push({
                name: '🔥 Reflux',
                value: 'None today',
                inline: true
            });
        }

        // Line 3: Net (if available)
        if (netCalories !== null) {
            const sign = netCalories >= 0 ? '+' : '';
            fields.push({
                name: '⚖️ Net',
                value: `${totalIntake} - ${burnCalories} = ${sign}${netCalories}`,
                inline: false
            });
        }

        // Line 4: Trend
        fields.push({
            name: '📈 7-Day Trend',
            value: trendText,
            inline: true
        });

        embed.addFields(...fields);

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[TODAY] Error:', error);
        await message.reply('❌ Failed to generate today\'s summary.');
    }
}

async function handleWeek(message) {
    const userId = message.author.id;
    const userName = getUserName(message.author.username);
    const sheetName = googleSheets.getLogSheetNameForUser(userId);

    const weekData = await googleSheets.getWeekEntries(userName, sheetName);

    if (!weekData || weekData.length === 0) {
        return message.reply('No entries found for this week. Start tracking to see your patterns!');
    }

    // Calculate summary stats
    const totalEntries = weekData.length;
    const symptomDays = new Set(weekData.filter(e => e.type === 'symptom' || e.type === 'reflux').map(e => e.date)).size;
    const avgDailyEntries = (totalEntries / 7).toFixed(1);

    // Top foods
    const foods = weekData.filter(e => e.type === 'food').map(e => e.details || e.value);
    const foodCounts = {};
    foods.forEach(f => foodCounts[f] = (foodCounts[f] || 0) + 1);
    const topFoods = Object.entries(foodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([food]) => food);

    // Common symptoms
    const symptoms = weekData.filter(e => e.type === 'symptom' || e.type === 'reflux').map(e => e.details || e.value);
    const symptomCounts = {};
    symptoms.forEach(s => symptomCounts[s] = (symptomCounts[s] || 0) + 1);
    const commonSymptoms = Object.entries(symptomCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([symptom]) => symptom);

    const embed = new EmbedBuilder()
        .setColor(0x9932CC)
        .setTitle(`📈 Weekly Summary for ${userName}`)
        .setDescription(`Week of ${moment().tz(TIMEZONE).startOf('week').format('MMM DD')} - ${moment().tz(TIMEZONE).endOf('week').format('MMM DD, YYYY')}`)
        .addFields(
            { name: 'Total Entries', value: `${totalEntries}`, inline: true },
            { name: 'Symptom Days', value: `${symptomDays}/7`, inline: true },
            { name: 'Average Daily Entries', value: `${avgDailyEntries}`, inline: true },
            { name: 'Top Foods', value: topFoods.join(', ') || 'None tracked', inline: false },
            { name: 'Common Symptoms', value: commonSymptoms.join(', ') || 'None tracked', inline: false }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

async function handleStreak(message) {
    const userName = getUserName(message.author.username);
    const streakData = await analyzer.getStreakData(userName);

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`🔥 Streak Data for ${userName}`)
        .addFields(
            { name: 'Current Tracking Streak', value: `${streakData.trackingStreak} days`, inline: true },
            { name: 'Days Without Trigger Foods', value: `${streakData.triggerFreeStreak} days`, inline: true },
            { name: 'Best Streak', value: `${streakData.bestStreak} days`, inline: true }
        )
        .setTimestamp();

    if (streakData.trackingStreak >= 7) {
        embed.setDescription('🌟 Amazing! You\'ve been tracking for a week or more!');
    } else if (streakData.trackingStreak >= 3) {
        embed.setDescription('💪 Great job! Keep the streak going!');
    } else {
        embed.setDescription('📝 Keep tracking daily to build your streak!');
    }

    await message.reply({ embeds: [embed] });
}

async function handlePatterns(message) {
    const userId = message.author.id;
    const userName = getUserName(message.author.username);
    const sheetName = googleSheets.getLogSheetNameForUser(userId);

    const entries = await googleSheets.getAllEntries(userName, sheetName);

    if (!entries || entries.length < 7) {
        return message.reply('Need more data to analyze patterns. Keep tracking for at least a week!');
    }

    const patterns = await analyzer.analyzePatterns(userName);

    const embed = new EmbedBuilder()
        .setColor(0x4169E1)
        .setTitle(`🔍 Pattern Analysis for ${userName}`)
        .setDescription('Based on your recent tracking data:')
        .addFields(
            { name: '🍔 Most Common Foods', value: patterns.topFoods.map(f => `• ${f.food} (${f.count}x)`).join('\n') || 'None', inline: false },
            { name: '🩺 Symptom Correlations', value: patterns.correlations.join('\n') || 'No clear patterns yet', inline: false },
            { name: '⏰ Peak Symptom Times', value: patterns.peakTimes.join(', ') || 'No pattern detected', inline: false },
            { name: '💡 Recommendations', value: patterns.recommendations.join('\n') || 'Keep tracking for personalized insights', inline: false }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Helper functions
function getUserName(discordUsername) {
    // Simply return the actual Discord username for proper tracking
    // This ensures each user's entries are tracked separately
    return discordUsername;
}

// Handle NLP results
async function handleNLPResult(message, nlpResult) {
    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    // Handle severity prompts
    if (nlpResult.needsSeverity) {
        await message.reply(nlpResult.response);
        return;
    }

    // Log to Google Sheets based on type
    try {
        const entry = {
            timestamp,
            user: userName,
            type: nlpResult.type,
            value: nlpResult.value,
            severity: nlpResult.severity || '',
            category: nlpResult.category,
            notes: '',
            source: source
        };

        await googleSheets.appendRow(entry);

        // Add appropriate reaction
        if (nlpResult.isTrigger) {
            await message.react('⚠️');
        } else if (nlpResult.type === 'positive') {
            await message.react('🌟');
        } else if (nlpResult.type === 'symptom') {
            await message.react('💙');
        } else {
            await message.react('✅');
        }

        // Send response
        await message.reply(nlpResult.response);

        // Additional smart responses based on patterns
        if (nlpResult.isTrigger) {
            // Check recent symptoms for this user
            const recentEntries = await googleSheets.getTodayEntries(userName);
            const hasSymptoms = recentEntries.some(e => e.type === 'symptom' || e.type === 'reflux');

            if (hasSymptoms) {
                await message.reply('⚠️ I notice you\'ve had symptoms today. This trigger might be related - consider avoiding it for a few days.');
            }
        }

        // Check for positive streaks
        if (nlpResult.type === 'positive') {
            const todayEntries = await googleSheets.getTodayEntries(userName);
            const positiveCount = todayEntries.filter(e => e.category === 'Improvement').length;

            if (positiveCount >= 3) {
                await message.reply('🎉 You\'re having a great day! Keep doing what you\'re doing!');
            }
        }

    } catch (error) {
        console.error('Error processing NLP result:', error);
        await message.reply('❌ Failed to log your entry. Please try using a command instead.');
    }
}

// Handle undo command
async function handleUndo(message) {
    const userId = message.author.id;
    const userName = getUserName(message.author.username);
    const sheetName = googleSheets.getLogSheetNameForUser(userId);

    try {
        const result = await googleSheets.undoLastEntry(userName, sheetName);

        if (result.success) {
            await message.react('↩️');
            await message.reply(`✅ ${result.message}`);
        } else {
            await message.reply(`❌ ${result.message}`);
        }
    } catch (error) {
        console.error('Error undoing entry:', error);
        await message.reply('❌ Failed to undo last entry. Please try again.');
    }
}

// Handle clarified messages
async function handleClarifiedMessage(message, clarificationResult) {
    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    try {
        let entry = {};

        switch (clarificationResult.type) {
            case 'symptom_type':
                const parsed = clarificationResult.parsedType;
                entry = {
                    timestamp,
                    user: userName,
                    type: parsed.type,
                    value: parsed.value,
                    severity: 'moderate',
                    category: parsed.category,
                    notes: clarificationResult.originalMessage,
                    source
                };
                await googleSheets.appendRow(entry);
                await message.reply(`✅ Logged ${parsed.value} symptom. Take care! 💙`);
                break;

            case 'meal_context':
                const mealContext = clarificationResult.parsedContext;
                entry = {
                    timestamp,
                    user: userName,
                    type: 'food',
                    value: `${clarificationResult.originalMessage} (${mealContext.context})`,
                    severity: null,
                    category: 'Neutral',
                    notes: `${mealContext.time} meal`,
                    source
                };
                await googleSheets.appendRow(entry);
                await message.reply(`✅ Logged for ${mealContext.context}! 📝`);
                break;

            case 'bm_detail':
                const bmDetail = clarificationResult.parsedDetail;
                entry = {
                    timestamp,
                    user: userName,
                    type: 'bm',
                    value: bmDetail.description,
                    severity: null,
                    category: 'Bowel Movement',
                    notes: `Bristol scale: ${bmDetail.bristol}`,
                    source
                };
                await googleSheets.appendRow(entry);
                await message.reply(`✅ Logged bowel movement: ${bmDetail.description} 📝`);
                break;

            case 'improvement_type':
                const improvement = clarificationResult.parsedImprovement;
                entry = {
                    timestamp,
                    user: userName,
                    type: improvement.type,
                    value: improvement.symptom || improvement.description,
                    severity: null,
                    category: 'Improvement',
                    notes: clarificationResult.originalMessage,
                    source
                };
                await googleSheets.appendRow(entry);
                await message.reply(`✅ Great to hear you're feeling better! 🌟`);
                break;
        }

        await message.react('✅');
    } catch (error) {
        console.error('Error processing clarified message:', error);
        await message.reply('❌ Failed to log entry. Please try again.');
    }
}

// Handle insights command - show pattern insights
async function handleInsights(message) {
    // Phase 3: Use new insights module
    const { handleInsights: insightsCommand } = require('./src/commands/insights');

    await insightsCommand(message, {
        googleSheets,
        getUserName,
        getLogSheetNameForUser: googleSheets.getLogSheetNameForUser,
        PEYTON_ID
    });
}

// Handle triggers command - show trigger correlations
async function handleTriggers(message) {
    const userId = message.author.id;
    const userName = getUserName(message.author.username);
    const sheetName = googleSheets.getLogSheetNameForUser(userId);

    try {
        const entries = await googleSheets.getAllEntries(userName, sheetName);

        if (entries.length < 5) {
            return message.reply('📊 You need more entries to detect trigger patterns. Keep tracking!');
        }

        const patterns = await PatternAnalyzer.findRepeatedPatterns(entries, userName);
        const combinations = await PatternAnalyzer.findCombinationTriggers(entries, userName);

        const embed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('⚠️ Trigger Analysis')
            .setTimestamp();

        if (patterns.length > 0) {
            const triggerList = patterns.slice(0, 5).map((p, i) =>
                `${i + 1}. **${p.trigger}** - Linked to symptoms ${p.count} times`
            ).join('\n');

            embed.addFields({
                name: '🔍 Top Triggers',
                value: triggerList || 'No clear triggers detected yet',
                inline: false
            });
        }

        if (combinations.length > 0) {
            const comboList = combinations.slice(0, 3).map((c, i) =>
                `${i + 1}. ${c.combination} (${c.count}x)`
            ).join('\n');

            embed.addFields({
                name: '🔗 Combination Triggers',
                value: comboList,
                inline: false
            });
        }

        if (patterns.length === 0 && combinations.length === 0) {
            embed.setDescription('No strong trigger patterns detected yet. Keep tracking to identify patterns!');
        }

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error analyzing triggers:', error);
        await message.reply('❌ Failed to analyze triggers. Please try again.');
    }
}

// Handle trends command - show symptom trends
async function handleTrends(message) {
    const userId = message.author.id;
    const userName = getUserName(message.author.username);
    const sheetName = googleSheets.getLogSheetNameForUser(userId);

    try {
        const entries = await googleSheets.getAllEntries(userName, sheetName);

        if (entries.length < 5) {
            return message.reply('📊 You need more entries to calculate trends. Keep tracking!');
        }

        const trends = await PatternAnalyzer.calculateTrends(entries, userName, 7);
        const timePattern = await PatternAnalyzer.findTimePatterns(entries, userName);

        const embed = new EmbedBuilder()
            .setColor(trends.trend === 'improving' ? 0x2ECC71 :
                     trends.trend === 'worsening' ? 0xE74C3C : 0x95A5A6)
            .setTitle('📈 Your Health Trends')
            .setDescription(trends.message)
            .addFields(
                { name: 'Average Symptoms/Day', value: trends.avgPerDay, inline: true },
                { name: 'Total This Week', value: trends.totalSymptoms.toString(), inline: true }
            )
            .setTimestamp();

        if (timePattern.hasPattern) {
            embed.addFields({
                name: '⏰ Time Pattern',
                value: timePattern.message,
                inline: false
            });
        }

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error calculating trends:', error);
        await message.reply('❌ Failed to calculate trends. Please try again.');
    }
}

// Handle weekly summary command
async function handleWeeklySummary(message) {
    const userId = message.author.id;
    const userName = getUserName(message.author.username);
    const sheetName = googleSheets.getLogSheetNameForUser(userId);

    try {
        const entries = await googleSheets.getAllEntries(userName, sheetName);

        if (entries.length < 3) {
            return message.reply('📊 You need more entries for a weekly summary. Keep tracking!');
        }

        const summary = await PatternAnalyzer.getWeeklySummary(entries, userName);

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`📅 Weekly Summary (Week of ${summary.weekStart})`)
            .addFields(
                { name: '📊 Days Tracked', value: summary.daysTracked.toString(), inline: true },
                { name: '✅ Symptom-Free Days', value: summary.symptomFreeDays.toString(), inline: true },
                { name: '⚠️ Total Symptoms', value: summary.totalSymptoms.toString(), inline: true }
            )
            .setTimestamp();

        if (summary.worstTriggers.length > 0) {
            const triggerList = summary.worstTriggers
                .map((t, i) => `${i + 1}. ${t.name} (${t.count}x)`)
                .join('\n');

            embed.addFields({
                name: '🚫 Worst Triggers This Week',
                value: triggerList,
                inline: false
            });
        }

        if (summary.topSafeFoods.length > 0) {
            const safeList = summary.topSafeFoods
                .map((f, i) => `${i + 1}. ${f.name} (${f.count}x)`)
                .join('\n');

            embed.addFields({
                name: '✅ Top Safe Foods',
                value: safeList,
                inline: false
            });
        }

        embed.addFields({
            name: '📈 Trend',
            value: summary.trends.message,
            inline: false
        });

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error generating weekly summary:', error);
        await message.reply('❌ Failed to generate weekly summary. Please try again.');
    }
}

// Handle goal command - set daily calorie goal (Peyton only)
async function handleGoal(message, args) {
    const userId = message.author.id;

    // Only Peyton can set goals
    if (userId !== PEYTON_ID) {
        return message.reply('Goal tracking is only enabled for Peyton.');
    }

    // If no args, show current goal
    if (!args || args.trim() === '') {
        const currentGoal = userGoals.get(userId);
        if (currentGoal) {
            return message.reply(`📊 Your current daily goal is **${currentGoal} kcal**.\n\nUse \`!goal <number>\` to change it.`);
        } else {
            return message.reply(`📊 No daily goal set yet.\n\nUse \`!goal <number>\` to set one (e.g., \`!goal 2200\`).`);
        }
    }

    // Parse the goal value
    const val = parseInt(args.trim(), 10);

    if (!Number.isFinite(val) || val < 1000 || val > 5000) {
        return message.reply('Please provide a daily kcal goal between 1000 and 5000.');
    }

    // Set the goal
    userGoals.set(userId, val);

    return message.reply(`✅ Set your daily goal to **${val} kcal**.`);
}

// Handle reminders command - configure proactive reminders
async function handleReminders(message, args) {
    const userId = message.author.id;

    if (!args || args.trim() === '') {
        return message.reply(
            '🔔 **Reminder Settings**\n\n' +
            '**Usage:**\n' +
            '• `!reminders on` - Enable reminders\n' +
            '• `!reminders off` - Disable reminders\n' +
            '• `!reminders time 08:00` - Set morning check-in\n' +
            '• `!reminders evening 20:30` - Set evening recap\n' +
            '• `!reminders inactivity 14:00` - Set inactivity nudge\n\n' +
            '_Blank time to disable: `!reminders evening`_'
        );
    }

    const [sub, val] = args.trim().split(/\s+/);

    // Handle on/off
    if (sub === 'on' || sub === 'off') {
        await setUserPrefs(userId, { DM: sub }, googleSheets);
        await updateUserSchedule(client, googleSheets, userId, {
            getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),
            getTodayEntries: googleSheets.getTodayEntries.bind(googleSheets),
            setUserPrefs: (id, partial) => setUserPrefs(id, partial, googleSheets)
        });
        return message.reply(`🔔 Reminders ${sub === 'on' ? '**enabled**' : '**disabled**'}.`);
    }

    // Handle time settings
    const keyMap = {
        time: 'MorningHHMM',
        morning: 'MorningHHMM',
        evening: 'EveningHHMM',
        inactivity: 'InactivityHHMM'
    };

    const key = keyMap[sub];
    if (key) {
        const timeValue = (val || '').trim();

        // Validate time format if provided
        if (timeValue && !/^\d{1,2}:\d{2}$/.test(timeValue)) {
            return message.reply('⚠️ Invalid time format. Use HH:MM (e.g., `08:00` or `20:30`)');
        }

        await setUserPrefs(userId, { [key]: timeValue }, googleSheets);
        await updateUserSchedule(client, googleSheets, userId, {
            getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),
            getTodayEntries: googleSheets.getTodayEntries.bind(googleSheets),
            setUserPrefs: (id, partial) => setUserPrefs(id, partial, googleSheets)
        });

        const labelMap = {
            time: '⏰ Morning check-in',
            morning: '⏰ Morning check-in',
            evening: '🌙 Evening recap',
            inactivity: '📭 Inactivity nudge'
        };

        const label = labelMap[sub];
        return message.reply(`${label} ${timeValue ? `set to **${timeValue}**` : '**disabled**'}.`);
    }

    return message.reply('⚠️ Unknown subcommand. Use `!reminders` for help.');
}

// Handle DND, Timezone, Snooze commands (Phase 4)
async function handleDND(message, args) {
    await dndCommands.handleDND(message, args, { getUserPrefs, setUserPrefs, googleSheets });
}

async function handleTimezone(message, args) {
    await dndCommands.handleTimezone(message, args, { getUserPrefs, setUserPrefs, googleSheets });
}

async function handleSnooze(message, args) {
    await dndCommands.handleSnooze(message, args, { getUserPrefs, setUserPrefs, googleSheets });
}

async function handleSnooze_OLD_LEGACY(message, args) {
    const userId = message.author.id;
    const tz = (args || '').trim();

    if (!tz) {
        const prefs = await getUserPrefs(userId, googleSheets);
        const currentTz = prefs?.TZ || 'America/Los_Angeles';
        return message.reply(
            `🌐 **Timezone Settings**\n\n` +
            `Current: **${currentTz}**\n\n` +
            `**Usage:** \`!timezone America/Los_Angeles\`\n\n` +
            `Common timezones:\n` +
            `• America/New_York (EST/EDT)\n` +
            `• America/Chicago (CST/CDT)\n` +
            `• America/Denver (MST/MDT)\n` +
            `• America/Los_Angeles (PST/PDT)\n` +
            `• Europe/London\n` +
            `• Asia/Tokyo`
        );
    }

    // Validate timezone
    if (!moment.tz.zone(tz)) {
        return message.reply('⚠️ Unknown timezone. Use a valid IANA timezone (e.g., `America/New_York`).');
    }

    await setUserPrefs(userId, { TZ: tz }, googleSheets);
    await updateUserSchedule(client, googleSheets, userId, {
        getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),
        getTodayEntries: googleSheets.getTodayEntries.bind(googleSheets),
        setUserPrefs: (id, partial) => setUserPrefs(id, partial, googleSheets)
    });

    return message.reply(`🌐 Timezone set to **${tz}**.`);
}

// Handle snooze command - temporarily disable reminders
async function handleSnooze(message, args) {
    const userId = message.author.id;
    const duration = (args || '').trim();

    if (!duration) {
        const prefs = await getUserPrefs(userId, googleSheets);
        if (prefs?.SnoozeUntil) {
            const until = moment.tz(prefs.SnoozeUntil, prefs.TZ || 'America/Los_Angeles');
            return message.reply(
                `💤 **Snooze Status**\n\n` +
                `Reminders snoozed until: **${until.format('MMM DD, YYYY HH:mm')}**\n\n` +
                `Use \`!snooze clear\` to re-enable reminders.`
            );
        } else {
            return message.reply(
                `💤 **Snooze Reminders**\n\n` +
                `**Usage:**\n` +
                `• \`!snooze 1h\` - Snooze for 1 hour\n` +
                `• \`!snooze 3d\` - Snooze for 3 days\n` +
                `• \`!snooze 1w\` - Snooze for 1 week\n` +
                `• \`!snooze clear\` - Re-enable reminders`
            );
        }
    }

    if (duration === 'clear') {
        await setUserPrefs(userId, { SnoozeUntil: '' }, googleSheets);
        await updateUserSchedule(client, googleSheets, userId, {
            getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),
            getTodayEntries: googleSheets.getTodayEntries.bind(googleSheets),
            setUserPrefs: (id, partial) => setUserPrefs(id, partial, googleSheets)
        });
        return message.reply('✅ Reminders re-enabled (snooze cleared).');
    }

    // Parse duration (e.g., "1h", "3d", "1w")
    const match = duration.match(/^(\d+)([hdw])$/);
    if (!match) {
        return message.reply('⚠️ Invalid duration. Use format like `1h`, `3d`, or `1w`.');
    }

    const [, amount, unit] = match;
    const prefs = await getUserPrefs(userId, googleSheets);
    const tz = prefs?.TZ || 'America/Los_Angeles';
    const now = moment().tz(tz);

    let until;
    switch (unit) {
        case 'h':
            until = now.clone().add(parseInt(amount), 'hours');
            break;
        case 'd':
            until = now.clone().add(parseInt(amount), 'days');
            break;
        case 'w':
            until = now.clone().add(parseInt(amount), 'weeks');
            break;
    }

    await setUserPrefs(userId, { SnoozeUntil: until.toISOString() }, googleSheets);
    await updateUserSchedule(client, googleSheets, userId, {
        getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),
        getTodayEntries: googleSheets.getTodayEntries.bind(googleSheets),
        setUserPrefs: (id, partial) => setUserPrefs(id, partial, googleSheets)
    });

    return message.reply(`💤 Reminders snoozed until **${until.format('MMM DD, YYYY HH:mm')}**.`);
}

function setupReminders() {
    const morningTime = process.env.MORNING_REMINDER_TIME || '09:00';
    const eveningTime = process.env.EVENING_REMINDER_TIME || '20:00';

    // Morning reminder
    const [morningHour, morningMinute] = morningTime.split(':');
    cron.schedule(`${morningMinute} ${morningHour} * * *`, async () => {
        const channel = client.channels.cache.get(CHANNEL_ID);
        if (channel) {
            await channel.send('☀️ Good morning! Don\'t forget to log your breakfast and any morning symptoms. Use `!help` if you need command reminders!');
        }
    });

    // Evening reminder
    const [eveningHour, eveningMinute] = eveningTime.split(':');
    cron.schedule(`${eveningMinute} ${eveningHour} * * *`, async () => {
        const channel = client.channels.cache.get(CHANNEL_ID);
        if (channel) {
            await channel.send('🌙 Evening check-in! Remember to log your dinner and any symptoms from today. Use `!today` to see your daily summary!');
        }
    });

    console.log(`✅ Reminders scheduled for ${morningTime} and ${eveningTime}`);
}

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
console.log('🔑 Attempting to login to Discord...');
console.log(`   Token length: ${DISCORD_TOKEN ? DISCORD_TOKEN.length : 'undefined'} characters`);
console.log(`   Token starts with: ${DISCORD_TOKEN ? DISCORD_TOKEN.substring(0, 20) + '...' : 'undefined'}`);

client.login(DISCORD_TOKEN)
    .then(() => {
        console.log('🔐 Successfully authenticated with Discord');
    })
    .catch(error => {
        console.error('❌ Failed to login to Discord:', error);
        console.log('Please check your DISCORD_TOKEN in the .env file');
        process.exit(1);
    });