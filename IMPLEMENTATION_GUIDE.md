# UX Polish Implementation Guide

This guide explains how to integrate the new UX polish modules into `index.js`.

## Files Created

1. **src/constants/ux.js** - Emojis, colors, button IDs, labels, phrases
2. **src/ui/formatters.js** - Progress bars, trend chips, section formatters
3. **src/ui/components.js** - Discord embeds and button builders
4. **src/utils/contextMemory.js** - In-memory user context tracking
5. **src/scheduler/digests.js** - Daily AM check-in and PM recap
6. **src/handlers/buttonHandlers.js** - Button interaction routing

## Required Changes to index.js

### 1. Add Imports (top of file, after existing imports)

```javascript
// UX Polish Modules
const { EMOJI, getRandomPhrase, PHRASES } = require('./src/constants/ux');
const { buildEmbed, successEmbed, errorEmbed } = require('./src/ui/components');
const { section, divider, kv, progressBar, trendChip, formatTrigger, pluralize } = require('./src/ui/formatters');
const contextMemory = require('./src/utils/contextMemory');
const digests = require('./src/scheduler/digests');
const buttonHandlers = require('./src/handlers/buttonHandlers');
```

### 2. Register Digests on Bot Ready

In the `client.on('ready', ...)` handler, add:

```javascript
client.on('ready', async () => {
    // ... existing ready code ...

    // Register daily digests
    digests.registerDigests(client, googleSheets);
    console.log('✅ Daily digests registered');
});
```

### 3. Add Button Interaction Handler

Add this new event listener after the `ready` handler:

```javascript
// Handle button interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    await buttonHandlers.handleButtonInteraction(interaction, googleSheets, digests);
});
```

### 4. Update Natural Language Success Responses

Find where entries are logged via NLP (in the message handler), and replace plain text responses with:

```javascript
// OLD:
await message.reply(`✅ Logged ${type}!`);

// NEW:
const successMsg = getRandomPhrase(PHRASES.success);
await message.reply(`${EMOJI.success} Logged **${value}**.\n\n${successMsg}`);

// Also add to context memory:
contextMemory.push(message.author.id, {
    type: type,
    details: value,
    severity: severity,
    timestamp: Date.now()
});

// Auto-enable digests for this user
digests.autoEnableForUser(message.author.id);
```

### 5. Update Error Handling

Wrap Google Sheets calls and check for success:

```javascript
// OLD:
await googleSheets.appendRow(entry);

// NEW:
const result = await googleSheets.appendRow(entry);
if (!result.success) {
    await message.reply(`${EMOJI.error} ${result.error.userMessage}`);
    return;
}
```

### 6. Update !weekly Command

Replace the plain text response with a styled embed:

```javascript
// In the !weekly command handler:
const summary = await patternAnalyzer.getWeeklySummary(entries, userName);

const overviewSection = section(
    '📊 Overview',
    `${kv('Week of', summary.weekStart)}\n` +
    `${kv('Days Tracked', summary.daysTracked)}\n` +
    `${kv('Symptom-Free Days', summary.symptomFreeDays)}\n` +
    `${kv('Total Symptoms', summary.totalSymptoms)}`
);

const triggersSection = summary.worstTriggers.length > 0 ?
    section(
        '⚠️ Top Triggers',
        summary.worstTriggers.map(t => formatTrigger(t.name, t.count, t.type)).join('\n')
    ) : '';

const trendsSection = section(
    '📈 Trends',
    `${trendChip(summary.trends.improvement)}\n${summary.trends.message}`
);

const description = [
    overviewSection,
    divider(),
    triggersSection,
    divider(),
    trendsSection
].filter(Boolean).join('\n\n');

const embed = buildEmbed({
    title: `${EMOJI.summary} Weekly Summary`,
    description: description,
    color: require('./src/constants/ux').COLORS.info,
    footer: `Week of ${summary.weekStart}`
});

await message.reply({ embeds: [embed] });
```

### 7. Update !insights Command

```javascript
// In the !insights command handler:
const patterns = await patternAnalyzer.findRepeatedPatterns(entries, userName);
const timePatterns = await patternAnalyzer.findTimePatterns(entries, userName);

const patternsSection = patterns.length > 0 ?
    section(
        '🔍 Repeated Patterns',
        patterns.slice(0, 5).map(p =>
            `${formatTrigger(p.trigger, p.count, p.type)}\n  → ${pluralize(p.symptoms.length, 'symptom')}`
        ).join('\n')
    ) : section('🔍 Repeated Patterns', 'Not enough data yet. Keep tracking!');

const timeSection = timePatterns.hasPattern ?
    section(
        '⏰ Time Patterns',
        timePatterns.message
    ) : '';

const description = [
    patternsSection,
    timeSection && divider(),
    timeSection
].filter(Boolean).join('\n\n');

const embed = buildEmbed({
    title: `${EMOJI.insight} Insights`,
    description: description,
    color: require('./src/constants/ux').COLORS.insight
});

await message.reply({ embeds: [embed] });
```

### 8. Update !trends Command

