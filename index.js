require('dotenv').config();

// Auto-setup credentials on Replit
if (process.env.REPL_ID && !require('fs').existsSync('credentials.json')) {
    console.log('🔧 Setting up credentials from environment variables...');
    require('./setup-credentials');
}

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const cron = require('node-cron'); // Still used for proactive scheduler
const time = require('./src/utils/time');
const googleSheets = require('./services/googleSheets');
const keepAlive = require('./keep_alive');
const { getUserProfile, updateUserProfile, ensureProfileSheet } = require('./services/userProfile');

// Calorie System imports
const { enqueue } = require('./src/jobs/jobsStore');
const { start: startJobRunner, processOverdueJobs } = require('./src/jobs/runner');

// Charts System
const { handleChartButton } = require('./src/commands/chartsMenu');

// UX System imports
const { keyFrom, get, set, clear } = require('./services/pending'); // New pending context service
const digests = require('./src/scheduler/digests');
const buttonHandlers = require('./src/handlers/buttonHandlers');
const { handleHelpButton } = require('./src/handlers/buttonHandlers'); // Explicit import
const uxButtons = require('./src/handlers/uxButtons');
const DialogManager = require('./src/dialogs/DialogManager');
const symptomLogDialog = require('./src/dialogs/symptomLogDialog');
const ProactiveScheduler = require('./src/scheduler/proactiveScheduler');

const { Message } = require('discord.js');
const { sendCleanReply } = require('./src/utils/messaging'); // Explicitly import sendCleanReply

// Reminders & preferences
const { scheduleAll } = require('./src/scheduler/reminders');
const { markInteracted, isUnderWatch } = require('./src/reminders/responseWatcher');

// Import the new message router
const handleMessage = require('./src/router/handleMessage');

// Start keep-alive server for Replit deployment
keepAlive();

// Deprecation Check
const { assertNotLoaded } = require('./src/boot/deprecationCheck');
assertNotLoaded('pendingClarifications', require('./src/handlers/uxButtons.js'));
assertNotLoaded('pendingClarifications', require('./src/handlers/buttonHandlers.js'));

// ========== Phase 5: Performance & Monitoring ==========
const { startHeartbeat } = require('./src/health/heartbeat');
const { recordNLUParse } = require('./src/commands/nluStats');

// Start heartbeat monitor
startHeartbeat();
// ======================================================

// ========== Clean Messaging System (Phase 7) ==========
// Monkey-patch message.reply() globally to remove gray reply bar
// Already imported above, no need to re-import Message and sendCleanReply

Message.prototype.reply = function (content, options) {
  return sendCleanReply(this, content, options);
};
console.log('✅ Patched Message.prototype.reply() → clean sends (no gray bar)');

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

// Helper to encapsulate all dependencies for message handling
function makeDependencies() {
    return {
        client,
        googleSheets,
        getUserProfile,
        updateUserProfile,
        PEYTON_ID,
        TIMEZONE,
        CHANNEL_ID,
        USER1_NAME,
        USER2_NAME,
        ENABLE_REMINDERS,
        LOUIS_ID,
        userGoals,
        pendingFollowups,
        TRIGGER_ITEMS,
        RESPONSES,

        // NLU related
        // understand, // Removed
        // formatParseResult, // Removed
        // postprocess, // Removed
        // recordNLUMetrics, // Removed
        // recordNLUParse, // Removed
        // shouldEnableCalorieFeatures, // Removed
        // parseComplexIntent, // Removed

        // Calorie related
        enqueue,
        // estimate, // Removed
        // getDailyKcalTarget, // Removed
        // calculateDailyTotals, // Removed
        // formatDailyProgress, // Removed
        // deliverNotification, // Removed
        // testDMHandshake, // Removed
        // estimateCaloriesForItemAndSides, // Removed
        getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),

        // UX/UI related
        // EMOJI, // Removed
        // PHRASES, // Removed
        // getRandomPhrase, // Removed
        // BUTTON_IDS, // Removed
        // buttonsSeverity, // Removed
        // buttonsMealTime, // Removed
        // buttonsBristol, // Removed
        // buttonsSymptomType, // Removed
        // buttonsIntentClarification, // Removed
        // buildConversationalHelp, // Removed
        // buildPostLogChips, // Removed

        // Pending context
        keyFrom,
        get,
        set,
        clear,

        // Other services/handlers
        digests,
        buttonHandlers,
        handleHelpButton,
        uxButtons,
        // isDuplicate, // Removed
        // validateQuality, // Removed
        // generateQuery, // Removed
        // synthesizeAnswer, // Removed
        DialogManager,
        symptomLogDialog,
        scheduleSymptomFollowup,
        // updateMealNotes, // Removed
        // getMealRowByRef, // Removed
        dndCommands,
        markInteracted,
        isUnderWatch,
        scheduleAll,
        updateUserSchedule,
        scheduleContextualFollowups,

        // Internal functions to be moved or passed as part of the context
        buildSeverityButtons: () => { /* no-op in index.js, implemented in router */ },
        mapSeverityToLabel: () => { /* no-op in index.js, implemented in router */ },
        getTypeEmoji: () => { /* no-op in index.js, implemented in router */ },
        recentMessageIds,

        // New utility for duplicate symptom checking
        findSymptomNear,
    };
}

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
        //setupReminders(); // Moved to handleMessage or dedicated module
    }

    // Initialize the DialogManager with the logging function
    // logFromNLU needs to be passed as a dependency now
    symptomLogDialog.initialize(async (message, result) => {
        const deps = makeDependencies();
        await deps.logFromNLU(message, result, deps);
    });

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
        // const content = (message.content || '').trim(); // Moved to handleMessage
        // const hasPrefix = content.startsWith('!'); // Moved to handleMessage
        // const isSlash = !!message.interaction; // Moved to handleMessage

        // Any message that is not a command is a potential NLU input
        // const isCommand = hasPrefix || isSlash; // Moved to handleMessage

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
            await handleMessage(message, makeDependencies());
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