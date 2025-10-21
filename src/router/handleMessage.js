const { Client, GatewayIntentBits, Partials } = require('discord.js');
const time = require('../utils/time');
// const analyzer = require('../utils/analyzer'); // Removed
// const NLPHandler = require('../utils/nlpHandler'); // Removed
// const PatternAnalyzer = require('../utils/patternAnalyzer'); // Removed
// const ClarificationHandler = require('../utils/clarificationHandler'); // Removed

// NLU System imports - V2 UPGRADE
const { understand, formatParseResult } = require('../nlu/understand-v2');
const { extractMetadata } = require('../nlu/rules');
// const { getWindowStartTime } = require('../nlu/ontology'); // Removed
const { record: recordNLUMetrics } = require('../nlu/metrics-v2');
const { postprocess } = require('../nlu/postprocess');

// Calorie System imports
const { shouldEnableCalorieFeatures } = require('../auth/scope');
const { parseComplexIntent } = require('../nlu/rulesIntent');
const { estimate, getDailyKcalTarget, calculateDailyTotals, formatDailyProgress, estimateCaloriesForItemAndSides } = require('../calories/estimate');
const { deliverNotification, testDMHandshake } = require('../notify/channelOrDM');

// UX System imports
const { EMOJI, PHRASES, getRandomPhrase, BUTTON_IDS } = require('../constants/ux');
const { buttonsSeverity, buttonsMealTime, buttonsBristol, buttonsSymptomType, trendChip, buttonsIntentClarification, buildConversationalHelp } = require('../ui/components');
const { buildPostLogChips } = require('../ui/chips');
const { keyFrom, get, set, clear } = require('../../services/pending');
const DialogManager = require('../dialogs/DialogManager');
const symptomLogDialog = require('../dialogs/symptomLogDialog');
const { validateQuality } = require('../utils/qualityCheck');
const { generateQuery, synthesizeAnswer } = require('../insights/AIAnalyst');
const { getSheetName } = require('../utils/getSheetName');
const { updateMealNotes, getMealRowByRef } = require('../utils/mealNotes');
const dndCommands = require('../commands/dnd');
const { markInteracted, isUnderWatch } = require('../reminders/responseWatcher');
const { ensureReply } = require('../utils/ensureReply');
const { buildNotesFromParse } = require('../utils/notesBuild');
// const contextMemory = require('../utils/contextMemory'); // Removed
const { scheduleSymptomFollowup } = require('../scheduler/reminders');
const { findSymptomNear } = require('../sheets/findSymptomNear'); // New import

// Command/Intent Handlers (will eventually be moved to dedicated files)
// Moved handleTest here
async function handleTest(message, deps) {
    console.log('🧪 Test command received!');
    await message.reply('✅ Bot is working! I can receive and respond to your messages.');
}

async function handleGoal(message, args, deps) {
    const userId = message.author.id;
    
    // Only allow Peyton to set goals
    if (userId !== deps.PEYTON_ID) {
        await message.reply('Goal tracking is only enabled for Peyton.');
        return;
    }
    
    if (!args || args.trim() === '') {
        // Show current goal
        try {
            const profile = await deps.getUserProfile(userId, deps.googleSheets);
            const currentGoal = profile.dailyGoal || await deps.getDailyKcalTarget(userId);
            await message.reply(`📊 Your current daily goal is ${currentGoal.toLocaleString()} kcal.\n\nUse \`!goal <number>\` to change it.`);
        } catch (e) {
            console.warn('[handleGoal] Error getting current goal:', e.message);
            await message.reply('❌ Error retrieving your current goal. Please try again.');
        }
        return;
    }
    
    const goal = parseInt(args.trim(), 10);
    if (isNaN(goal) || goal < 1000 || goal > 5000) {
        await message.reply('❌ Please enter a valid goal between 1000 and 5000 kcal.\n\nExample: `!goal 2200`');
        return;
    }
    
    try {
        // Get current profile
        const profile = await deps.getUserProfile(userId, deps.googleSheets);
        
        // Update the daily goal
        profile.dailyGoal = goal;
        
        // Save to persistent storage
        await deps.updateUserProfile(userId, profile, deps.googleSheets);
        
        // Also store in memory for immediate use
        deps.userGoals.set(userId, goal);
        
        await message.reply(`✅ Set your daily goal to ${goal.toLocaleString()} kcal.`);
    } catch (e) {
        console.error('[handleGoal] Error setting goal:', e);
        await message.reply('❌ Error setting your goal. Please try again.');
    }
}

