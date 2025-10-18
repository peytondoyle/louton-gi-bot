require('dotenv').config();

// Auto-setup credentials on Replit
if (process.env.REPL_ID && !require('fs').existsSync('credentials.json')) {
    console.log('🔧 Setting up credentials from environment variables...');
    require('./setup-credentials');
}

const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const cron = require('node-cron');
const moment = require('moment-timezone');
const googleSheets = require('./services/googleSheets');
const analyzer = require('./utils/analyzer');
const NLPHandler = require('./utils/nlpHandler');
const PatternAnalyzer = require('./utils/patternAnalyzer');
const ClarificationHandler = require('./utils/clarificationHandler');
const keepAlive = require('./keep_alive');

// Start keep-alive server for Replit deployment
keepAlive();

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
    '!help': handleHelp,
    '!today': handleToday,
    '!week': handleWeek,
    '!streak': handleStreak,
    '!patterns': handlePatterns,
    '!undo': handleUndo,
    '!insights': handleInsights,
    '!triggers': handleTriggers,
    '!trends': handleTrends,
    '!weekly': handleWeeklySummary,
    '!test': handleTest  // Debug test command
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
    } catch (error) {
        console.error('❌ Failed to connect to Google Sheets:', error.message);
        console.log('The bot will continue but data logging will fail.');
    }

    // Set up scheduled reminders if enabled
    if (ENABLE_REMINDERS) {
        setupReminders();
    }

    console.log('🚀 Bot is fully operational and ready for commands!');
});

// Add debug test handler
async function handleTest(message) {
    console.log('🧪 Test command received!');
    await message.reply('✅ Bot is working! I can receive and respond to your messages.');
}

// Message handler (supports both DMs and channel messages)
client.on('messageCreate', async (message) => {
    // Debug: Log all incoming messages
    console.log('\n=== MESSAGE RECEIVED ===');
    console.log(`📨 From: ${message.author.username} (ID: ${message.author.id})`);
    console.log(`📝 Content: "${message.content}"`);
    console.log(`📍 Location: ${!message.guild ? 'Direct Message' : `Guild: ${message.guild.name}`}`);
    console.log(`🆔 Channel ID: ${message.channel.id}`);
    console.log(`🤖 Is Bot: ${message.author.bot}`);

    // Ignore bot messages
    if (message.author.bot) {
        console.log('⚠️ Ignoring message from bot');
        console.log('=== END MESSAGE ===\n');
        return;
    }

    // Check if message is from DM or allowed channel
    const isDM = !message.guild;
    const isAllowedChannel = CHANNEL_ID && message.channel.id === CHANNEL_ID;

    console.log(`🔍 Checking permissions:`);
    console.log(`   - Is Direct Message: ${isDM}`);
    console.log(`   - CHANNEL_ID configured: ${CHANNEL_ID || '(empty - DM only mode)'}`);
    console.log(`   - Is allowed channel: ${isAllowedChannel}`);

    // Always accept DMs
    if (isDM) {
        console.log('✅ Accepting Direct Message');
    }
    // If CHANNEL_ID is set, accept messages from that channel
    else if (CHANNEL_ID && isAllowedChannel) {
        console.log('✅ Accepting message from configured channel');
    }
    // Otherwise, reject the message
    else {
        if (CHANNEL_ID) {
            console.log(`⚠️ Ignoring - Not a DM and not in allowed channel (${CHANNEL_ID})`);
        } else {
            console.log('⚠️ Ignoring - Bot is in DM-only mode and this is not a DM');
        }
        console.log('=== END MESSAGE ===\n');
        return;
    }

    console.log('✅ Message accepted for processing');

    // Check if message starts with a command
    const content = message.content.toLowerCase();
    const args = content.split(' ');
    const command = args[0];

    console.log(`🔤 Parsing message:`);
    console.log(`   - Raw content: "${message.content}"`);
    console.log(`   - Lowercase: "${content}"`);
    console.log(`   - First word: "${command}"`);

    // Check for explicit commands first
    if (commands[command]) {
        console.log(`✅ Command recognized: ${command}`);
        console.log(`🚀 Executing command handler...`);
        try {
            await commands[command](message, args.slice(1).join(' '));
            console.log(`✅ Command ${command} completed successfully`);
        } catch (error) {
            console.error(`❌ Error in ${command} handler:`, error);
            await message.reply('❌ An error occurred while processing your command. Please try again.');
        }
    }
    // Try natural language processing if not a command
    else if (!command.startsWith('!')) {
        console.log('🧠 Attempting natural language processing...');

        // First check if user has pending clarification
        if (ClarificationHandler.hasPendingClarification(message.author.id)) {
            console.log('📝 Processing clarification response...');
            const clarificationResult = await ClarificationHandler.processClarificationResponse(
                message.author.id,
                message.content
            );

            if (clarificationResult && !clarificationResult.expired) {
                // Process the clarified message
                await handleClarifiedMessage(message, clarificationResult);
                console.log('=== END MESSAGE ===\n');
                return;
            }
        }

        const nlpResult = NLPHandler.analyzeMessage(message.content);

        if (nlpResult) {
            console.log(`✅ NLP understood: ${nlpResult.type} (${nlpResult.confidence} confidence)`);

            // Check if needs clarification
            const needsClarification = ClarificationHandler.needsClarification(message.content, nlpResult);
            if (needsClarification) {
                console.log('❓ Message needs clarification');
                await ClarificationHandler.askClarification(needsClarification.type, message.content, message);
            } else {
                await handleNLPResult(message, nlpResult);
            }
        } else {
            console.log('❓ Could not understand message via NLP');
            // Check if the message is vague and needs clarification
            const needsClarification = ClarificationHandler.needsClarification(message.content, null);
            if (needsClarification) {
                await ClarificationHandler.askClarification(needsClarification.type, message.content, message);
            }
        }
    }
    else {
        console.log(`ℹ️ Not a recognized command: "${command}"`);
        await message.reply(`❓ Command not recognized. Available commands: ${Object.keys(commands).join(', ')}`);
    }

    console.log('=== END MESSAGE ===\n');
});

