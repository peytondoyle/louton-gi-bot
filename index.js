require('dotenv').config();

// Auto-setup credentials on Replit
if (process.env.REPL_ID && !require('fs').existsSync('credentials.json')) {
    console.log('🔧 Setting up credentials from environment variables...');
    require('./setup-credentials');
}

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const cron = require('node-cron');
const time = require('./src/utils/time');
const googleSheets = require('./services/googleSheets');
const keepAlive = require('./keep_alive');
const { getUserProfile, updateUserProfile, ensureProfileSheet } = require('./services/userProfile');

const { start: startJobRunner, processOverdueJobs } = require('./src/jobs/runner');

const { handleChartButton } = require('./src/commands/chartsMenu');

const digests = require('./src/scheduler/digests');
const buttonHandlers = require('./src/handlers/buttonHandlers');
const { handleHelpButton } = require('./src/handlers/buttonHandlers');
const uxButtons = require('./src/handlers/uxButtons');
const DialogManager = require('./src/dialogs/DialogManager');
const symptomLogDialog = require('./src/dialogs/symptomLogDialog');
const ProactiveScheduler = require('./src/scheduler/proactiveScheduler');

const { Message } = require('discord.js');
const { sendCleanReply } = require('./src/utils/messaging');

const { scheduleAll } = require('./src/scheduler/reminders');
const { markInteracted, isUnderWatch } = require('./src/reminders/responseWatcher');

const handleMessage = require('./src/router/handleMessage');

const { assertNotLoaded } = require('./src/boot/deprecationCheck');
assertNotLoaded('pendingClarifications', require('./src/handlers/uxButtons.js'));
assertNotLoaded('pendingClarifications', require('./src/handlers/buttonHandlers.js'));

const { startHeartbeat } = require('./src/health/heartbeat');
const { recordNLUParse } = require('./src/commands/nluStats');

startHeartbeat();

Message.prototype.reply = function (content, options) {
  return sendCleanReply(this, content, options);
};
console.log('✅ Patched Message.prototype.reply() → clean sends (no gray bar)');

const recentMessageIds = new Set();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message], // Required for DMs in Discord.js v14
});

console.log('🔧 Initializing Discord client with:');
console.log('   Intents: Guilds, GuildMessages, MessageContent, DirectMessages');
console.log('   Partials: Channel, Message (required for DM support)');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const USER1_NAME = process.env.USER1_NAME || 'User1';
const USER2_NAME = process.env.USER2_NAME || 'User2';
const TIMEZONE = process.env.TIMEZONE || 'America/Los_Angeles';
const ENABLE_REMINDERS = process.env.ENABLE_REMINDERS === 'true';

const PEYTON_ID = process.env.PEYTON_ID || "552563833814646806";
const LOUIS_ID = process.env.LOUIS_ID || "552563833814646807";

const userGoals = new Map();

const pendingFollowups = new Map();

const TRIGGER_ITEMS = {
    positive: ['chai', 'water', 'herbal tea', 'ginger tea', 'chamomile'],
    warning: ['refresher', 'coffee', 'alcohol', 'soda', 'energy drink'],
    problematic: ['spicy', 'dairy', 'gluten', 'fried', 'citrus', 'tomato']
};

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