async function handleComplexIntent(message, intent, deps) {
    const userId = message.author.id;
    switch (intent.kind) {
        case 'after_meal_ping':
            await handleReminderSetup(message, intent, deps);
            break;
        case 'stop_meal_reminders':
            await handleStopReminders(message, deps);
            break;
        case 'set_calorie_target':
            await handleSetCalorieTarget(message, intent, deps);
            break;
        default:
            console.log(`[CALORIE] Unknown complex intent: ${intent.kind}`);
    }
}

async function handleReminderSetup(message, intent, deps) {
    const userId = message.author.id;
    const { delayMin, scope } = intent;
    const handshakeResult = await deps.testDMHandshake(deps.client, userId);
    if (handshakeResult.success) {
        console.log(`[CALORIE] Setting up ${scope} reminders with ${delayMin}min delay for user ${userId}`);
        await message.reply(`✅ I'll DM you ~${delayMin} minutes after each ${scope} to add calories. ${handshakeResult.message}`);
    } else {
        await message.reply(`⚠️ ${handshakeResult.message}`);
    }
}

async function handleStopReminders(message, deps) {
    const userId = message.author.id;
    console.log(`[CALORIE] Stopping meal reminders for user ${userId}`);
    await message.reply('✅ Meal reminders stopped. You can re-enable them anytime by saying "ask me 30 min after every meal to log calories".');
}

async function handleSetCalorieTarget(message, intent, deps) {
    const userId = message.author.id;
    const { target } = intent;
    console.log(`[CALORIE] Setting calorie target to ${target} for user ${userId}`);
    await message.reply(`✅ Daily calorie target set to ${target} kcal. I'll track your progress against this goal.`);
}

async function handleQuestion(message, query, deps) {
    await message.channel.sendTyping();
    const structuredQuery = await deps.generateQuery(query);
    if (structuredQuery.error) {
        await message.reply(`${deps.EMOJI.error} ${structuredQuery.error}`);
        return;
    }
    const userId = message.author.id;
    const sheetName = deps.googleSheets.getLogSheetNameForUser(userId);
    const queryResult = await deps.googleSheets.executeQuery(sheetName, structuredQuery);
    if (!queryResult.success) {
        await message.reply(`${deps.EMOJI.error} I had trouble fetching your data. Please try again.`);
        return;
    }
    const finalAnswer = await deps.synthesizeAnswer(query, queryResult);
    await message.reply(finalAnswer);
}

async function handleHelp(message, deps) {
    const helpPayload = deps.buildConversationalHelp();
    await message.reply(helpPayload);
}

