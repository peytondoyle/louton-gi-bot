/**
 * DND, Timezone, and Snooze Commands
 * User control over reminder timing and suppression
 */

const moment = require('moment-timezone');
const { isValid, find } = require('moment-timezone');
const time = require('../utils/time');
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

    const tz = (args || '').trim();

    if (!tz) {
        return message.reply(`Your current timezone is set to \`${currentTz}\`.`);
    }

    if (!isValid(tz)) {
        const guess = find(tz);
        if (guess && guess.length > 0) {
            return message.reply(`Did you mean \`${guess[0]}\`? Please use a valid IANA timezone name.`);
        }
        return message.reply('Invalid timezone. Please use a valid IANA timezone name (e.g., `America/New_York`).');
    }

    await message.reply(`✅ Timezone set to **${tz}**.`);
    profile.prefs.TZ = tz;
    await updateUserProfile(userId, profile, googleSheets);

    const currentTime = time.now(tz).format('HH:mm');
    await message.channel.send(`(Your local time is now approx. ${currentTime})`);

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
    const now = time.now(tz);

    if (!args || args.trim() === '') {
        return message.reply('Usage: `!snooze 1h` or `!snooze 3h` or `!snooze 1d`');
    }

    const duration = args.toLowerCase().trim();
    let snoozeUntil;

    if (duration.endsWith('h')) {
        const value = parseInt(duration, 10);
        snoozeUntil = time.now(tz).add(value, 'hours');
    } else if (duration.endsWith('d')) {
        const value = parseInt(duration, 10);
        snoozeUntil = time.now(tz).add(value, 'days');
    } else {
        return message.reply('Invalid duration. Use `1h`, `3h`, `1d`, etc.');
    }

    await message.reply(`Okay, snoozing reminders until **${snoozeUntil.tz(tz).format('ddd, h:mm a')}**.`);
    profile.prefs.SnoozeUntil = snoozeUntil.toISOString();
    await updateUserProfile(userId, profile, googleSheets);

    console.log(`[SNOOZE] User ${userId} snoozed until ${snoozeUntil.toISOString()}`);
}

module.exports = { handleDND, handleTimezone, handleSnooze };