// Helper to encapsulate all dependencies for message handling
const { keyFrom, get, set, clear } = require('./services/pending');

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

        // NLU related - explicitly require here
        understand: require('./src/nlu/understand-v2').understand,
        formatParseResult: require('./src/nlu/understand-v2').formatParseResult,
        postprocess: require('./src/nlu/postprocess').postprocess,
        disambiguate: require('./src/nlu/disambiguate').disambiguate,
        recordNLUMetrics: require('./src/nlu/metrics-v2').record,
        recordNLUParse: require('./src/commands/nluStats').recordNLUParse,
        extractMetadata: require('./src/nlu/rules').extractMetadata,
        shouldEnableCalorieFeatures: require('./src/auth/scope').shouldEnableCalorieFeatures,
        parseComplexIntent: require('./src/nlu/rulesIntent').parseComplexIntent,

        // Calorie related - explicitly require here
        enqueue: require('./src/jobs/jobsStore').enqueue,
        estimate: require('./src/calories/estimate').estimate,
        getDailyKcalTarget: require('./src/calories/estimate').getDailyKcalTarget,
        calculateDailyTotals: require('./src/calories/estimate').calculateDailyTotals,
        formatDailyProgress: require('./src/calories/estimate').formatDailyProgress,
        deliverNotification: require('./src/notify/channelOrDM').deliverNotification,
        testDMHandshake: require('./src/notify/channelOrDM').testDMHandshake,
        estimateCaloriesForItemAndSides: require('./src/nutrition/estimateCalories').estimateCaloriesForItemAndSides,
        getLogSheetNameForUser: googleSheets.getLogSheetNameForUser.bind(googleSheets),

        // UX/UI related - explicitly require here
        EMOJI: require('./src/constants/ux').EMOJI,
        PHRASES: require('./src/constants/ux').PHRASES,
        getRandomPhrase: require('./src/constants/ux').getRandomPhrase,
        BUTTON_IDS: require('./src/constants/ux').BUTTON_IDS,
        buttonsSeverity: require('./src/ui/components').buttonsSeverity,
        buttonsMealTime: require('./src/ui/components').buttonsMealTime,
        buttonsBristol: require('./src/ui/components').buttonsBristol,
        buttonsSymptomType: require('./src/ui/components').buttonsSymptomType,
        buttonsIntentClarification: require('./src/ui/components').buttonsIntentClarification,
        buildConversationalHelp: require('./src/ui/components').buildConversationalHelp,
        buildPostLogChips: require('./src/ui/chips').buildPostLogChips,

        logFromNLU: require('./src/router/handleMessage').logFromNLU, // Expose logFromNLU for internal use / testing

        // Pending context
        keyFrom,
        get,
        set,
        clear,

        // Other services/handlers - explicitly require here
        digests,
        buttonHandlers: require('./src/handlers/buttonHandlers'),
        handleHelpButton: require('./src/handlers/buttonHandlers').handleHelpButton,
        uxButtons: require('./src/handlers/uxButtons'),
        isDuplicate: require('./src/utils/dedupe').isDuplicate,
        validateQuality: require('./src/utils/qualityCheck').validateQuality,
        generateQuery: require('./src/insights/AIAnalyst').generateQuery,
        synthesizeAnswer: require('./src/insights/AIAnalyst').synthesizeAnswer,
        DialogManager: require('./src/dialogs/DialogManager'),
        symptomLogDialog: require('./src/dialogs/symptomLogDialog'),
        scheduleSymptomFollowup: require('./src/scheduler/reminders').scheduleSymptomFollowup,
        updateMealNotes: require('./src/utils/mealNotes').updateMealNotes,
        getMealRowByRef: require('./src/utils/mealNotes').getMealRowByRef,
        dndCommands: require('./src/commands/dnd'),
        markInteracted: require('./src/reminders/responseWatcher').markInteracted,
        isUnderWatch: require('./src/reminders/responseWatcher').isUnderWatch,
        scheduleAll: require('./src/scheduler/reminders').scheduleAll,
        updateUserSchedule: require('./src/scheduler/reminders').updateUserSchedule,
        scheduleContextualFollowups: require('./src/handlers/contextualFollowups').scheduleContextualFollowups,

        // Internal functions to be moved or passed as part of the context
        buildSeverityButtons: () => { /* no-op in index.js, implemented in router */ },
        mapSeverityToLabel: () => { /* no-op in index.js, implemented in router */ },
        getTypeEmoji: () => { /* no-op in index.js, implemented in router */ },
        recentMessageIds,

        findSymptomNear: require('./src/sheets/findSymptomNear').findSymptomNear,
    };
}

module.exports = {
    makeDependencies
};