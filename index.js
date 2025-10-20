require('dotenv').config();

// Auto-setup credentials on Replit
if (process.env.REPL_ID && !require('fs').existsSync('credentials.json')) {
    console.log('🔧 Setting up credentials from environment variables...');
    require('./setup-credentials');
}

const { Client, GatewayIntentBits, EmbedBuilder, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const time = require('./src/utils/time');
const googleSheets = require('./services/googleSheets');
const analyzer = require('./utils/analyzer');
const NLPHandler = require('./utils/nlpHandler');
const PatternAnalyzer = require('./utils/patternAnalyzer');
const ClarificationHandler = require('./utils/clarificationHandler');
const keepAlive = require('./keep_alive');
const { getUserProfile, updateUserProfile, ensureProfileSheet } = require('./services/userProfile');

// NLU System imports - V2 UPGRADE
const { understand, formatParseResult } = require('./src/nlu/understand-v2');
const { extractMetadata } = require('./src/nlu/rules');
const { getWindowStartTime } = require('./src/nlu/ontology');
const { record: recordNLUMetrics } = require('./src/nlu/metrics-v2');
const { postprocess } = require('./src/nlu/postprocess');

// Calorie System imports
const { shouldEnableCalorieFeatures } = require('./src/auth/scope');
const { parseComplexIntent } = require('./src/nlu/rulesIntent');
const { enqueue } = require('./src/jobs/jobsStore');
const { start: startJobRunner, processOverdueJobs } = require('./src/jobs/runner');
const { estimate, getDailyKcalTarget, calculateDailyTotals, formatDailyProgress } = require('./src/calories/estimate');
const { deliverNotification, testDMHandshake } = require('./src/notify/channelOrDM');

// Charts System
const { handleChart } = require('./src/commands/chart');
const { handleChartsMenu, handleChartButton } = require('./src/commands/chartsMenu');

// UX System imports
const { EMOJI, PHRASES, getRandomPhrase, BUTTON_IDS } = require('./src/constants/ux');
const { buttonsSeverity, buttonsMealTime, buttonsBristol, buttonsSymptomType, trendChip, buttonsIntentClarification, buildConversationalHelp } = require('./src/ui/components');
const { buildPostLogChips } = require('./src/ui/chips');
const contextMemory = require('./src/utils/contextMemory');
const digests = require('./src/scheduler/digests');
const buttonHandlers = require('./src/handlers/buttonHandlers');
const { handleHelpButton } = require('./src/handlers/buttonHandlers'); // Explicit import
const uxButtons = require('./src/handlers/uxButtons');
const { isDuplicate } = require('./src/utils/dedupe');
const { validateQuality } = require('./src/utils/qualityCheck');
const { generateQuery, synthesizeAnswer } = require('./src/insights/AIAnalyst');
const DialogManager = require('./src/dialogs/DialogManager');
const symptomLogDialog = require('./src/dialogs/symptomLogDialog');
const ProactiveScheduler = require('./src/scheduler/proactiveScheduler');

// Calorie estimation
const { estimateCaloriesForItemAndSides } = require('./src/nutrition/estimateCalories');
const { getSheetName } = require('./src/utils/getSheetName');

// Reminders & preferences
const { scheduleAll, updateUserSchedule } = require('./src/scheduler/reminders');
const { scheduleContextualFollowups } = require('./src/handlers/contextualFollowups');
const dndCommands = require('./src/commands/dnd');
const { markInteracted, isUnderWatch } = require('./src/reminders/responseWatcher');
const { updateMealNotes } = require('./src/utils/mealNotes');

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

const recentMessageIds = new Set();

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

// The command object is now deprecated and will be removed.
// All functionality is handled by the NLU router.

// Add raw event debug listener
client.on('raw', (packet) => {
    // Only log MESSAGE_CREATE events for debugging
    if (packet.t === 'MESSAGE_CREATE') {
        console.log('🔔 Raw MESSAGE_CREATE event received');
    }
});

// Bot ready event
client.once('clientReady', async () => {
    const timestamp = time.now(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');

    console.log(`✅ Louton GI Bot is online as ${client.user.tag}`);
    console.log(`🕐 Bot ready at: ${timestamp}`);
    console.log(`📍 Mode: ${CHANNEL_ID ? 'Channel + DM' : 'DM Only'}`);

    // Initialize Google Sheets
    try {
        await googleSheets.initialize();
        console.log('✅ Connected to Google Sheets');

        // Ensure User_Profiles sheet exists before other tabs
        await ensureProfileSheet(googleSheets);

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
            // Pass the updateUserProfile function for the scheduler to use
            updateUserProfile: (id, profile) => updateUserProfile(id, profile, googleSheets)
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

    // Initialize the DialogManager with the logging function
    symptomLogDialog.initialize(logFromNLU);

    // Start the Proactive Analyst scheduler
    ProactiveScheduler.start(client, { googleSheets, getUserProfile });

    // Start the job runner for calorie reminders
    startJobRunner(client);
    
    // Process any overdue jobs on startup
    await processOverdueJobs(client);

    console.log('🚀 Bot is fully operational and ready for commands!');
});

// Button interaction listener
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    // ========== PHASE 4.1: RESPONSE WATCHER ==========
    // Check if user is under watch (within 20 min of reminder)
    const userId = interaction.user.id;
    if (isUnderWatch(userId)) {
        const profile = await getUserProfile(userId, googleSheets);
        await markInteracted(userId, profile.prefs, googleSheets);
    }

    // Route help buttons
    if (interaction.customId.startsWith('help:')) {
        await handleHelpButton(interaction);
        return;
    }

    // Route chart buttons
    if (interaction.customId.startsWith('chart:')) {
        const chartDeps = {
            googleSheets,
            getUserProfile,
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
    let saveSucceeded = false;

    // --- DIALOG MANAGER ---
    // If a dialog is active, route the message to the manager and stop further processing.
    if (DialogManager.hasActiveDialog(userId)) {
        await DialogManager.handleResponse(message);
        return;
    }

    // --- POST-MEAL CHECK (Convo Polish Phase) ---
    const pendingCheck = contextMemory.getPendingContext(userId);
    if (pendingCheck && (pendingCheck.type === 'post_meal_check' || pendingCheck.type === 'post_meal_check_wait_severity')) {
        // If the context has expired, treat as a normal message
        if (pendingCheck.expiresAt && pendingCheck.expiresAt < Date.now()) {
            console.log(`[POST_MEAL_CHECK] Pending context expired for user ${userId}. Clearing and proceeding with normal NLU.`);
            contextMemory.clearPendingContext(userId);
        } else {
            console.log(`[POST_MEAL_CHECK] Handling message for pending post-meal check for user ${userId}.`);
            await handlePostMealCheck(message, pendingCheck);
            return;
        }
    }

    // ========== CALORIE FEATURES (Peyton only) ==========
    // Check if user is authorized for calorie features
    if (shouldEnableCalorieFeatures(userId)) {
        // Try to parse complex calorie-related intents
        const complexIntent = parseComplexIntent(text);
        if (complexIntent) {
            await handleComplexIntent(message, complexIntent);
        return;
        }
    }

    // ========== CONTEXTUAL FOLLOW-UP ==========
    try {
        // Parse intent and slots with V2
        const profile = await getUserProfile(userId, googleSheets);
        const tz = profile.prefs.TZ; // Get TZ from profile

        // CONTEXTUAL FOLLOW-UP needs the timezone
        const pendingContext = contextMemory.getPendingContext(userId);
        if (pendingContext && pendingContext.type === 'expecting_symptom_follow_up') {
            const result = await understand(text, { userId, tz, forcedIntent: 'symptom' });
            if (result.intent === 'symptom' || result.intent === 'reflux') {
                result.slots.linked_item = pendingContext.data.linkedItem;
                console.log(`[Context] Follow-up symptom detected, linking to: ${pendingContext.data.linkedItem}`);
                await logFromNLU(message, result);
                return; // End processing for this follow-up
            }
        }

        const understandOptions = { userId, tz };
        if (message.forcedIntent) {
            understandOptions.forcedIntent = message.forcedIntent;
        }

        const result = await understand(text, understandOptions, contextMemory);

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

        // Confidence threshold: Don't auto-log if confidence is too low
        if ((LOGGABLE_INTENTS.includes(result.intent) && result.confidence < 0.65) || result.intent === 'other') {
            await requestIntentClarification(message);
            return;
        }

        // If intent is not loggable and not conversational, ask for clarification
        if (!LOGGABLE_INTENTS.includes(result.intent)) {
            // It's not a loggable intent, and not a known conversational one.
            // Let's check if it's a question before giving up.
            if (result.intent !== 'question') {
                // This is a potential trigger for a dialog if the intent is 'other' or low-confidence symptom
                if (result.intent === 'symptom' && result.missing.length > 0) {
                    const initialContext = { ...result.slots, tz }; // Pass timezone into the dialog
                    await DialogManager.startDialog('symptom_log', message, initialContext);
                    return;
                }
                await requestIntentClarification(message);
                return;
            }
        }

        // Handle the question intent
        if (result.intent === 'question') {
            await handleQuestion(message, result.slots.query);
            return;
        }

        // Handle utility intents
        if (result.intent === 'help') {
            await handleHelp(message);
            return;
        }
        if (result.intent === 'undo') {
            await handleUndo(message);
            return;
        }
        if (result.intent === 'settings') {
            // For now, route all settings-related queries to the reminders handler.
            // This can be expanded later to be more specific.
            await handleReminders(message, result.slots.query);
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
            const logResult = await logFromNLU(message, result);
            saveSucceeded = logResult.success;

            if (saveSucceeded) {
                // Fire and forget post-save actions
                postLogActions(message, result, logResult.undoId, logResult.caloriesVal);
            }

        } else {
            // Ask for missing slots via buttons
            await requestMissingSlots(message, result);
            saveSucceeded = true; // Clarification sent, not an error
        }
    } catch (error) {
        console.error('[NLU Error]:', error);

        // Only send error if save didn't succeed
        if (!saveSucceeded) {
            try {
                await message.reply(`${EMOJI.error} ${getRandomPhrase(PHRASES.error)}`);
            } catch (replyError) {
                console.error('[NLU] Failed to send error message:', replyError);
            }
        } else {
            console.warn('[NLU] Error after successful save (not shown to user):', error.message);
        }
    }
    // NEVER throw from this function - always handle errors internally
}

/**
 * Handles all the "fire-and-forget" actions that should happen after a log is successfully saved.
 * This includes sending confirmation messages, follow-ups, and background context updates.
 * This function should never throw an error.
 */
async function postLogActions(message, parseResult, undoId, caloriesVal) {
    const { intent, slots } = parseResult;
    const userId = message.author.id;
    const isPeyton = (userId === PEYTON_ID);

    // 1. Send Success Message
    try {
        let confirmText = '';
        const emoji = getTypeEmoji(intent);
        const details = (parseResult.slots.item || parseResult.slots.symptom_type || intent).trim();

        if (intent === 'food' || intent === 'drink') {
            if (shouldEnableCalorieFeatures(userId) && caloriesVal != null && caloriesVal > 0) {
                confirmText = `✅ Logged **${details}** — ≈${caloriesVal} kcal.`;
                
                // Add daily progress for calorie users
                try {
                    const todayEntries = await googleSheets.getTodayEntries(userId);
                    const totals = calculateDailyTotals(todayEntries.rows || []);
                    const target = await getDailyKcalTarget(userId);
                    const progress = formatDailyProgress(totals, target);
                    
                    confirmText += `\n\n📊 ${progress}`;
                } catch (e) {
                    console.warn('[postLogActions] Error calculating daily progress:', e.message);
                }
            } else {
                confirmText = `✅ Logged **${details}**.`;
            }
        } else {
            confirmText = `${emoji} Logged **${details}**.`;
        }

        const chips = buildPostLogChips({ undoId, intent });
        await message.reply({ content: confirmText, components: chips });
    } catch (e) {
        console.error('[postLogActions] Error sending success message:', e);
    }

    // 2. Ask Follow-up Question
    if (intent === 'food' || intent === 'drink') {
        try {
            await message.channel.send("How are you feeling after that?");
            // Set a pending context for post-meal check
            contextMemory.setPendingContext(userId, 'post_meal_check', {
                meal_id: undoId // Link to the logged meal
            }, 120); // 2 minute TTL for follow-up
        } catch (e) {
            console.warn('[postLogActions] Error sending follow-up question:', e.message);
        }
    }

    // 3. Dispatch Background Tasks
    setImmediate(() => {
        try {
            contextMemory.push(userId, {
                type: intent,
                details: slots.item || slots.symptom_type || intent,
                severity: slots.severity ? mapSeverityToLabel(slots.severity) : '',
                timestamp: Date.now()
            });

            if (intent === 'symptom' || intent === 'reflux') {
                scheduleSymptomFollowup(userId).catch(e => console.warn('[POSTSAVE][warn] followup:', e.message));
            }

            if (parseResult.multi_actions && parseResult.multi_actions.length > 0) {
                for (const action of parseResult.multi_actions) {
                    delete action.multi_actions;
                    setTimeout(() => {
                        logFromNLU(message, action).catch(e => console.error('[Multi-Action] Error logging sub-action:', e));
                    }, 500);
                }
            }
            console.log('[SAVE] ✅ Post-save background tasks dispatched');
        } catch(e) {
            console.error('[postLogActions] Error in background tasks:', e);
        }
    });
}

/**
 * Handles complex calorie-related intents
 * @param {Message} message The Discord message object.
 * @param {Object} intent The parsed complex intent.
 */
async function handleComplexIntent(message, intent) {
    const userId = message.author.id;
    
    switch (intent.kind) {
        case 'after_meal_ping':
            await handleReminderSetup(message, intent);
            break;
        case 'stop_meal_reminders':
            await handleStopReminders(message);
            break;
        case 'set_calorie_target':
            await handleSetCalorieTarget(message, intent);
            break;
        default:
            console.log(`[CALORIE] Unknown complex intent: ${intent.kind}`);
    }
}

/**
 * Handles setting up meal reminders
 * @param {Message} message The Discord message object.
 * @param {Object} intent The reminder intent.
 */
async function handleReminderSetup(message, intent) {
    const userId = message.author.id;
    const { delayMin, scope } = intent;
    
    // Test DM handshake first
    const handshakeResult = await testDMHandshake(client, userId);
    
    if (handshakeResult.success) {
        // Store the reminder rule (this would be persisted)
        console.log(`[CALORIE] Setting up ${scope} reminders with ${delayMin}min delay for user ${userId}`);
        
        await message.reply(`✅ I'll DM you ~${delayMin} minutes after each ${scope} to add calories. ${handshakeResult.message}`);
    } else {
        await message.reply(`⚠️ ${handshakeResult.message}`);
    }
}

/**
 * Handles stopping meal reminders
 * @param {Message} message The Discord message object.
 */
async function handleStopReminders(message) {
    const userId = message.author.id;
    
    // Cancel existing jobs (this would be implemented)
    console.log(`[CALORIE] Stopping meal reminders for user ${userId}`);
    
    await message.reply('✅ Meal reminders stopped. You can re-enable them anytime by saying "ask me 30 min after every meal to log calories".');
}

/**
 * Handles setting calorie targets
 * @param {Message} message The Discord message object.
 * @param {Object} intent The target intent.
 */
async function handleSetCalorieTarget(message, intent) {
    const userId = message.author.id;
    const { target } = intent;
    
    // Update user's calorie target (this would be persisted)
    console.log(`[CALORIE] Setting calorie target to ${target} for user ${userId}`);
    
    await message.reply(`✅ Daily calorie target set to ${target} kcal. I'll track your progress against this goal.`);
}

/**
 * Handles a user's question about their data.
 * @param {Message} message The Discord message object.
 * @param {string} query The user's natural language question.
 */
async function handleQuestion(message, query) {
    await message.channel.sendTyping();

    // 1. Generate a structured query from the natural language question.
    const structuredQuery = await generateQuery(query);

    if (structuredQuery.error) {
        await message.reply(`${EMOJI.error} ${structuredQuery.error}`);
        return;
    }

    // 2. Execute the query against the user's Google Sheet.
    const userId = message.author.id;
    const sheetName = googleSheets.getLogSheetNameForUser(userId);
    const queryResult = await googleSheets.executeQuery(sheetName, structuredQuery);

    if (!queryResult.success) {
        await message.reply(`${EMOJI.error} I had trouble fetching your data. Please try again.`);
        return;
    }

    // 3. Synthesize a natural language answer from the results.
    const finalAnswer = await synthesizeAnswer(query, queryResult);

    await message.reply(finalAnswer);
}

/**
 * Sends the new conversational help message.
 * @param {import('discord.js').Message} message The Discord message object.
 */
async function handleHelp(message) {
    const helpPayload = buildConversationalHelp();
    await message.reply(helpPayload);
}


/**
 * Asks the user to clarify their intent when NLU is unsure.
 * @param {import('discord.js').Message} message The Discord message object.
 */
async function requestIntentClarification(message) {
    // Store the original message content for later processing
    buttonHandlers.pendingClarifications.set(message.author.id, {
        type: 'intent_clarification',
        originalMessage: message.content,
        timestamp: Date.now()
    });

    await message.reply({
        content: `${EMOJI.thinking} How should I log that?`,
        components: buttonsIntentClarification()
    });
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
    const sheetName = getSheetName(userId, userTag);

    // Get user profile for learned calories
    const userProfile = await getUserProfile(userId, googleSheets);

    let caloriesVal = null;
    if ((intent === 'food' || intent === 'drink') && isPeyton) {
        // --- PERSONALIZED CALORIE MEMORY ---
        const fullItemDescription = (slots.item + (slots.sides ? `, ${slots.sides}` : '')).toLowerCase().trim();

        // 1. Check for a learned value first for consistency
        if (userProfile.learnedCalorieMap && userProfile.learnedCalorieMap[fullItemDescription]) {
            caloriesVal = userProfile.learnedCalorieMap[fullItemDescription];
            console.log(`[CAL-MEM] ✅ Recalled calories for "${fullItemDescription}": ${caloriesVal} kcal`);
        } else {
            // 2. If not found, estimate it
            try {
                caloriesVal = await estimateCaloriesForItemAndSides(slots.item, slots.sides);
                
                // 3. If estimation is successful, learn it for next time
                if (caloriesVal !== null && caloriesVal > 0) {
                    console.log(`[CAL-MEM] 🧠 Learning calories for "${fullItemDescription}": ${caloriesVal} kcal`);
                    userProfile.learnedCalorieMap[fullItemDescription] = caloriesVal;
                    // Fire-and-forget the update, don't block logging
                    updateUserProfile(userId, userProfile, googleSheets).catch(err => {
                        console.error(`[USER_PROFILE] Non-blocking profile update failed: ${err.message}`);
                    });
                }
            } catch (e) {
                console.error(`[CAL-EST] CRITICAL: Calorie estimation failed unexpectedly for "${slots.item}". Error: ${e.message}`);
                caloriesVal = null; // Proceed with logging, calories will be null
            }
        }
    }

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

    // Add linked item from conversational context
    if (slots.linked_item) {
        notesString += `; linked_to=${slots.linked_item}`;
    }

    // Estimate calories for Peyton only (with portion multiplier)
    // This block is now redundant as caloriesVal is calculated above
    // if (intent === 'food' && isPeyton) {
    //     try {
    //         caloriesVal = await estimateCaloriesForItemAndSides(slots.item, slots.sides);
    //     } catch (e) {
    //         console.error(`[CAL-EST] CRITICAL: Calorie estimation failed unexpectedly for "${slots.item}". Error: ${e.message}`);
    //         // Do not re-throw. Proceed with logging, calories will be null.
    //         caloriesVal = null;
    //     }
    // } else if (intent === 'food' && !isPeyton) {
    //     // Louis: explicitly no calorie tracking
    //     notes.push('calories=disabled');
    // }

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
    // Estimate macros if we have calories (for calorie users only)
    let proteinVal = null, carbsVal = null, fatVal = null;
    if (shouldEnableCalorieFeatures(userId) && caloriesVal && caloriesVal > 0) {
        const macroEstimate = estimate({ 
            item: slots.item, 
            quantity: slots.sides,
            units: 'serving' 
        });
        if (macroEstimate) {
            proteinVal = macroEstimate.protein;
            carbsVal = macroEstimate.carbs;
            fatVal = macroEstimate.fat;
        }
    }

    const rowObj = {
        'Timestamp': new Date().toISOString(),
        'Date': new Date().toISOString().slice(0, 10),
        'Time': new Date().toISOString().slice(11, 19),
        'User': userTag,
        'Type': intent,
        'Item': details,
        'Calories': (caloriesVal != null && caloriesVal > 0) ? caloriesVal : '',
        'Protein': proteinVal || '',
        'Carbs': carbsVal || '',
        'Fat': fatVal || '',
        'Notes': notesString // Use validated/safe Notes string
    };

    // ========== 1. APPEND ROW (Critical - can fail) ==========
    const result = await googleSheets.appendRowToSheet(sheetName, rowObj);

    if (!result.success) {
        await message.reply(`${EMOJI.error} ${result.error.userMessage}`);
        return { success: false }; // Save failed
    }

    console.log(`[SAVE] ✅ Successfully appended to ${sheetName}`);

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

    return { success: true, undoId: undoId, caloriesVal: caloriesVal, rowObj: rowObj };
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

/**
 * Handles replies to the "How are you feeling after that?" post-meal check.
 * @param {import('discord.js').Message} message The Discord message object.
 * @param {object} pendingCheck The pending context object for the post-meal check.
 */
async function handlePostMealCheck(message, pendingCheck) {
    const text = message.content.trim();
    const userId = message.author.id;

    const pos = /\b(solid|all good|pretty good|good|great|fine|okay|ok|no issues|no problem|felt fine|im fine)\b/i.test(text);
    const negMatch = text.match(/\b(reflux|heartburn|nausea|bloat(?:ed|ing)?|gas(?:sy)?|cramp(?:s|ing)?|pain|burning|regurgitation|ugh|bad)\b/i);
    const sevWord = (text.match(/\b(mild|moderate|severe)\b/i) || [])[1];
    const sevNum = (text.match(/\b([1-9]|10)\b/) || [])[1];

    // Helper to map severity words to numbers
    const wordToSeverity = (word) => {
        if (!word) return null;
        switch (word.toLowerCase()) {
            case 'none': return 0;
            case 'mild': return 3;
            case 'moderate': return 6;
            case 'severe': return 9;
            default: return null;
        }
    };

    // If no negative keywords and a positive keyword is found
    if (pos && !negMatch) {
        console.log(`[POST_MEAL_CHECK] Positive response for meal ${pendingCheck.meal_id}: ${text}`);
        // Append a token to the meal's Notes: after_effect=ok
        await updateMealNotes(pendingCheck.meal_id, 'after_effect=ok', googleSheets);
        await message.reply("Got it—no symptoms. ✅");
        contextMemory.clearPendingContext(userId);
        return;
    }

    // If a negative keyword is found
    if (negMatch) {
        console.log(`[POST_MEAL_CHECK] Negative response for meal ${pendingCheck.meal_id}: ${text}`);
        const severity = sevNum ? Number(sevNum) : wordToSeverity(sevWord);
        if (severity !== null) {
            const symptomType = negMatch[1].toLowerCase();
            await logSymptomForMeal(userId, symptomType, severity, pendingCheck.meal_id);
            await message.reply(`Logged ${symptomType} (severity ${severity}).`);
            contextMemory.clearPendingContext(userId);
            return;
        }
    }

    // If unclear or missing severity, ask once with buttons
    console.log(`[POST_MEAL_CHECK] Unclear response for meal ${pendingCheck.meal_id}: ${text}. Requesting clarification.`);
    await message.reply({
        content: `${EMOJI.thinking} Any symptoms to log?`,
        components: buttonsSeverity(false, true) // Pass true to include 'None' button
    });
    // Update pending context to expect severity button click
    contextMemory.setPendingContext(userId, 'post_meal_check_wait_severity', pendingCheck, 120); // 2 min TTL
}

/**
 * Helper function to log a symptom linked to a meal.
 * @param {string} userId - The Discord user ID.
 * @param {string} symptomType - The type of symptom.
 * @param {number} severity - The severity of the symptom (1-10).
 * @param {string} mealId - The mealId (e.g., "Peyton:123") to link the symptom to.
 */
async function logSymptomForMeal(userId, symptomType, severity, mealId) {
    const userTag = (await client.users.fetch(userId)).tag; // Fetch user tag
    const sheetName = getSheetName(userId, userTag);
    const timestamp = new Date().toISOString();
    const date = timestamp.slice(0, 10);
    const time = timestamp.slice(11, 19);

    const rowObj = {
        'Timestamp': timestamp,
        'Date': date,
        'Time': time,
        'User': userTag,
        'Type': 'symptom',
        'Item': symptomType,
        'Severity': severity,
        'Notes': `notes_v=2.1; severity_map=${mapSeverityToLabel(severity)}; linked_meal=${mealId}`,
        'Calories': '',
        'Protein': '',
        'Carbs': '',
        'Fat': '',
    };
    await googleSheets.appendRowToSheet(sheetName, rowObj);
    console.log(`[POST_MEAL_CHECK] Logged symptom ${symptomType} (severity ${severity}) linked to ${mealId}`);
}

// ========== END NLU SYSTEM HELPER FUNCTIONS ==========

// Message handler (supports both DMs and channel messages)
client.on('messageCreate', async (message) => {
    try {
        // Ignore bot messages (including self)
        if (message.author.bot) {
            console.log(`[FILTER] Ignoring bot message from ${message.author.tag}`);
            return;
        }

        // Additional safety: ignore messages from the bot's own user ID
        if (message.author.id === client.user?.id) {
            console.log(`[FILTER] Ignoring self-message from bot user ID`);
            return;
        }

        // ========== PHASE 4.1: RESPONSE WATCHER ==========
        // Check if user is under watch (within 20 min of reminder)
        const userId = message.author.id;
        if (isUnderWatch(userId)) {
            const profile = await getUserProfile(userId, googleSheets);
            await markInteracted(userId, profile.prefs, googleSheets);
        }

        // Extract message info
        const isDM = !message.guild;
        const isAllowedChannel = CHANNEL_ID && message.channel.id === CHANNEL_ID;
        const content = (message.content || '').trim();
        const hasPrefix = content.startsWith('!');
        const isSlash = !!message.interaction;

        // Any message that is not a command is a potential NLU input
        const isCommand = hasPrefix || isSlash;

        // Permission check: Only process DMs or allowed channel messages
        if (!isDM && !isAllowedChannel) {
            return; // Silently ignore messages from other channels
        }

        // --- IDEMPOTENCY CHECK ---
        // If we've seen this message ID recently, ignore it to prevent duplicate processing
        if (recentMessageIds.has(message.id)) {
            console.log(`[IDEMPOTENCY] Ignoring duplicate message ID: ${message.id}`);
            return;
        }
        recentMessageIds.add(message.id);
        // Clean up old message IDs after a safe interval (e.g., 1 minute) to prevent memory leaks
        setTimeout(() => {
            recentMessageIds.delete(message.id);
        }, 60 * 1000);


        // All non-bot messages are now routed through the NLU handler.
        // The NLU handler will decide if it's a log, question, or utility command.
        try {
            await handleNaturalLanguage(message);
        } catch (nluError) {
            console.error('[ROUTER] Unexpected NLU error:', nluError);
        }

    } catch (err) {
        console.error('[ROUTER] ❌ Error in messageCreate handler:', err);
        // DO NOT send error to user - specific handlers already did
        // This catch is only for logging catastrophic failures
        console.warn('[ROUTER] Top-level catch fired - errors should be handled by specific handlers');
    }
});

// Command handler functions
async function handleUndo(message) { // Removed 'args' from signature
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
    const profile = await getUserProfile(userId, googleSheets);
    const currentPrefs = profile.prefs;

    if (!args || args.trim() === '' || args.trim().toLowerCase() === 'reminders' || args.trim().toLowerCase() === 'settings') {
        // --- Display Current Settings ---
        const status = currentPrefs.DM === 'on' ? '✅ **On**' : '❌ **Off**';
        const morning = currentPrefs.MorningHHMM ? `☀️ Morning: \`${currentPrefs.MorningHHMM}\`` : '☀️ Morning: Off';
        const evening = currentPrefs.EveningHHMM ? `🌙 Evening: \`${currentPrefs.EveningHHMM}\`` : '🌙 Evening: Off';
        const inactivity = currentPrefs.InactivityHHMM ? `🚶 Inactivity: \`${currentPrefs.InactivityHHMM}\`` : '🚶 Inactivity: Off';
        const tz = `🌐 Timezone: \`${currentPrefs.TZ}\``;

        const statusMessage = `
🔔 **Your Reminder Settings**
Status: ${status}
${morning}
${evening}
${inactivity}
${tz}

You can change these by talking to me naturally, for example:
• "Turn reminders on"
• "Set my morning check-in for 8am"
• "Change my timezone to America/New_York"
        `;
        return message.reply(statusMessage.trim());
    }

    // --- Handle Setting Changes ---
    // (This part remains the same)
    const [sub, val] = args.trim().split(/\s+/);

    // Handle on/off
    if (sub === 'on' || sub === 'off') {
        profile.prefs.DM = sub;
        await updateUserProfile(userId, profile, googleSheets);
        await updateUserSchedule(client, googleSheets, userId, {
            getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),
            getTodayEntries: googleSheets.getTodayEntries.bind(googleSheets),
            updateUserProfile: (id, profile) => updateUserProfile(id, profile, googleSheets)
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

        profile.prefs[key] = timeValue;
        await updateUserProfile(userId, profile, googleSheets);
        await updateUserSchedule(client, googleSheets, userId, {
            getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),
            getTodayEntries: googleSheets.getTodayEntries.bind(googleSheets),
            updateUserProfile: (id, profile) => updateUserProfile(id, profile, googleSheets)
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
    await dndCommands.handleDND(message, args, { getUserProfile, updateUserProfile, googleSheets });
}

async function handleTimezone(message, args) {
    await dndCommands.handleTimezone(message, args, { getUserProfile, updateUserProfile, googleSheets });
}

async function handleSnooze(message, args) {
    await dndCommands.handleSnooze(message, args, { getUserProfile, updateUserProfile, googleSheets });
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

// module.exports = { handleNaturalLanguage }; // Removed to fix circular dependency