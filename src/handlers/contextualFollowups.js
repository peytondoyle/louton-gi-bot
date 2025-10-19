/**
 * Contextual Follow-ups
 * Event-driven follow-ups based on recent activity
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { shouldSuppressNow } = require('../reminders/adaptive');
const { parseNotes } = require('../utils/notes');
const { setCooldown, isOnCooldown } = require('../../services/prefs');
const moment = require('moment-timezone');

// In-memory tracking of pending follow-ups
const pendingFollowups = new Map();

/**
 * Schedule contextual follow-ups based on logged activity
 * @param {Object} options - { googleSheets, message, parseResult, tz, userId, userPrefs }
 */
async function scheduleContextualFollowups({ googleSheets, message, parseResult, tz, userId, userPrefs }) {
    const { intent, slots } = parseResult;

    // Severe symptom → hydration check
    if ((intent === 'symptom' || intent === 'reflux') && slots.severity && parseInt(slots.severity, 10) >= 7) {
        await scheduleHydrationCheck({ googleSheets, message, tz, userId, userPrefs });
    }

    // Any symptom/reflux → general follow-up
    if (intent === 'symptom' || intent === 'reflux') {
        await scheduleSymptomFollowup({ googleSheets, message, tz, userId, userPrefs });
    }

    // Caffeine after 14:00 → safety hint
    if (intent === 'food' || intent === 'drink') {
        await scheduleCaffeineHint({ googleSheets, message, slots, tz, userId, userPrefs });
    }
}

/**
 * Schedule hydration check after severe symptom
 */
async function scheduleHydrationCheck({ googleSheets, message, tz, userId, userPrefs }) {
    const nowISO = moment().tz(tz).toISOString();

    // Check cooldown (6h)
    if (await isOnCooldown(userId, 'hydrate_hint', nowISO, googleSheets)) {
        console.log(`[FOLLOWUP] Hydration hint on cooldown for user ${userId}`);
        return;
    }

    // Random jitter: 30-45 min
    const jitterMs = (30 + Math.random() * 15) * 60 * 1000;

    setTimeout(async () => {
        // Re-check suppression at send time
        const sendTime = moment().tz(tz);
        if (shouldSuppressNow({ userPrefs, nowZoned: sendTime })) {
            console.log(`[FOLLOWUP] Hydration hint suppressed by DND/snooze for user ${userId}`);
            return;
        }

        try {
            const embed = new EmbedBuilder()
                .setColor(0x4A90E2)
                .setDescription('💧 Sips help when reflux flares. Want a quick water reminder next hour?');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('followup:hydrate:now')
                    .setLabel('Hydrate now')
                    .setEmoji('💧')
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId('followup:hydrate:snooze')
                    .setLabel('Snooze 1h')
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId('followup:hydrate:dismiss')
                    .setLabel('No thanks')
                    .setStyle(ButtonStyle.Secondary)
            );

            await message.author.send({ embeds: [embed], components: [row] });

            // Set 6h cooldown
            const cooldownUntil = moment().tz(tz).add(6, 'hours').toISOString();
            await setCooldown(userId, 'hydrate_hint', cooldownUntil, googleSheets);

            console.log(`[FOLLOWUP] Sent hydration hint to user ${userId}`);
        } catch (error) {
            console.error(`[FOLLOWUP] Failed to send hydration hint:`, error);
        }
    }, jitterMs);
}

/**
 * Schedule general symptom follow-up
 */
