# UX Polish Update - Changes Summary

## Overview
This update adds comprehensive UX polish to the Louton GI Bot without changing core analytics logic or Google Sheets schema.

## New Files Created

### 1. src/constants/ux.js (238 lines)
**Purpose:** Central UX constants and utilities

**Exports:**
- `EMOJI` - Consistent emoji taxonomy (food 🍽️, drink 💧, symptom 😣, etc.)
- `COLORS` - Discord embed color integers (success, caution, error, etc.)
- `BUTTON_IDS` - Namespaced button custom IDs for all interactions
- `BUTTON_LABELS` - User-friendly button labels
- `PHRASES` - Canned response phrases with variety
- `UX` - Configuration (max lines, divider, TTLs, etc.)
- Helper functions: `getRandomPhrase()`, `formatPhrase()`, `getSeverityColor()`, `getTypeEmoji()`

**Key Features:**
- Random phrase selection for success/caution messages
- Template variable replacement `{trigger}`, `{count}`, `{percent}`
- Severity-to-color mapping
- 24-hour warning cooldowns

### 2. src/ui/formatters.js (240 lines)
**Purpose:** Visual formatting utilities for Discord messages

**Key Functions:**
- `progressBar(percentage, width)` → "▮▮▮▯▯ 60%"
- `trendChip(deltaPct)` → "🟢 +15% improvement" (color-coded)
- `section(title, body)` → Bolded title + body
- `list(items, max)` → Bulleted list with "… and N more"
- `kv(label, value)` → "**Label:** value"
- `miniStats(obj)` → Multi-KV inline display
- `formatTrigger(name, count, type)` → "💧 **Coffee** (5×)"
- `severityBadge(severity)` → "🔴 Severe"
- `pluralize(count, word)` → Smart pluralization

**Examples:**
```javascript
progressBar(75) // "▮▮▮▮▯ 75%"
trendChip(-20) // "🔴 -20% decline"
list(['Coffee', 'Citrus', 'Tomato'], 2) // "• Coffee\n• Citrus\n… and 1 more"
```

### 3. src/ui/components.js (358 lines)
**Purpose:** Discord.js component builders (embeds & buttons)

**Key Functions:**
- `buildEmbed({ title, description, color, footer, fields })` - Standardized embed builder
- `buttonsSymptomType()` - 5 buttons for symptom clarification
- `buttonsMealTime()` - 4 buttons for meal time selection
- `buttonsBristol()` - 7 buttons for Bristol scale (1-7)
- `buttonsSeverity()` - 10 buttons for severity rating (1-10)
- `buttonsCheckIn()` - 3 buttons for morning check-in (good/okay/bad)
- `buttonUndo()`, `buttonDismiss()` - Action buttons
- `successEmbed()`, `errorEmbed()`, `cautionEmbed()` - Pre-styled embeds

**Button Flow:**
1. User sends vague symptom → Bot shows symptom type buttons
2. User clicks type → Bot shows severity buttons (1-10)
3. User clicks severity → Bot logs and shows success

### 4. src/utils/contextMemory.js (253 lines)
**Purpose:** In-memory per-user rolling context tracker

**Key Functions:**
- `push(userId, entry)` - Add entry to user's context (keeps last 3)
- `getRecent(userId, count)` - Get recent entries
- `hasRoughPatch(userId, windowMs, threshold)` - Detect multiple symptoms within 8h
- `shouldWarn(userId, trigger)` - Check if warning should show (24h cooldown)
- `recordWarning(userId, trigger)` - Mark warning as shown
- `dismissWarning(userId, trigger)` - Suppress future warnings
- `getStats(userId)` - Get summary statistics

**Features:**
- Automatic TTL (24 hours)
- Global cleanup job (every 10 minutes)
- Per-trigger warning cooldowns
- Rough patch detection (2+ symptoms in 8 hours)

### 5. src/scheduler/digests.js (220 lines)
**Purpose:** Daily AM check-in and PM recap scheduler

**Key Functions:**
- `registerDigests(client, googleSheets)` - Set up cron jobs
- `sendMorningCheckIn(client, userId)` - Send 8am check-in with buttons
- `sendEveningRecap(client, userId, googleSheets)` - Send 8:30pm summary
- `handleCheckInResponse(interaction, googleSheets, contextMemory)` - Process check-in buttons
- `autoEnableForUser(userId)` - Enable digests for active users

**Schedules:**
- **AM Check-In:** 08:00 daily (timezone-aware)
  - Shows 3 buttons: 😊 Feeling Good / 😐 Okay / 😣 Not Great
  - Logs baseline symptom with mapped severity
  - Ephemeral success response
- **PM Recap:** 20:30 daily (optional)
  - Shows day's summary stats
  - Only sends if user logged entries today

### 6. src/handlers/buttonHandlers.js (410 lines)
**Purpose:** Button interaction routing and handling

**Key Functions:**
- `handleButtonInteraction(interaction, googleSheets, digests)` - Main router
- `handleSymptomType()` - Process symptom type selection → ask severity
- `handleSeverity()` - Process severity selection → log entry
- `handleMealTime()` - Process meal time selection → log with meal type
- `handleBristol()` - Process Bristol scale selection → log BM
- `handleUndo()` - Undo last entry
- `requestSymptomClarification(message)` - Show symptom type buttons
- `requestMealTimeClarification(message, data)` - Show meal time buttons
- `requestBristolClarification(message, notes)` - Show Bristol buttons

