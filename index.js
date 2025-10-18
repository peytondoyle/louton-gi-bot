require('dotenv').config();

// Auto-setup credentials on Replit
if (process.env.REPL_ID && !require('fs').existsSync('credentials.json')) {
    console.log('🔧 Setting up credentials from environment variables...');
    require('./setup-credentials');
}

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const moment = require('moment-timezone');
const googleSheets = require('./services/googleSheets');
const analyzer = require('./utils/analyzer');
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
});

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
    '!patterns': handlePatterns
};

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

// Message handler (supports both DMs and channel messages)
client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if message is from DM or allowed channel
    const isDM = !message.guild;
    const isAllowedChannel = CHANNEL_ID && message.channel.id === CHANNEL_ID;

    // Accept DMs and messages from specified channel (if set)
    if (!isDM && !isAllowedChannel && CHANNEL_ID) return;

    // Check if message starts with a command
    const content = message.content.toLowerCase();
    const args = content.split(' ');
    const command = args[0];

    if (commands[command]) {
        try {
            await commands[command](message, args.slice(1).join(' '));
        } catch (error) {
            console.error(`Error handling command ${command}:`, error);
            await message.reply('❌ An error occurred while processing your command. Please try again.');
        }
    }
});

// Command handler functions
async function handleFood(message, args) {
    if (!args) {
        return message.reply('Please specify what you ate. Example: `!food chicken salad`');
    }

    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    // Check for trigger foods
    const foodLower = args.toLowerCase();
    let reaction = '✅';
    let response = RESPONSES.general[Math.floor(Math.random() * RESPONSES.general.length)];

    if (TRIGGER_ITEMS.positive.some(item => foodLower.includes(item))) {
        reaction = '💪';
        response = RESPONSES.positive[Math.floor(Math.random() * RESPONSES.positive.length)];
    } else if (TRIGGER_ITEMS.warning.some(item => foodLower.includes(item))) {
        reaction = '⚠️';
        response = RESPONSES.warning[Math.floor(Math.random() * RESPONSES.warning.length)];
    } else if (TRIGGER_ITEMS.problematic.some(item => foodLower.includes(item))) {
        reaction = '🔍';
        response = RESPONSES.warning[Math.floor(Math.random() * RESPONSES.warning.length)];
    }

    // Log to Google Sheets
    await googleSheets.appendRow({
        timestamp,
        user: userName,
        type: 'food',
        value: args,
        severity: null,
        notes: null,
        source: source
    });

    // React and respond
    await message.react(reaction);
    await message.reply(`${response}\n📝 Logged: **${args}**`);
}

async function handleDrink(message, args) {
    if (!args) {
        return message.reply('Please specify what you drank. Example: `!drink chai with oat milk`');
    }

    const userName = getUserName(message.author.username);
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const source = !message.guild ? 'DM' : 'Channel';

    // Check for trigger drinks
    const drinkLower = args.toLowerCase();
    let reaction = '✅';
    let response = RESPONSES.general[Math.floor(Math.random() * RESPONSES.general.length)];

    if (drinkLower.includes('chai') || drinkLower.includes('water') || drinkLower.includes('tea')) {
        reaction = '💪';
        response = RESPONSES.positive[Math.floor(Math.random() * RESPONSES.positive.length)];
    } else if (drinkLower.includes('refresher') || drinkLower.includes('coffee') || drinkLower.includes('alcohol')) {
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
        notes: null,
        source: source
    });

    // React and respond
    await message.react(reaction);
    await message.reply(`${response}\n🥤 Logged: **${args}**`);
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
        .setDescription('Track your symptoms and food intake with these commands:')
        .addFields(
            { name: '!food [description]', value: 'Log what you ate\n`!food chicken salad with ranch`', inline: false },
            { name: '!drink [description]', value: 'Log what you drank\n`!drink chai with oat milk`', inline: false },
            { name: '!symptom [description] [severity]', value: 'Log symptoms\n`!symptom stomach pain moderate`', inline: false },
            { name: '!bm [description]', value: 'Log bowel movement\n`!bm normal` or `!bm bristol 4`', inline: false },
            { name: '!reflux [severity]', value: 'Log reflux episode\n`!reflux mild`', inline: false },
            { name: '!today', value: 'See your entries from today', inline: true },
            { name: '!week', value: 'Get weekly summary', inline: true },
            { name: '!streak', value: 'Check your streak', inline: true },
            { name: '!patterns', value: 'Analyze patterns in your data', inline: true }
        )
        .setFooter({ text: 'Keep tracking consistently for better insights!' });

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
client.login(DISCORD_TOKEN).catch(error => {
    console.error('Failed to login to Discord:', error);
    console.log('Please check your DISCORD_TOKEN in the .env file');
    process.exit(1);
});