async function scheduleSymptomFollowup({ googleSheets, message, tz, userId, userPrefs }) {
    const nowISO = moment().tz(tz).toISOString();

    // Check cooldown (6h)
    if (await isOnCooldown(userId, 'context_followup', nowISO, googleSheets)) {
        console.log(`[FOLLOWUP] Context follow-up on cooldown for user ${userId}`);
        return;
    }

    // Cancel any existing follow-up for this user
    if (pendingFollowups.has(userId)) {
        clearTimeout(pendingFollowups.get(userId));
    }

    // Random jitter: 90-150 min
    const jitterMs = (90 + Math.random() * 60) * 60 * 1000;

    const timeoutId = setTimeout(async () => {
        // Re-check suppression
        const sendTime = moment().tz(tz);
        if (shouldSuppressNow({ userPrefs, nowZoned: sendTime })) {
            console.log(`[FOLLOWUP] Context follow-up suppressed by DND/snooze for user ${userId}`);
            return;
        }

        try {
            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setDescription('How are you feeling now?');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('followup:feeling:better')
                    .setLabel('Feeling better')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId('followup:feeling:discomfort')
                    .setLabel('Still discomfort')
                    .setEmoji('😕')
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId('followup:feeling:meal_link')
                    .setLabel('Link to last meal')
                    .setEmoji('🍽')
                    .setStyle(ButtonStyle.Secondary)
            );

            await message.author.send({ embeds: [embed], components: [row] });

            // Set 6h cooldown
            const cooldownUntil = moment().tz(tz).add(6, 'hours').toISOString();
            await setCooldown(userId, 'context_followup', cooldownUntil, googleSheets);

            console.log(`[FOLLOWUP] Sent context follow-up to user ${userId}`);
        } catch (error) {
            console.error(`[FOLLOWUP] Failed to send context follow-up:`, error);
        }

        pendingFollowups.delete(userId);
    }, jitterMs);

    pendingFollowups.set(userId, timeoutId);
}

/**
 * Schedule caffeine safety hint
 */
async function scheduleCaffeineHint({ googleSheets, message, slots, tz, userId, userPrefs }) {
    const nowZoned = moment().tz(tz);
    const hour = nowZoned.hour();

    // Only trigger after 14:00
    if (hour < 14) return;

    // Check if item contains caffeine
    const notes = parseNotes(slots.notes || '');
    const details = (slots.item || '').toLowerCase();

    const hasCaffeineToken = notes.has('caffeine');
    const hasDecafToken = notes.has('decaf');
    const caffeinatedItems = ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'chai', 'tea', 'matcha', 'energy drink', 'refresher'];
    const hasCaffeinatedItem = caffeinatedItems.some(item => details.includes(item));

    if (!hasCaffeineToken && (!hasCaffeinatedItem || hasDecafToken)) {
        return; // Not caffeine
    }

    const nowISO = nowZoned.toISOString();

    // Check cooldown (24h)
    if (await isOnCooldown(userId, 'caffeine_hint', nowISO, googleSheets)) {
        console.log(`[CAFFEINE] Caffeine hint on cooldown for user ${userId}`);
        return;
    }

    // Random jitter: 3-4h
    const jitterMs = (3 + Math.random()) * 60 * 60 * 1000;

    setTimeout(async () => {
        // Re-check suppression
        const sendTime = moment().tz(tz);
        if (shouldSuppressNow({ userPrefs, nowZoned: sendTime })) {
            console.log(`[CAFFEINE] Caffeine hint suppressed by DND/snooze for user ${userId}`);
            return;
        }

        try {
            const embed = new EmbedBuilder()
                .setColor(0xE67E22)
                .setTitle('☕ Caffeine & Sleep Pattern')
                .setDescription('Noticing afternoon caffeine sometimes overlaps with reflux/sleep. Want to experiment with earlier cutoffs?');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('followup:caffeine:set_cutoff')
                    .setLabel('Set 2pm cutoff for 7 days')
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId('followup:caffeine:symptoms_only')
                    .setLabel('Remind me only if symptoms happen')
                    .setStyle(ButtonStyle.Secondary)
            );

            await message.author.send({ embeds: [embed], components: [row] });

            // Set 24h cooldown
            const cooldownUntil = moment().tz(tz).add(24, 'hours').toISOString();
            await setCooldown(userId, 'caffeine_hint', cooldownUntil, googleSheets);

            console.log(`[CAFFEINE] Sent caffeine hint to user ${userId}`);
        } catch (error) {
            console.error(`[CAFFEINE] Failed to send caffeine hint:`, error);
        }
    }, jitterMs);
}

module.exports = {
    scheduleContextualFollowups
};