```javascript
// In the !trends command handler:
const trends = await patternAnalyzer.calculateTrends(entries, userName, 7);

const description = section(
    '📈 7-Day Trend',
    `${trendChip(trends.improvement)}\n\n` +
    `${trends.message}\n\n` +
    `${kv('Avg per day', trends.avgPerDay)}\n` +
    `${kv('Total symptoms', trends.totalSymptoms)}`
);

const embed = buildEmbed({
    title: `${EMOJI.summary} Symptom Trends`,
    description: description,
    color: trends.trend === 'improving' ?
        require('./src/constants/ux').COLORS.improvement :
        require('./src/constants/ux').COLORS.info
});

await message.reply({ embeds: [embed] });
```

### 9. Add Smart Trigger Warnings

After logging a known trigger food/drink, check for recent symptoms:

```javascript
// After successful append of food/drink entry:
if (category === 'Trigger Food' || category === 'Trigger Drink') {
    const recentEntries = contextMemory.getRecent(message.author.id, 10);
    const recentSymptoms = recentEntries.filter(e =>
        (e.type === 'symptom' || e.type === 'reflux') &&
        e.severity &&
        (e.severity === 'moderate' || e.severity === 'severe')
    );

    if (recentSymptoms.length > 0 && contextMemory.shouldWarn(message.author.id, value)) {
        const warningMsg = formatPhrase(
            getRandomPhrase(PHRASES.caution),
            { trigger: value, count: recentSymptoms.length }
        );

        await message.reply({
            content: warningMsg + '\n\nWant a safer swap?',
            components: buttonDismiss()
        });

        contextMemory.recordWarning(message.author.id, value);
    }
}
```

### 10. Handle Dismiss Button

The dismiss button is already handled in buttonHandlers.js, which deletes the warning message.

## Testing Checklist

After integrating these changes:

- [ ] Morning check-in sends at 8am and logs baseline
- [ ] Button flows work for symptom clarification (type → severity)
- [ ] Button flows work for meal time selection
- [ ] Button flows work for Bristol scale selection
- [ ] !weekly shows styled embed with sections and dividers
- [ ] !insights shows patterns with proper formatting
- [ ] !trends shows progress bar and trend chip
- [ ] Trigger warnings appear after logging known triggers
- [ ] Undo button works
- [ ] Error messages are friendly and helpful
- [ ] Success messages use variety of phrases
- [ ] Context memory tracks rough patches
- [ ] PM recap shows daily summary (if enabled)

## Optional: Enable PM Recap

The PM recap is optional. It's already scheduled in digests.js but only runs if googleSheets is passed to registerDigests(). To enable:

```javascript
// In client.on('ready'):
digests.registerDigests(client, googleSheets); // Already has googleSheets, so PM recap is enabled
```

To disable PM recap:

```javascript
digests.registerDigests(client, null); // Pass null instead of googleSheets
```

## Verification Examples

### Example 1: Morning Check-In Flow
1. At 8am, user receives DM with 3 buttons
2. User clicks "😊 Feeling Good"
3. Bot logs baseline symptom with severity=mild
4. User sees: "✅ Great to hear! Keep up the healthy habits 💚"

### Example 2: Vague Symptom Flow
1. User: "not feeling great"
2. Bot: Shows 5 symptom type buttons
3. User: Clicks "Reflux/Heartburn"
4. Bot: Shows 10 severity buttons (1-10)
5. User: Clicks "7"
6. Bot: Logs reflux with severity=severe
7. Bot: "✅ Logged **Reflux/Heartburn** (severe). You're building great data habits 💪"

### Example 3: !weekly Command
User types: !weekly

Bot responds with embed:

```
📊 Weekly Summary

**📊 Overview**
**Week of:** Oct 14
**Days Tracked:** 7
**Symptom-Free Days:** 4
**Total Symptoms:** 8

— — — — —

**⚠️ Top Triggers**
💧 **Coffee** (5×)
🍽️ **Citrus** (3×)
🍽️ **Tomato** (2×)

— — — — —

**📈 Trends**
🟢 +35% improvement
🎉 Trend looks **35% better** this week! Keep the gut love going 🫶
```

## Dependencies

No new npm packages needed! All modules use existing dependencies:
- discord.js (buttons, embeds, interactions)
- node-cron (already installed)
- moment-timezone (already installed)

## File Structure

```
discord-gi-tracker/
├── index.js (updated with imports and handlers)
├── services/
│   └── googleSheets.js (updated with error handling)
├── src/
│   ├── constants/
│   │   └── ux.js (NEW)
│   ├── ui/
│   │   ├── components.js (NEW)
│   │   └── formatters.js (NEW)
│   ├── utils/
│   │   └── contextMemory.js (NEW)
│   ├── scheduler/
│   │   └── digests.js (NEW)
│   └── handlers/
│       └── buttonHandlers.js (NEW)
└── IMPLEMENTATION_GUIDE.md (this file)
```

## Next Steps

1. Add the imports to index.js
2. Add the interaction handler
3. Register digests on ready
4. Update command responses to use new formatters
5. Update NLP success/error handling
6. Test each flow
7. Deploy and enjoy the polished UX!

---

For questions or issues, review the inline comments in each module file for detailed usage examples.