// Command handler functions
async function handleFood(message, args) {
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
        .setTitle('📋 Louton GI Bot Commands')
        .setDescription('Track your symptoms and food intake with commands OR natural language!')
        .addFields(
            { name: '🍽️ Food & Drink', value: '`!food [item]` - Log food\n`!drink [item]` - Log drinks\n\n**OR just say:** "just had pizza" or "drinking chai"', inline: false },
            { name: '🩺 Symptoms', value: '`!symptom [desc] [severity]` - Log symptoms\n`!reflux [severity]` - Log reflux\n`!bm [description]` - Log BM\n\n**OR just say:** "stomach hurts" or "reflux is bad"', inline: false },
            { name: '📊 Summaries', value: '`!today` - Today\'s entries\n`!week` - Weekly summary\n`!streak` - Check streak\n`!patterns` - Analyze patterns', inline: false },
            { name: '🔧 Utilities', value: '`!undo` - Remove last entry\n`!help` - Show this help\n`!test` - Test bot response', inline: false },
            { name: '✨ Natural Language', value: 'Just tell me how you feel!\n• "feeling good today"\n• "just had chai"\n• "reflux is acting up"\n• "stomach pain mild"', inline: false }
        )
        .setFooter({ text: '💡 Tip: The bot understands natural language! Just tell it what you ate or how you feel.' });

    await message.reply({ embeds: [embed] });
}

