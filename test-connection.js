const { Client, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();

console.log('🔍 Testing Discord connection...');
console.log('Token length:', process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : 'NOT SET');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

client.on('ready', () => {
    console.log('✅ Bot connected successfully!');
    console.log('✅ Logged in as:', client.user.tag);
    process.exit(0);
});

client.on('error', (error) => {
    console.log('❌ Discord error:', error.message);
    process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log('❌ Connection timeout - Discord API not responding');
    process.exit(1);
}, 10000);

console.log('🔄 Attempting to connect...');
client.login(process.env.DISCORD_TOKEN);