async function handleUndo(message, deps) {
    const userId = message.author.id;
    const userName = message.author.username;
    const sheetName = deps.googleSheets.getLogSheetNameForUser(userId);
    try {
        const result = await deps.googleSheets.undoLastEntry(userName, sheetName);
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

// Helper Functions (moved from index.js)
function mapSeverityToLabel(severityNum) {
    if (severityNum <= 3) return 'mild';
    if (severityNum <= 6) return 'moderate';
    return 'severe';
}

function getTypeEmoji(type, deps) {
    const emojiMap = {
        food: deps.EMOJI.food,
        drink: deps.EMOJI.drink,
        symptom: deps.EMOJI.symptom,
        reflux: deps.EMOJI.reflux,
        bm: deps.EMOJI.bm
    };
    return emojiMap[type] || deps.EMOJI.success;
}

async function requestIntentClarification(message, deps) {
    await message.reply({
        content: `${deps.EMOJI.thinking} How should I log that?`,
        components: deps.buttonsIntentClarification()
    });
}

async function requestMissingSlots(message, parseResult, deps) {
    const { intent, slots, missing } = parseResult;
    // Store pending clarification in button handler
    deps.buttonHandlers.pendingClarifications.set(message.author.id, {
        type: 'nlu_clarification',
        originalMessage: message.content,
        timestamp: Date.now()
    });
    if (missing.includes('severity')) {
        await message.reply({
            content: `${deps.EMOJI.symptom} How severe is it? (1 = mild, 10 = severe)`,
            components: deps.buttonsSeverity()
        });
    } else if (missing.includes('symptom_type')) {
        await message.reply({
            content: `${deps.EMOJI.symptom} What type of symptom?`,
            components: deps.buttonsSymptomType()
        });
    } else if (missing.includes('meal_time')) {
        await message.reply({
            content: `${deps.EMOJI.food} When did you have this?`,
            components: deps.buttonsMealTime()
        });
    } else if (missing.includes('bristol')) {
        await message.reply({
            content: `${deps.EMOJI.bm} Can you provide more details?`,
            components: deps.buttonsBristol()
        });
    } else if (missing.includes('item')) {
        await message.reply({
            content: `${deps.EMOJI.food} What did you have? (Type the food/drink name)`
        });
    }
}

async function logFromNLU(message, parseResult, deps) {
    const { intent, slots } = parseResult;
    const userId = message.author.id;
    const userTag = message.author.tag;
    const isPeyton = (userId === deps.PEYTON_ID);
    const sheetName = deps.getLogSheetNameForUser(userId);

    const userProfile = await deps.getUserProfile(userId, deps.googleSheets);

    let caloriesVal = null;
    if ((intent === 'food' || intent === 'drink') && isPeyton) {
        const fullItemDescription = (slots.item + (slots.sides ? `, ${slots.sides}` : '')).toLowerCase().trim();
        if (userProfile.learnedCalorieMap && userProfile.learnedCalorieMap[fullItemDescription]) {
            caloriesVal = userProfile.learnedCalorieMap[fullItemDescription];
            console.log(`[CAL-MEM] ✅ Recalled calories for "${fullItemDescription}": ${caloriesVal} kcal`);
        } else {
            try {
                caloriesVal = await deps.estimateCaloriesForItemAndSides(slots.item, slots.sides);
                if (caloriesVal !== null && caloriesVal > 0) {
                    console.log(`[CAL-MEM] 🧠 Learning calories for "${fullItemDescription}": ${caloriesVal} kcal`);
                    userProfile.learnedCalorieMap[fullItemDescription] = caloriesVal;
                    deps.updateUserProfile(userId, userProfile, deps.googleSheets).catch(err => {
                        console.error(`[USER_PROFILE] Non-blocking profile update failed: ${err.message}`);
                    });
                }
            } catch (e) {
                console.error(`[CAL-EST] CRITICAL: Calorie estimation failed unexpectedly for "${slots.item}". Error: ${e.message}`);
                caloriesVal = null;
            }
        }
    }

    const { buildNotesFromParse } = require('../utils/notesBuild');
    let notesString;
    if (slots._validatedNotes) {
        notesString = slots._validatedNotes;
        console.log('[NOTES] Using validated Notes v2.1');
    } else {
        notesString = buildNotesFromParse(parseResult);
        console.log('[NOTES] Built Notes from parse (fallback)');
    }

    const metadata = deps.extractMetadata(message.content, intent);
    const notes = [];

    if (slots.meal_time) {
        notes.push(`meal=${slots.meal_time}`);
        if (slots.meal_time_note) {
            notes.push(slots.meal_time_note);
        }
    } else if (slots.time) {
        notes.push(`time=${new Date(slots.time).toLocaleTimeString()}`);
    }

    let portionMultiplier = 1.0;
    if (metadata.portion) {
        if (metadata.portion.normalized_g) notes.push(`portion_g=${metadata.portion.normalized_g}`);
        if (metadata.portion.normalized_ml) notes.push(`portion_ml=${metadata.portion.normalized_ml}`);
        if (metadata.portion.raw) notes.push(`portion=${metadata.portion.raw}`);
        portionMultiplier = metadata.portion.multiplier || 1.0;
    }

    if (metadata.quantity && !metadata.portion) notes.push(`qty=${metadata.quantity}`);
    if (metadata.brand) notes.push(`brand=${metadata.brand}`);
    if (metadata.brandInfo) {
        notes.push(`brand_variant=${metadata.brandInfo.brand}`);
        if (metadata.brandInfo.variant) notes.push(`variant=${metadata.brandInfo.variant}`);
        if (metadata.brandInfo.multiplier && !metadata.portion) portionMultiplier = metadata.brandInfo.multiplier;
    }
    if (metadata.caffeine) {
        if (metadata.caffeine.isDecaf) notes.push('decaf');
        else if (metadata.caffeine.hasCaffeine) notes.push('caffeine');
    }
    if (slots.sides) notes.push(`sides=${slots.sides}`);
    if (slots.severity_note) notes.push(slots.severity_note);
    if (slots.bristol_note) notes.push(slots.bristol_note);
    if (slots.linked_item) notesString += `; linked_to=${slots.linked_item}`;

    let details = '';
    switch (intent) {
        case 'bm': details = slots.bristol ? `Bristol ${slots.bristol}` : 'BM'; break;
        case 'food': case 'drink': details = (slots.item || 'entry').trim(); break;
        case 'symptom': details = (slots.symptom_type || 'symptom').trim(); break;
        case 'reflux': details = 'reflux'; break;
        default: details = 'entry';
    }

    let proteinVal = null, carbsVal = null, fatVal = null;
    if (deps.shouldEnableCalorieFeatures(userId) && caloriesVal && caloriesVal > 0) {
        const macroEstimate = deps.estimate({ 
            item: slots.item, 
            quantity: slots.sides,
            units: 'serving' 
        });
        if (macroEstimate) {
            proteinVal = macroEstimate.protein;
            carbsVal = macroEstimate.carbs;
            fatVal = macroEstimate.fat;
        }
    }

    const rowObj = {
        'Timestamp': new Date().toISOString(),
        'Date': new Date().toISOString().slice(0, 10),
        'Time': new Date().toISOString().slice(11, 19),
        'User': userTag,
        'Type': intent,
        'Item': details,
        'Calories': (caloriesVal != null && caloriesVal > 0) ? caloriesVal : '',
        'Protein': proteinVal || '',
        'Carbs': carbsVal || '',
        'Fat': fatVal || '',
        'Notes': notesString
    };

    const result = await deps.googleSheets.appendRowToSheet(sheetName, rowObj);

    if (!result.success) {
        await message.reply(`${deps.EMOJI.error} ${result.error.userMessage}`);
        return { success: false };
    }

    console.log(`[SAVE] ✅ Successfully appended to ${sheetName}`);

    let rowIndex = result.rowIndex || 2;
    try {
        if (!result.rowIndex) {
            const rowsResult = await deps.googleSheets.getRows({}, sheetName);
            rowIndex = rowsResult?.rows?.length ? rowsResult.rows.length + 1 : 2;
        }
    } catch (e) {
        console.warn('[UNDO] Could not determine row index, using default:', 2);
        rowIndex = 2;
    }

    const undoId = `${sheetName}:${rowIndex}`;

    return { success: true, undoId: undoId, caloriesVal: caloriesVal, rowObj: rowObj };
}

async function postLogActions(message, parseResult, undoId, caloriesVal, rowObj, deps) {
    const { intent, slots } = parseResult;
    const userId = message.author.id;
    const isPeyton = (userId === deps.PEYTON_ID);

    try {
        let confirmText = '';
        const emoji = getTypeEmoji(intent, deps);
        const details = (parseResult.slots.item || parseResult.slots.symptom_type || intent).trim();

        if (intent === 'food' || intent === 'drink') {
            if (deps.shouldEnableCalorieFeatures(userId) && caloriesVal != null && caloriesVal > 0) {
                confirmText = `✅ Logged **${details}** — ≈${caloriesVal} kcal.`;
                try {
                    const sheetName = deps.googleSheets.getLogSheetNameForUser(userId);
                    const todayEntries = await deps.googleSheets.getTodayEntries(null, sheetName);
                    const totals = deps.calculateDailyTotals(todayEntries.rows || []);
                    const target = await deps.getDailyKcalTarget(userId, deps.userGoals, deps.googleSheets);
                    const progress = deps.formatDailyProgress(totals, target);
                    confirmText += `\n\n📊 ${progress}`;
                } catch (e) {
                    console.warn('[postLogActions] Error calculating daily progress:', e.message);
                }
            } else {
                confirmText = `✅ Logged **${details}**.`;
            }
        } else {
            confirmText = `${emoji} Logged **${details}**.`;
        }

        const chips = deps.buildPostLogChips({ undoId, intent });
        await message.reply({ content: confirmText, components: chips });
    } catch (e) {
        console.error('[postLogActions] Error sending success message:', e);
    }

    if (intent === 'food' || intent === 'drink') {
        try {
            await message.channel.send("How are you feeling after that?");
            const [sheetName, rowIndexStr] = undoId.split(':');
            const rowId = parseInt(rowIndexStr, 10);

            const mealRef = {
                tab: sheetName,
                rowId: rowId,
                timestampISO: rowObj.Timestamp,
                item: rowObj.Item,
            };
            await deps.set(deps.keyFrom(message), { type: 'post_meal_check', mealRef: mealRef }, 120);
        } catch (e) {
            console.warn('[postLogActions] Error sending follow-up question:', e.message);
        }
    }

    setImmediate(() => {
        try {
            // contextMemory.push(userId, { // DEPRECATED
            //     type: intent,
            //     details: slots.item || slots.symptom_type || intent,
            //     severity: slots.severity ? mapSeverityToLabel(slots.severity) : '',
            //     timestamp: Date.now()
            // });
            if (intent === 'symptom' || intent === 'reflux') {
                deps.scheduleSymptomFollowup(userId).catch(e => console.warn('[POSTSAVE][warn] followup:', e.message));
            }
            if (parseResult.multi_actions && parseResult.multi_actions.length > 0) {
                for (const action of parseResult.multi_actions) {
                    delete action.multi_actions;
                    setTimeout(() => {
                        logFromNLU(message, action, deps).catch(e => console.error('[Multi-Action] Error logging sub-action:', e));
                    }, 500);
                }
            }
            console.log('[SAVE] ✅ Post-save background tasks dispatched');
        } catch(e) {
            console.error('[postLogActions] Error in background tasks:', e);
        }
    });
}

async function handlePostMealCheck(message, pendingCheck, deps) {
    const mealRef = pendingCheck?.mealRef;
    const text = message.content.trim();
    const userId = message.author.id;
  
    const positive = /\b(solid|all good|pretty good|good|great|fine|ok|okay|no issues|felt fine)\b/i.test(text);
    const neg = text.match(/\b(reflux|heartburn|nausea|bloat(?:ed|ing)?|gas(?:sy)?|cramp(?:s|ing)?|pain|burning|regurgitation)\b/i);
    const sevWord = (text.match(/\b(mild|moderate|severe)\b/i) || [])[1];
    const sevNum = (text.match(/\b([1-9]|10)\b/) || [])[1];
  
    if (positive && !neg) {
      try { if (mealRef) await deps.updateMealNotes(deps.googleSheets, mealRef, ["after_effect=ok"]); }
      catch (e) { console.warn("[POST_MEAL_CHECK] notes append failed:", e); }
      await message.reply({ content: "Got it — no symptoms. ✅" });
      await deps.clear(deps.keyFrom(message));
      return;
    }
  
    if (neg && (sevNum || sevWord)) {
      const severity = sevNum ? Number(sevNum) : ({ mild:3, moderate:6, severe:9 }[sevWord.toLowerCase()] || 5);
      await logSymptomForMeal(userId, neg[1].toLowerCase(), severity, mealRef ? `${mealRef.tab}:${mealRef.rowId}` : null, deps); // Pass mealRef string and deps
      await message.reply({ content: `Logged ${neg[1]} (severity ${severity}).` });
      await deps.clear(deps.keyFrom(message));
      return;
    }
  
    await message.reply({ content: "Any symptoms to log?", components: [deps.buildSeverityButtons()] });
    await deps.set(deps.keyFrom(message), { type: 'post_meal_check_wait_severity', ...pendingCheck, createdAt: Date.now() }, 120);
}

async function logSymptomForMeal(userId, symptomType, severity, mealRefString, deps) {
    const userTag = (await deps.client.users.fetch(userId)).tag;
    const sheetName = deps.getLogSheetNameForUser(userId);

    // Construct mealRef object from mealRefString for findSymptomNear
    let mealRef = null;
    if (mealRefString) {
        const [tab, rowId] = mealRefString.split(':');
        mealRef = { tab, rowId: parseInt(rowId, 10) };
    }

    // Idempotency check: Prevent duplicate symptom logging if a similar symptom for the same meal was logged recently
    if (mealRef) {
        const existingSymptom = await deps.findSymptomNear(deps.googleSheets, mealRef);
        if (existingSymptom) {
            console.log(`[IDEMPOTENCY] Ignoring duplicate symptom log for user ${userId}: ${symptomType}`);
            // No need to reply here, as the initial interaction would have already been responded to.
            return;
        }
    }

    const timestamp = new Date().toISOString();
    const date = timestamp.slice(0, 10);
    const time = timestamp.slice(11, 19);

    const notesArray = [`notes_v=2.1`, `severity_map=${mapSeverityToLabel(severity)}`];
    if (mealRefString) {
        notesArray.push(`linked_meal=${mealRefString}`);
    }

    const rowObj = {
        'Timestamp': timestamp,
        'Date': date,
        'Time': time,
        'User': userTag,
        'Type': 'symptom',
        'Item': symptomType,
        'Severity': severity,
        'Notes': notesArray.join('; '),
        'Calories': '',
        'Protein': '',
        'Carbs': '',
        'Fat': '',
    };
    await deps.googleSheets.appendRowToSheet(sheetName, rowObj);
    console.log(`[POST_MEAL_CHECK] Logged symptom ${symptomType} (severity ${severity}) linked to ${mealRefString || 'no meal'}`);
}

module.exports = async function handleMessage(message, deps) {
    message = ensureReply(message);

    const text = message.content.trim();
    const userId = message.author.id;
    let saveSucceeded = false;

    if (deps.DialogManager.hasActiveDialog(userId)) {
        await deps.DialogManager.handleResponse(message);
        return;
    }

    const pendingCheck = await deps.get(deps.keyFrom(message));
    if (pendingCheck && (pendingCheck.type === 'post_meal_check' || pendingCheck.type === 'post_meal_check_wait_severity')) {
        if (pendingCheck.expiresAt && pendingCheck.expiresAt < Date.now()) {
            console.log(`[POST_MEAL_CHECK] Pending context expired for user ${userId}. Clearing and proceeding with normal NLU.`);
            await deps.clear(deps.keyFrom(message));
        } else {
            console.log(`[POST_MEAL_CHECK] Handling message for pending post-meal check for user ${userId}.`);
            await handlePostMealCheck(message, pendingCheck, deps);
            return;
        }
    }

    if (deps.shouldEnableCalorieFeatures(userId)) {
        const complexIntent = deps.parseComplexIntent(text);
        if (complexIntent) {
            await handleComplexIntent(message, complexIntent, deps);
            return;
        }
    }

    // Handle legacy commands first if present, then NLU
    if (text.startsWith('!')) {
        const command = text.split(' ')[0].substring(1);
        const args = text.substring(command.length + 1).trim();

        console.log(`[CMD] Command received: ${command}, Args: ${args}`);
        switch (command) {
            case 'test':
                await handleTest(message, deps); // Call with deps
                return;
            case 'undo':
                await handleUndo(message, deps);
                return;
            case 'goal':
                await handleGoal(message, args, deps);
                return;
            case 'reminders':
                await handleReminders(message, args, deps);
                return;
            case 'dnd':
                await handleDND(message, args, deps);
                return;
            case 'timezone':
                await handleTimezone(message, args, deps);
                return;
            case 'snooze':
                await handleSnooze(message, args, deps);
                return;
            case 'nlu':
                await handleNLUStats(message, args);
                return;
            default:
                await message.reply(`${deps.EMOJI.thinking} I don't recognize that command. Try \`!help\`.`);
                return;
        }
    }

    try {
        const profile = await deps.getUserProfile(userId, deps.googleSheets);
        const tz = profile.prefs.TZ;

        const pendingContext = await deps.get(deps.keyFrom(message));
        if (pendingContext && pendingContext.type === 'expecting_symptom_follow_up') {
            const result = await deps.understand(text, { userId, tz, forcedIntent: 'symptom' });
            if (result.intent === 'symptom' || result.intent === 'reflux') {
                result.slots.linked_item = pendingContext.data.linkedItem;
                console.log(`[Context] Follow-up symptom detected, linking to: ${pendingContext.data.linkedItem}`);
                await logFromNLU(message, result, deps);
                return;
            }
        }

        const understandOptions = { userId, tz };
        if (message.forcedIntent) {
            understandOptions.forcedIntent = message.forcedIntent;
        }

        const result = await deps.understand(text, understandOptions);
        deps.postprocess(result);
        deps.disambiguate(result, { userId, tz });
        console.log(`🧠 NLU-V2: ${deps.formatParseResult(result)}`);
        deps.recordNLUMetrics(result);
        deps.recordNLUParse(result, { fromCache: false, usedLLM: false });
        deps.digests.autoEnableForUser(userId);

        const LOGGABLE_INTENTS = ['food', 'drink', 'symptom', 'reflux', 'bm', 'mood', 'checkin'];

        if (result.intent === 'greeting') {
            const greetings = ['Morning! 🌞', 'Hey! 👋', 'Hi there! 👋', 'Hello! 😊'];
            await message.reply(greetings[Math.floor(Math.random() * greetings.length)] + ' How are you feeling?');
            return;
        }

        if (result.intent === 'thanks') {
            const responses = ['You\'re welcome! 😊', 'Anytime! 👍', 'Happy to help! ✨', 'No problem! 😊'];
            await message.reply(responses[Math.floor(Math.random() * responses.length)]);
            return;
        }

        if (result.intent === 'chit_chat') {
            const responses = ['👍', '😊', '✨', '👌'];
            await message.reply(responses[Math.floor(Math.random() * responses.length)]);
            return;
        }

        if (result.intent === 'farewell') {
            const farewells = ['Goodnight! 🌙', 'See you later! 👋', 'Bye! Take care! 💙', 'Talk to you soon! ✨'];
            await message.reply(farewells[Math.floor(Math.random() * farewells.length)]);
            return;
        }

        if ((LOGGABLE_INTENTS.includes(result.intent) && result.confidence < 0.65) || result.intent === 'other') {
            await requestIntentClarification(message, deps);
            return;
        }

        if (!LOGGABLE_INTENTS.includes(result.intent)) {
            if (result.intent === 'symptom' && result.missing.length > 0) {
                const initialContext = { ...result.slots, tz };
                await deps.DialogManager.startDialog('symptom_log', message, initialContext);
                return;
            }
            await requestIntentClarification(message, deps);
            return;
        }

        if (result.intent === 'question') {
            await handleQuestion(message, result.slots.query, deps);
            return;
        }

        if (result.intent === 'help') {
            await handleHelp(message, deps);
            return;
        }
        if (result.intent === 'undo') {
            await handleUndo(message, deps);
            return;
        }
        if (result.intent === 'settings') {
            await handleReminders(message, result.slots.query, deps);
            return;
        }

        const qualityCheck = deps.validateQuality(result);
        if (!qualityCheck.isValid) {
            await message.reply({
                content: `${deps.EMOJI.thinking} ${qualityCheck.reason}`
            });
            return;
        }

        if (result.missing.length === 0) {
            const logResult = await logFromNLU(message, result, deps);
            saveSucceeded = logResult.success;

            if (saveSucceeded) {
                await postLogActions(message, result, logResult.undoId, logResult.caloriesVal, logResult.rowObj, deps);
            }
        } else {
            await requestMissingSlots(message, result, deps);
            saveSucceeded = true;
        }
    } catch (error) {
        console.error('[NLU Error]:', error);
        if (!saveSucceeded) {
            try {
                await message.reply(`${deps.EMOJI.error} ${deps.getRandomPhrase(deps.PHRASES.error)}`);
            } catch (replyError) {
                console.error('[NLU] Failed to send error message:', replyError);
            }
        } else {
            console.warn('[NLU] Error after successful save (not shown to user):', error.message);
        }
    }
};
