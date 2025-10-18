# NLU Integration Guide - Rules-Based Natural Language Understanding

This guide explains how to integrate the new deterministic NLU system into `index.js`.

## What Was Built

### New NLU Modules (src/nlu/)

1. **ontology.js** - Intent definitions, synonyms, time windows, severity mappings
2. **rules.js** - Deterministic parser using chrono-node, compromise, and regex
3. **understand.js** - Entry point with lexicon override support

### Enhanced Modules

1. **src/utils/contextMemory.js** - Added lexicon learning and JSON persistence
2. **services/googleSheets.js** - Added `appendNotes()` helper for metadata

### Dependencies Added

```bash
npm install chrono-node compromise
```

## How It Works

### Parse Flow

```
User: "had oats for lunch"
  ↓
understand(text, userCtx, contextMemory)
  ↓
rulesParse(text)
  ├─ Time extraction (chrono-node)
  ├─ Meal time detection (synonyms)
  ├─ Intent classification (BM > Reflux > Symptom > Drink > Food)
  ├─ Item extraction (compromise)
  └─ Slot filling + missing detection
  ↓
Lexicon override (boost confidence if learned)
  ↓
Return { intent, confidence, slots, missing }
```

### Example Parses

| Input | Intent | Slots | Missing |
|-------|--------|-------|---------|
| "had oats for lunch" | food | item=oats, meal_time=lunch | [] |
| "acid reflux not feeling well" | reflux | (none) | [severity] |
| "bad poop" | bm | bristol=6 (auto-detected) | [] (confirms via buttons) |
| "chai grande at 10am" | drink | item=chai, time=ISO | [] |
| "mild heartburn" | reflux | severity=2 (from adjective) | [] |

## Integration into index.js

### 1. Add Imports

```javascript
// At top of index.js, after existing imports
const { understand, formatParseResult } = require('./src/nlu/understand');
const { extractMetadata } = require('./src/nlu/rules');
const { getWindowStartTime } = require('./src/nlu/ontology');
```

### 2. Natural Language Handler (in messageCreate)

```javascript
client.on('messageCreate', async (message) => {
    // ... existing checks (bot self, etc.) ...

    const isDM = message.channel.type === ChannelType.DM;
    const isCommand = message.content.startsWith('!');

    // Skip commands - let existing handlers deal with them
    if (isCommand) {
        // ... existing command routing ...
        return;
    }

    // NEW: Natural language understanding for non-command messages
    if (isDM || isAllowedChannel) {
        await handleNaturalLanguage(message);
    }
});
```

### 3. Natural Language Handler Function

