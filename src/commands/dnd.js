/**
 * DND, Timezone, and Snooze Commands
 * User control over reminder timing and suppression
 */

const moment = require('moment-timezone');
const { computeNextSend } = require('../reminders/adaptive');

/**
 * Handle !dnd command
 * @param {Object} message - Discord message
 * @param {string} args - Command arguments
 * @param {Object} deps - { getUserProfile, updateUserProfile, googleSheets }
 */
async function handleDND(message, args, deps) {
    const { getUserProfile, updateUserProfile, googleSheets } = deps;
    const userId = message.author.id;
    const profile = await getUserProfile(userId, googleSheets);

    if (!args) {
        return message.reply('Usage: `!dnd 22:00-07:00` or `!dnd off`');
    }

    const trimmed = args.trim().toLowerCase();

    // Turn off DND
    if (trimmed === 'off') {
        await message.reply('🌙 DND window disabled.');
        profile.prefs.DNDWindow = '';
        await updateUserProfile(userId, profile, googleSheets);
        return;
    }

    // Validate HH:mm-HH:mm format
    const dndPattern = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;
    const match = trimmed.match(dndPattern);

    if (!match) {
        return message.reply('❌ Invalid format. Use `!dnd 22:00-07:00` or `!dnd off`');
    }

    const [_, startH, startM, endH, endM] = match.map(n => n ? parseInt(n, 10) : 0);

    // Validate hours and minutes
    if (startH < 0 || startH > 23 || endH < 0 || endH > 23 ||
        startM < 0 || startM > 59 || endM < 0 || endM > 59) {
        return message.reply('❌ Invalid time. Hours must be 0-23, minutes 0-59.');
    }

    // Format and save
    const formatted = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}-${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    await message.reply(`🌙 DND window set to **${formatted}**.`);
    profile.prefs.DNDWindow = formatted;
    await updateUserProfile(userId, profile, googleSheets);

    const overnight = startH > endH || (startH === endH && startM > endM);
    const windowDesc = overnight ? '(overnight window)' : '';

    await message.reply(`✅ Do Not Disturb set to **${formatted}** ${windowDesc}\n\nAll proactive messages will be suppressed during this window.`);

    console.log(`[DND] User ${userId} set DND window: ${formatted}`);
}

/**
 * Handle !timezone command
 * @param {Object} message - Discord message
 * @param {string} args - Command arguments
 * @param {Object} deps - { getUserProfile, updateUserProfile, googleSheets }
 */
async function handleTimezone(message, args, deps) {
    const { getUserProfile, updateUserProfile, googleSheets } = deps;
    const userId = message.author.id;
    const profile = await getUserProfile(userId, googleSheets);
    const currentTz = profile.prefs.TZ || 'America/Los_Angeles';

    if (!args) {
        const prefs = await getUserPrefs(userId, googleSheets);
        return message.reply(`Your current timezone is **${prefs.TZ}**.\n\nTo change: \`!timezone America/New_York\``);
    }

    const tz = args.trim();

    // Validate timezone
    if (!moment.tz.zone(tz)) {
        return message.reply(`❌ Invalid timezone "${tz}".\n\nExamples: America/New_York, America/Los_Angeles, Europe/London`);
    }

    await message.reply(`✅ Timezone set to **${tz}**.`);
    profile.prefs.TZ = tz;
    await updateUserProfile(userId, profile, googleSheets);

    const currentTime = moment().tz(tz).format('HH:mm');
    await message.reply(`✅ Timezone set to **${tz}**\n\nYour local time is now: ${currentTime}`);

    console.log(`[TZ] User ${userId} set timezone: ${tz}`);
}

/**
 * Handle !snooze command
 * @param {Object} message - Discord message
 * @param {string} args - Command arguments
 * @param {Object} deps - { getUserProfile, updateUserProfile, googleSheets }
 */
async function handleSnooze(message, args, deps) {
    const { getUserProfile, updateUserProfile, googleSheets } = deps;
    const userId = message.author.id;
    const profile = await getUserProfile(userId, googleSheets);
    const tz = profile.prefs.TZ || 'America/Los_Angeles';
    const now = moment().tz(tz);

    if (!args) {
        return message.reply('Usage: `!snooze 1h` or `!snooze 3h` or `!snooze 1d`');
    }

    const trimmed = args.trim().toLowerCase();

    // Parse duration
    const durationPattern = /^(\d+)(h|d)$/;
    const match = trimmed.match(durationPattern);

    if (!match) {
        return message.reply('❌ Invalid format. Use `!snooze 1h`, `!snooze 3h`, or `!snooze 1d`');
    }

    const [_, amount, unit] = match;
    const value = parseInt(amount, 10);

    let snoozeUntil;
    if (unit === 'h') {
        snoozeUntil = moment().tz(tz).add(value, 'hours');
    } else if (unit === 'd') {
        snoozeUntil = moment().tz(tz).add(value, 'days');
    } else {
        return message.reply('❌ Unit must be h (hours) or d (days)');
    }

    await message.reply(`Okay, snoozing reminders until **${snoozeUntil.tz(tz).format('ddd, h:mm a')}**.`);
    profile.prefs.SnoozeUntil = snoozeUntil.toISOString();
    await updateUserProfile(userId, profile, googleSheets);

    console.log(`[SNOOZE] User ${userId} snoozed until ${snoozeUntil.toISOString()}`);
}

module.exports = { handleDND, handleTimezone, handleSnooze };