**Pending Clarifications:**
- Stores user state between button clicks
- 5-minute timeout with automatic cleanup
- Handles multi-step flows (type → severity)

## Modified Files

### services/googleSheets.js
**Changes:**
1. Added `notesAppend` parameter support
   - Merges additional metadata into Notes field
   - Separator: `; ` between existing and appended notes
2. Improved error handling
   - Returns `{ success, data, rowNumber }` instead of throwing
   - Returns `{ success: false, error: { message, code, userMessage } }` on failure
   - Better console logging with ✅/❌ prefixes
3. No schema changes - backward compatible

**Example:**
```javascript
const result = await googleSheets.appendRow({
    user: 'User#1234',
    type: 'food',
    value: 'Oats with banana',
    mealType: 'Breakfast',
    notesAppend: 'From AM check-in'
});

if (result.success) {
    console.log(`Logged to row ${result.rowNumber}`);
} else {
    console.error(result.error.userMessage);
}
```

## Integration with index.js

The `IMPLEMENTATION_GUIDE.md` provides step-by-step instructions for integrating these modules into `index.js`. Key integration points:

1. **Imports** - Add 6 new require() statements
2. **Interaction Handler** - Add `client.on('interactionCreate')` for buttons
3. **Digest Registration** - Call `digests.registerDigests()` in ready handler
4. **Command Updates** - Update `!weekly`, `!insights`, `!trends` with new formatters
5. **NLP Updates** - Add context memory tracking and success phrase variety
6. **Error Handling** - Check `result.success` and show friendly errors
7. **Trigger Warnings** - Add smart warnings after logging triggers

## Benefits

### User Experience
- ✅ Interactive buttons replace numeric replies
- ✅ Consistent emoji taxonomy across all messages
- ✅ Styled embeds with dividers and sections for summaries
- ✅ Empathetic follow-ups (rough patch detection)
- ✅ Smart trigger warnings with 24h cooldowns
- ✅ Daily AM check-in for quick logging
- ✅ Variety in success messages (4 variations)
- ✅ Visual progress bars and trend indicators

### Developer Experience
- ✅ Modular, reusable UI components
- ✅ Centralized constants (no magic strings)
- ✅ Type-safe button IDs (namespaced)
- ✅ Automatic cleanup (TTLs, cron jobs)
- ✅ Graceful error handling
- ✅ Well-documented with examples

### Performance
- ✅ In-memory context (no DB calls)
- ✅ Automatic cleanup prevents memory leaks
- ✅ Rate-limiting built in (1s delay between digest sends)
- ✅ Ephemeral responses reduce clutter

## Backward Compatibility

- ✅ All existing commands work unchanged
- ✅ Google Sheets schema unchanged
- ✅ Existing data reads correctly
- ✅ Old-style numeric replies still work (if not updated)
- ✅ No breaking changes to analytics logic

## Testing Matrix

| Feature | Test Case | Expected Result |
|---------|-----------|-----------------|
| Morning Check-In | 8am arrives | User receives DM with 3 buttons |
| Check-In Button | Click "😊 Feeling Good" | Logs baseline symptom (mild), ephemeral success |
| Vague Symptom | "not feeling great" | Shows 5 symptom type buttons |
| Symptom Flow | Click "Reflux" → "7" | Logs reflux (severe), success message |
| Meal Time | "had oats" (no time) | Shows 4 meal time buttons |
| Bristol Scale | "bathroom" (no detail) | Shows 7 Bristol scale buttons |
| !weekly | User types !weekly | Styled embed with sections & dividers |
| !insights | User types !insights | Shows patterns with formatters |
| !trends | User types !trends | Progress bar + trend chip |
| Trigger Warning | Log coffee after symptoms | Caution embed with dismiss button |
| Rough Patch | 2 symptoms in 8h | Empathetic follow-up message |
| Undo | Click undo button | Removes last entry |
| Error | Sheets API fails | Friendly error message |

## Dependencies

**No new npm packages required!**

All modules use existing dependencies:
- `discord.js` v14 (buttons, embeds, interactions)
- `node-cron` v3 (already installed, for digests)
- `moment-timezone` (already installed, for timezone handling)

## File Count & Line Count

| Category | Files | Lines of Code |
|----------|-------|---------------|
| **New Files** | 6 | ~1,719 lines |
| **Modified Files** | 1 | ~80 lines changed |
| **Documentation** | 2 | ~650 lines |
| **Total** | 9 | ~2,449 lines |

## Deployment Notes

1. **Test Environment First**
   - Deploy to test bot instance
   - Test all button flows
   - Verify digests fire at correct times
   - Check error handling

2. **Production Deployment**
   - Update environment variables (TIMEZONE if needed)
   - Deploy new files
   - Update index.js
   - Restart bot
   - Monitor logs for first 24h

3. **Rollback Plan**
   - Keep backup of old index.js
   - If issues, revert index.js changes
   - New modules don't affect existing functionality

## Future Enhancements

Possible additions (not in this release):
- Persistent digest preferences (database)
- Per-user timezone support
- Weekly digest (in addition to daily)
- Custom trigger warnings
- Photo logging support
- Partner comparison features

## Support

For questions or issues:
1. Review IMPLEMENTATION_GUIDE.md
2. Check inline comments in each module
3. Review examples in this document
4. Check console logs for debugging

---

**Generated:** Oct 18, 2025
**Version:** 1.0.0
**Bot:** Louton GI Bot UX Polish Update