async function handleToday(message) {
    const userName = getUserName(message.author.username);
    const todayData = await analyzer.getTodaySummary(userName);

    if (!todayData || todayData.length === 0) {
        return message.reply('No entries found for today. Start tracking with `!food`, `!symptom`, or other commands!');
    }

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`📊 Today's Summary for ${userName}`)
        .setDescription(`Here's what you've tracked today (${moment().tz(TIMEZONE).format('MMM DD, YYYY')}):`)
        .setTimestamp();

    // Group entries by type
    const grouped = {};
    todayData.forEach(entry => {
        if (!grouped[entry.type]) grouped[entry.type] = [];
        grouped[entry.type].push(entry);
    });

    // Add fields for each type
    Object.keys(grouped).forEach(type => {
        const entries = grouped[type];
        const value = entries.map(e => {
            const time = moment(e.timestamp).format('HH:mm');
            const severity = e.severity ? ` (${e.severity})` : '';
            return `• ${time} - ${e.value}${severity}`;
        }).join('\n');

        embed.addFields({
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} (${entries.length})`,
            value: value || 'None',
            inline: false
        });
    });

    await message.reply({ embeds: [embed] });
}

async function handleWeek(message) {
    const userName = getUserName(message.author.username);
    const weekData = await analyzer.getWeeklySummary(userName);

    if (!weekData || weekData.totalEntries === 0) {
        return message.reply('No entries found for this week. Start tracking to see your patterns!');
    }

    const embed = new EmbedBuilder()
        .setColor(0x9932CC)
        .setTitle(`📈 Weekly Summary for ${userName}`)
        .setDescription(`Week of ${moment().tz(TIMEZONE).startOf('week').format('MMM DD')} - ${moment().tz(TIMEZONE).endOf('week').format('MMM DD, YYYY')}`)
        .addFields(
            { name: 'Total Entries', value: `${weekData.totalEntries}`, inline: true },
            { name: 'Most Active Day', value: weekData.mostActiveDay || 'N/A', inline: true },
            { name: 'Symptom Days', value: `${weekData.symptomDays}/7`, inline: true },
            { name: 'Top Foods', value: weekData.topFoods.join(', ') || 'None tracked', inline: false },
            { name: 'Common Symptoms', value: weekData.commonSymptoms.join(', ') || 'None tracked', inline: false },
            { name: 'Average Daily Entries', value: `${weekData.avgDailyEntries.toFixed(1)}`, inline: true }
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
    const userName = getUserName(message.author.username);
    const patterns = await analyzer.analyzePatterns(userName);

    if (!patterns) {
        return message.reply('Need more data to analyze patterns. Keep tracking for at least a week!');
    }

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
    const userName = getUserName(message.author.username);

    try {
        const result = await googleSheets.undoLastEntry(userName);

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
    const userName = getUserName(message.author.username);

    try {
        const entries = await googleSheets.getAllEntries(userName);

        if (entries.length < 10) {
            return message.reply('📊 You need at least 10 entries for meaningful insights. Keep tracking!');
        }

        const recommendations = await PatternAnalyzer.getRecommendations(entries, userName);
        const trends = await PatternAnalyzer.calculateTrends(entries, userName);

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('🔮 Your Personalized Insights')
            .setDescription(trends.message)
            .setTimestamp();

        if (recommendations.length > 0) {
            recommendations.forEach(rec => {
                const emoji = rec.type === 'avoid' ? '⚠️' :
                             rec.type === 'positive' ? '🌟' : 'ℹ️';
                embed.addFields({
                    name: `${emoji} ${rec.priority.toUpperCase()} Priority`,
                    value: rec.message,
                    inline: false
                });
            });
        }

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error generating insights:', error);
        await message.reply('❌ Failed to generate insights. Please try again.');
    }
}

// Handle triggers command - show trigger correlations
async function handleTriggers(message) {
    const userName = getUserName(message.author.username);

    try {
        const entries = await googleSheets.getAllEntries(userName);

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
    const userName = getUserName(message.author.username);

    try {
        const entries = await googleSheets.getAllEntries(userName);

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
    const userName = getUserName(message.author.username);

    try {
        const entries = await googleSheets.getAllEntries(userName);

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