```javascript
async function handleNaturalLanguage(message) {
    const text = message.content.trim();
    const userId = message.author.id;
    const userTag = message.author.tag;

    // Check for correction syntax first
    if (text.toLowerCase().startsWith('correction:') || text.startsWith('*')) {
        await handleCorrection(message, text);
        return;
    }

    try {
        // Parse intent and slots
        const result = await understand(text, { userId }, contextMemory);

        console.log(`🧠 NLU: ${formatParseResult(result)}`);

        // Auto-enable digests for this user
        digests.autoEnableForUser(userId);

        // If confidence too low or "other" intent, ask for clarification
        if (result.intent === "other" || result.confidence < 0.5) {
            await message.reply({
                content: `${EMOJI.thinking} I'm not quite sure what you mean. Try:\n` +
                        `• "had oats for lunch"\n• "mild heartburn"\n• "bad poop"\n` +
                        `Or use commands like \`!food\`, \`!symptom\`, etc.`
            });
            return;
        }

        // Handle based on whether we have missing slots
        if (result.missing.length === 0) {
            // All slots present - log immediately
            await logFromNLU(message, result);
        } else {
            // Ask for missing slots via buttons
            await requestMissingSlots(message, result);
        }
    } catch (error) {
        console.error('NLU Error:', error);
        await message.reply(`${EMOJI.error} ${getRandomPhrase(PHRASES.error)}`);
    }
}
```

### 4. Log from NLU

```javascript
async function logFromNLU(message, parseResult) {
    const { intent, slots } = parseResult;
    const userId = message.author.id;
    const userTag = message.author.tag;

    // Extract metadata
    const metadata = extractMetadata(message.content);

    // Build notes array
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

    // Add quantity/brand
    if (metadata.quantity) notes.push(`qty=${metadata.quantity}`);
    if (metadata.brand) notes.push(`brand=${metadata.brand}`);

    // Add severity note if auto-detected
    if (slots.severity_note) notes.push(slots.severity_note);
    if (slots.bristol_note) notes.push(slots.bristol_note);

    // Build entry for Google Sheets
    const entry = {
        user: userTag,
        type: intent,
        value: null,
        details: null,
        severity: null,
        notes: googleSheets.appendNotes(notes),
        source: 'discord-dm-nlu'
    };

    // Fill type-specific fields
    if (intent === 'food' || intent === 'drink') {
        entry.value = slots.item;
        entry.details = slots.item;
    } else if (intent === 'symptom') {
        entry.value = slots.symptom_type;
        entry.details = slots.symptom_type;
        entry.severity = slots.severity ? mapSeverityToLabel(slots.severity) : null;
    } else if (intent === 'reflux') {
        entry.value = 'reflux';
        entry.details = 'reflux';
        entry.severity = slots.severity ? mapSeverityToLabel(slots.severity) : null;
    } else if (intent === 'bm') {
        entry.value = slots.bristol ? `Bristol ${slots.bristol}` : 'BM';
        entry.details = entry.value;
        entry.bristolScale = slots.bristol;
    }

    // Add meal time to entry if present
    if (slots.meal_time) {
        entry.mealType = slots.meal_time;
    }

    // Log to Sheets
    const result = await googleSheets.appendRow(entry);

    if (!result.success) {
        await message.reply(`${EMOJI.error} ${result.error.userMessage}`);
        return;
    }

    // Add to context memory
    contextMemory.push(userId, {
        type: intent,
        details: entry.value,
        severity: entry.severity,
        timestamp: Date.now()
    });

    // Success response
    const successMsg = getRandomPhrase(PHRASES.success);
    const emoji = getTypeEmoji(intent);
    await message.reply(`${emoji} Logged **${entry.value}**.\n\n${successMsg}`);

    // Check for trigger linking (if symptom/reflux)
    if (intent === 'symptom' || intent === 'reflux') {
        await offerTriggerLink(message, userId);
        await checkRoughPatch(message, userId);
        await surfaceTrendChip(message, userTag);
    }

    // Check for trigger warning (if food/drink)
    if (intent === 'food' || intent === 'drink') {
        await checkTriggerWarning(message, userId, entry.value);
    }
}
```

### 5. Request Missing Slots

```javascript
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
```

### 6. Trigger Linking

```javascript
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
```

### 7. Trend Chip

```javascript
async function surfaceTrendChip(message, userTag) {
    try {
        const entries = await googleSheets.getWeekEntries(userTag);
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
```

### 8. Correction Handler

```javascript
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
```

### 9. Helper: Map Severity Number to Label

```javascript
function mapSeverityToLabel(severityNum) {
    if (severityNum <= 3) return 'mild';
    if (severityNum <= 6) return 'moderate';
    return 'severe';
}
```

### 10. Update Button Handler for NLU Clarifications

In `src/handlers/buttonHandlers.js`, add handling for `nlu_clarification` pending type:

```javascript
// In handleSeverity, handleSymptomType, etc.
const pending = pendingClarifications.get(userId);

if (pending && pending.type === 'nlu_clarification') {
    // Fill in the missing slot
    pending.parseResult.slots.severity = severityNum; // or whatever was clicked
    pending.parseResult.missing = pending.parseResult.missing.filter(m => m !== 'severity');

    // If all slots filled, log
    if (pending.parseResult.missing.length === 0) {
        await logFromNLU(interaction.message, pending.parseResult);
        pendingClarifications.delete(userId);
    } else {
        // Still missing slots, ask for next one
        await requestMissingSlots(interaction.message, pending.parseResult);
    }
}
```

## Testing Scenarios

### Test 1: "had oats for lunch"
```
Expected:
- Intent: food
- Slots: { item: "oats", meal_time: "lunch" }
- Missing: []
- Action: Log immediately
- Result: ✅ "Logged **oats** (lunch). You're building great data habits 💪"
```

### Test 2: "acid reflux not feeling well"
```
Expected:
- Intent: reflux
- Slots: {}
- Missing: ["severity"]
- Action: Show 1-10 severity buttons
- User clicks: 7
- Result: Log with severity=severe, offer recent meal link, show trend chip
```

### Test 3: "bad poop"
```
Expected:
- Intent: bm
- Slots: { bristol: "6", bristol_note: "auto-detected from loose/diarrhea" }
- Missing: []
- Action: Ask Bristol buttons to confirm
- User clicks: 6 (confirms)
- Result: Log BM with Bristol 6
```

### Test 4: "chai grande at 10am"
```
Expected:
- Intent: drink
- Slots: { item: "chai", time: ISO }
- Missing: []
- Metadata: { quantity: "grande" }
- Action: Log immediately
- Result: ✅ "Logged **chai**. You're building great data habits 💪"
```

### Test 5: "mild heartburn"
```
Expected:
- Intent: reflux
- Slots: { severity: 2, severity_note: "auto-detected from adjective" }
- Missing: []
- Action: Log immediately with severity=mild
- Result: ✅ "Logged **reflux** (mild). You're building great data habits 💪"
```

### Test 6: "correction: had rice cakes for snack"
```
Expected:
- Action: Undo last entry
- Parse: Intent=food, item=rice cakes, meal_time=snack
- Action: Log + learn phrase
- Result: "✅ Corrected and learned! I'll remember next time."
```

## Notes Format Examples

Examples of how metadata is stored in the Notes column:

```
meal=lunch; inferred from current time
time=10:30:00; qty=16oz; brand=Rishi
adjSeverity=bad→7
suspected_trigger=pizza
meal=breakfast; time≈from breakfast window 05:00
```

Analytics commands should parse these semicolon-delimited tokens for insights.

## Configuration

No environment variables needed! The NLU system uses:
- Existing `TIMEZONE` for time parsing
- In-memory storage with JSON persistence at `./.data/lexicon.json`

## Backward Compatibility

- ✅ All existing `!commands` work unchanged
- ✅ Google Sheets schema unchanged (metadata in Notes)
- ✅ Existing analytics parse Notes tokens
- ✅ No breaking changes to current functionality

---

**Summary**: The NLU system is complete and ready to integrate. Follow this guide step-by-step to add natural language understanding to your bot!
