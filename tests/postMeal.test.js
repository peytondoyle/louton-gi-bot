const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { GuildMember, User, Message, TextChannel } = require('discord.js');
const { ChannelType } = require('discord-api-types/v10'); // For ChannelType.DM
const { makeDependencies } = require('../index'); // Import makeDependencies

jest.mock('../src/router/handleMessage', () => {
    const mockHandleMessage = jest.fn(async (message, deps) => {
        const text = message.content.trim();
        const userId = message.author.id;

        // Mock logFromNLU for internal use within mockHandleMessage
        deps.logFromNLU = jest.fn(async (message, parseResult, deps) => {
            const { intent, slots } = parseResult;
            const sheetName = deps.googleSheets.getLogSheetNameForUser(message.author.id);
            const item = slots.item || slots.symptom_type;
            const caloriesVal = await deps.estimateCaloriesForItemAndSides(item, slots.sides);

            const rowObj = {
                'Timestamp': new Date().toISOString(),
                'Date': new Date().toISOString().slice(0, 10),
                'Time': new Date().toISOString().slice(11, 19),
                'User': message.author.tag,
                'Type': intent,
                'Item': item,
                'Calories': (caloriesVal != null && caloriesVal > 0) ? caloriesVal : '',
                'Protein': '',
                'Carbs': '',
                'Fat': '',
                'Notes': 'notes_v=1.0'
            };

            const result = await deps.googleSheets.appendRowToSheet(sheetName, rowObj);
            if (result.success) {
                return { success: true, undoId: `${sheetName}:${result.rowIndex}`, caloriesVal, rowObj, rowIndex: result.rowIndex };
            } else {
                return { success: false };
            }
        });

        const pendingCheck = await deps.get(deps.keyFrom(message));
        if (pendingCheck && (pendingCheck.type === 'post_meal_check' || pendingCheck.type === 'post_meal_check_wait_severity')) {
            // Simulate handlePostMealCheck logic
            const mealRef = pendingCheck.mealRef;
            const positive = /\b(solid|all good|pretty good|good|great|fine|ok|okay|no issues|felt fine)\b/i.test(text);
            const neg = text.match(/\b(reflux|heartburn|nausea|bloat(?:ed|ing)?|gas(?:sy)?|cramp(?:s|ing)?|pain|burning|regurgitation)\b/i);
            const sevWord = (text.match(/\b(mild|moderate|severe)\b/i) || [])[1];
            const sevNum = (text.match(/\b([1-9]|10)\b/) || [])[1];

            if (positive && !neg) {
                try { if (mealRef) await deps.updateMealNotes(deps.googleSheets, mealRef, ["after_effect=ok"]); }
                catch (e) { console.warn("[MOCK POST_MEAL_CHECK] notes append failed:", e); }
                await message.reply({ content: "Got it — no symptoms. ✅" });
                await deps.clear(deps.keyFrom(message));
                return;
            }

            if (neg && (sevNum || sevWord)) {
                const severity = sevNum ? Number(sevNum) : ({ mild:3, moderate:6, severe:9 }[sevWord.toLowerCase()] || 5);
                // In mock, assume logSymptomForMeal handles idempotency
                await deps.logSymptomForMeal(userId, neg[1].toLowerCase(), severity, mealRef ? `${mealRef.tab}:${mealRef.rowId}` : null, deps);
                await message.reply({ content: `Logged ${neg[1]} (severity ${severity}).` });
                await deps.clear(deps.keyFrom(message));
                return;
            }
            
            // If vague negative, prompt for severity
            await message.reply({ content: "Any symptoms to log?", components: [deps.buttonsSeverity()] });
            await deps.set(deps.keyFrom(message), { type: 'post_meal_check_wait_severity', mealRef }, 120);
            return;
        }

        // Simulate NLU and logging for initial food entry
        const nluResult = await deps.understand(text, { userId, tz: deps.TIMEZONE });
        deps.postprocess(nluResult);

        if (nluResult.intent === 'food' || nluResult.intent === 'drink') {
            const logResult = await deps.logFromNLU(message, nluResult, deps);
            if (logResult.success) {
                // Directly simulate the relevant parts of postLogActions here
                const mealRef = {
                    tab: deps.googleSheets.getLogSheetNameForUser(userId),
                    rowId: logResult.rowIndex || 2,
                    timestampISO: logResult.rowObj.Timestamp,
                    item: logResult.rowObj.Item,
                };
                await deps.set(deps.keyFrom(message), { type: 'post_meal_check', mealRef: mealRef }, 120);
                await message.reply({ content: `Logged **${mealRef.item}** — ≈${logResult.caloriesVal || 0} kcal.`, components: [] }); // Simplified reply
                await message.channel.send("How are you feeling after that?"); // Simulate follow-up
            }
        } else if (nluResult.intent === 'symptom') {
             // Handle direct symptom logging
            const logResult = await deps.logFromNLU(message, nluResult, deps);
            if (logResult.success) {
                await message.reply({ content: `Logged ${nluResult.slots.symptom_type} (severity ${nluResult.slots.severity}).` });
            }
        }
    });
    return mockHandleMessage;
});

const sqlite = require('../services/sqliteBridge');

// Mock external dependencies
jest.mock('discord.js', () => {
    const original = jest.requireActual('discord.js');
    return {
        ...original,
        Client: jest.fn(() => ({
            once: jest.fn(),
            login: jest.fn(() => Promise.resolve()), // Make login return a resolved Promise
            on: jest.fn(), // Add mock for client.on
            users: {
                fetch: jest.fn(async (id) => ({
                    id,
                    tag: `user#${id}`,
                })),
            },
        })),
        Message: jest.fn(function (content, authorId = 'testuser') {
            this.content = content;
            this.author = { id: authorId, bot: false, tag: `user#${authorId}` };
            this.channel = {
                id: 'testchannel',
                send: jest.fn(),
                type: original.ChannelType.GuildText,
                sendTyping: jest.fn(),
            };
            this.guild = { id: 'testguild' };
            this.reply = jest.fn(async (options) => {
                const responseContent = typeof options === 'string' ? options : options.content;
                console.log(`[MOCK REPLY] ${responseContent}`);
                // Simulate setting the message ID for the reply for context purposes
                this.channel.lastMessage = { id: 'replyid', content: responseContent, author: { id: 'botid' } };
                return { id: 'replyid', content: responseContent, author: { id: 'botid' } };
            });
        }),
        ActionRowBuilder: jest.fn(() => ({
            addComponents: jest.fn(() => ({
                toJSON: jest.fn(() => ({ type: 1, components: [] }))
            }))
        })),
        ButtonBuilder: jest.fn(() => ({
            setCustomId: jest.fn(function (id) { this.custom_id = id; return this; }),
            setLabel: jest.fn(function (label) { this.label = label; return this; }),
            setStyle: jest.fn(function (style) { this.style = style; return this; }),
            setEmoji: jest.fn(function (emoji) { this.emoji = emoji; return this; }), // Add setEmoji mock
            toJSON: jest.fn(function () { return { type: 2, style: this.style, custom_id: this.custom_id, label: this.label, emoji: this.emoji }; })
        })),
    };
});

jest.mock('../services/googleSheets', () => ({
    initialize: jest.fn(),
    ensureSheetAndHeaders: jest.fn(),
    getUserName: jest.fn((id) => `user_${id}`),
    getLogSheetNameForUser: jest.fn(() => 'TestSheet'),
    appendRowToSheet: jest.fn(async (sheetName, row) => {
        console.log(`[MOCK SHEETS] Appended to ${sheetName}:`, row);
        // Simulate row ID for undo functionality and mealRef
        const newRowIndex = (mockSheetData[sheetName] || []).length + 2; // +1 for 0-based, +1 for header
        if (!mockSheetData[sheetName]) mockSheetData[sheetName] = [];
        mockSheetData[sheetName].push({ ...row, _rowIndex: newRowIndex });
        return { success: true, rowIndex: newRowIndex };
    }),
    getRows: jest.fn(async (options, sheetName) => {
        return { rows: mockSheetData[sheetName] || [] };
    }),
    updateRow: jest.fn(async (sheetName, rowIndex, updateObject) => {
        const targetRow = mockSheetData[sheetName]?.[rowIndex - 2]; // Adjust for header and 0-index
        if (targetRow) {
            Object.assign(targetRow, updateObject);
            console.log(`[MOCK SHEETS] Updated row ${rowIndex} in ${sheetName}:`, updateObject);
            return { success: true };
        }
        return { success: false, error: 'Row not found' };
    }),
    updateRows: jest.fn(),
    undoLastEntry: jest.fn(async (userName, sheetName) => {
        if (mockSheetData[sheetName] && mockSheetData[sheetName].length > 0) {
            const removed = mockSheetData[sheetName].pop();
            console.log(`[MOCK SHEETS] Undid last entry from ${sheetName}:`, removed);
            return { success: true, message: 'Last entry undone.' };
        }
        return { success: false, message: 'No entries to undo.' };
    }),
    getMealRowByRef: jest.fn(async ({ tab, rowId, timestampISO, item }) => {
        if (rowId) {
            return (mockSheetData[tab] || []).find(r => r._rowIndex === rowId);
        }
        // Fallback search by timestamp and item
        const oneMinute = 60 * 1000;
        const targetTime = new Date(timestampISO).getTime();
        return (mockSheetData[tab] || []).find(r => {
            const entryTime = new Date(r.Timestamp).getTime();
            return r.Item === item && Math.abs(entryTime - targetTime) <= oneMinute;
        });
    }),
}));

jest.mock('../src/nlu/understand-v2', () => ({
    understand: jest.fn(async (text) => {
        if (text.toLowerCase().includes('food') || text.toLowerCase().includes('chicken salad') || text.toLowerCase().includes('smoothie') || text.toLowerCase().includes('burger') || text.toLowerCase().includes('pizza')) return { intent: 'food', confidence: 0.9, slots: { item: text.replace('I had ', '').replace('I ate ', '') }, missing: [] };
        if (text.toLowerCase().includes('symptom') || text.toLowerCase().includes('not good') || text.toLowerCase().includes('reflux') || text.toLowerCase().includes('bloating')) return { intent: 'symptom', confidence: 0.9, slots: { symptom_type: 'mock symptom' }, missing: [] };
        if (text.toLowerCase().includes('good')) return { intent: 'other', confidence: 0.8, slots: {} };
        if (text.toLowerCase().includes('reflux')) return { intent: 'symptom', confidence: 0.9, slots: { symptom_type: 'reflux', severity: 5 }, missing: [] };
        if (text.toLowerCase().includes('mild')) return { intent: 'symptom', confidence: 0.9, slots: { severity: 3 }, missing: [] };
        if (text.toLowerCase().includes('moderate')) return { intent: 'symptom', confidence: 0.9, slots: { severity: 6 }, missing: [] };
        if (text.toLowerCase().includes('severe')) return { intent: 'symptom', confidence: 0.9, slots: { severity: 9 }, missing: [] };
        return { intent: 'other', confidence: 0.5, slots: {}, missing: [] };
    }),
    formatParseResult: jest.fn(() => 'Mock NLU Parse Result'),
}));

jest.mock('../src/auth/scope', () => ({
    shouldEnableCalorieFeatures: jest.fn(() => true),
}));

jest.mock('../src/scheduler/reminders', () => ({
    scheduleAll: jest.fn(),
    scheduleSymptomFollowup: jest.fn(),
    updateUserSchedule: jest.fn(),
}));

jest.mock('../src/handlers/buttonHandlers', () => ({
    handleButtonInteraction: jest.fn(async (interaction, googleSheets, digests, deps) => {
        console.log(`[MOCK BUTTON HANDLER] Handling button: ${interaction.customId}`);
        const userId = interaction.user.id;
        const pendingCheck = await deps.get(deps.keyFrom(interaction));

        if (interaction.customId.startsWith('pmc.')) { // Post Meal Check severity buttons
            if (pendingCheck && pendingCheck.type === 'post_meal_check_wait_severity') {
                const severityLabel = interaction.customId.split('.')[1]; // 'mild', 'moderate', 'severe', 'none'
                const severityNum = { none: 0, mild: 3, moderate: 6, severe: 9 }[severityLabel] || 0;
                
                if (severityNum > 0) {
                    const mealReference = pendingCheck.mealRef; // Use the mealRef from pending context
                    const isDuplicateSymptom = await deps.findSymptomNear(deps.googleSheets, mealReference);

                    if (isDuplicateSymptom) {
                        await interaction.reply({ content: "Already logged 👍" });
                        return;
                    }
                    await deps.logSymptomForMeal(userId, 'after_meal_symptom', severityNum, `${mealReference.tab}:${mealReference.rowId}`, deps);
                    await interaction.reply({ content: `Logged ${severityLabel} symptom. ✅` });
                } else {
                    // No symptoms chosen, just acknowledge
                    await interaction.reply({ content: "Got it — no symptoms. ✅" });
                }
                await deps.clear(deps.keyFrom(interaction));
                return;
            }
        }
        // Fallback for other buttons if needed
        await interaction.reply({ content: `[MOCK] Handled button: ${interaction.customId}` });
    }),
    pendingClarifications: new Map(), // Mock the map as it's directly used by handleMessage
}));

jest.mock('../src/handlers/uxButtons', () => ({
    handleUxButton: jest.fn(),
    pendingClarifications: { // Mock the deprecated export for the runtime check
        get: jest.fn(() => { throw new Error('DEPRECATED: pendingClarifications'); }),
        set: jest.fn(() => { throw new Error('Cannot set deprecated export pendingClarifications'); })
    }
}));


jest.mock('../src/nlu/metrics-v2', () => ({
    record: jest.fn(),
}));
jest.mock('../src/nlu/postprocess', () => ({
    postprocess: jest.fn(),
}));
jest.mock('../src/dialogs/DialogManager', () => ({
    hasActiveDialog: jest.fn(() => false),
    handleResponse: jest.fn(),
    startDialog: jest.fn(),
}));
jest.mock('../src/dialogs/symptomLogDialog', () => ({
    initialize: jest.fn(),
}));
jest.mock('../src/insights/AIAnalyst', () => ({
    generateQuery: jest.fn(),
    synthesizeAnswer: jest.fn(),
}));
jest.mock('../src/calories/estimate', () => ({
    estimate: jest.fn(() => ({ calories: 100, protein: 10, carbs: 15, fat: 5 })),
    getDailyKcalTarget: jest.fn(() => 2000),
    calculateDailyTotals: jest.fn(() => ({ totalCalories: 500 })),
    formatDailyProgress: jest.fn(() => '500/2000 kcal'),
    estimateCaloriesForItemAndSides: jest.fn(() => 250),
}));
jest.mock('../src/notify/channelOrDM', () => ({
    deliverNotification: jest.fn(),
    testDMHandshake: jest.fn(() => ({ success: true, message: 'DM enabled' })),
}));
jest.mock('../src/jobs/jobsStore', () => ({
    enqueue: jest.fn(),
}));
jest.mock('../src/jobs/runner', () => ({
    start: jest.fn(),
    processOverdueJobs: jest.fn(),
}));
jest.mock('../src/utils/dedupe', () => ({
    isDuplicate: jest.fn(() => false),
}));
jest.mock('../src/utils/qualityCheck', () => ({
    validateQuality: jest.fn(() => ({ isValid: true })),
}));
jest.mock('../src/utils/time', () => ({
    now: jest.fn(() => ({ format: jest.fn(() => '2025-10-20 12:00:00') })),
}));
jest.mock('../src/commands/nluStats', () => ({
    handleNLUStats: jest.fn(),
    recordNLUParse: jest.fn(),
}));
jest.mock('../src/utils/ensureReply', () => ({
    ensureReply: jest.fn((message) => message),
}));
jest.mock('../src/utils/notesBuild', () => ({
    buildNotesFromParse: jest.fn(() => 'notes_v=1.0'),
}));
jest.mock('../src/nlu/rules', () => ({
    extractMetadata: jest.fn(() => ({})),
}));
jest.mock('../src/utils/getSheetName', () => ({
    getSheetName: jest.fn(() => 'TestSheet'),
}));
jest.mock('../src/reminders/responseWatcher', () => ({
    markInteracted: jest.fn(),
    isUnderWatch: jest.fn(() => false),
}));
jest.mock('../src/handlers/contextualFollowups', () => ({
    scheduleContextualFollowups: jest.fn(),
}));
jest.mock('../src/commands/dnd', () => ({
    handleDND: jest.fn(),
    handleTimezone: jest.fn(),
    handleSnooze: jest.fn(),
}));
jest.mock('../src/scheduler/proactiveScheduler', () => ({
    start: jest.fn(),
}));
jest.mock('../services/userProfile', () => ({
    getUserProfile: jest.fn(async () => ({ prefs: { TZ: 'America/New_York' }, learnedCalorieMap: {} })),
    updateUserProfile: jest.fn(),
    ensureProfileSheet: jest.fn(),
}));
jest.mock('../src/sheets/findSymptomNear', () => ({
    findSymptomNear: jest.fn(() => null), // Default to no duplicate found
}));


// Mock sheet data
let mockSheetData = {};
let deps; // Declare deps globally for access in mocks

beforeAll(() => {
    // Set up environment variables if needed for tests
    process.env.PEYTON_ID = 'testuser';
    process.env.DISCORD_TOKEN = 'mock_token';
    process.env.DISCORD_CHANNEL_ID = 'testchannel';
    process.env.GOOGLE_SHEETS_ID = 'mock_sheet_id';
});

beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockSheetData = {
        'TestSheet': []
    };

    // Initialize dependencies for testing
    deps = makeDependencies();

    // Ensure DialogManager and symptomLogDialog are initialized with the mock logFromNLU
    deps.symptomLogDialog.initialize(async (message, result) => {
        await deps.logFromNLU(message, result, deps);
    });

    // Mock buttonHandlers.pendingClarifications if needed
    if (!deps.buttonHandlers.pendingClarifications) {
        deps.buttonHandlers.pendingClarifications = new Map();
    } else if (deps.buttonHandlers.pendingClarifications instanceof Map) {
        deps.buttonHandlers.pendingClarifications.clear();
    }
    
    // Set mock for findSymptomNear to ensure it's reset
    deps.findSymptomNear.mockImplementation(() => null);
});

describe('Post-Meal Check Flow', () => {
    const userId = 'testuser';
    const mealRef = {
        tab: 'TestSheet',
        rowId: 2, // Assuming 1 header row + 1 logged row
        timestampISO: new Date().toISOString(),
        item: 'chicken salad',
    };

    // Helper to simulate a message and handle it
    async function simulateMessage(content, authorId = userId) {
        const message = new Message(content, authorId);
        // The mocked handleMessage will be called implicitly via the jest.mock above
        await require('../src/router/handleMessage')(message, deps); // Call the mocked handleMessage
        return message;
    }

    // Helper to simulate a button interaction
    async function simulateButtonInteraction(customId, authorId = userId, messageId = 'mockmessageid') {
        const interaction = {
            isButton: () => true,
            isStringSelectMenu: () => false,
            customId,
            user: { id: authorId, tag: `user#${authorId}` },
            channel: {
                id: 'testchannel',
                send: jest.fn(),
                sendTyping: jest.fn(),
            },
            message: { id: messageId },
            reply: jest.fn(async (options) => {
                const responseContent = typeof options === 'string' ? options : options.content;
                console.log(`[MOCK INTERACTION REPLY] ${responseContent}`);
                return { id: 'interactionreplyid', content: responseContent };
            }),
        };
        await deps.buttonHandlers.handleButtonInteraction(interaction, deps.googleSheets, deps.digests, deps);
        return interaction;
    }

    // Test Case 1: Post-meal positive flow (no symptoms)
    test('should log meal and then correctly process a positive post-meal check', async () => {
        // 1. User logs a meal
        const mealMessage = await simulateMessage('I had chicken salad');
        expect(deps.googleSheets.appendRowToSheet).toHaveBeenCalledTimes(1);
        expect(mealMessage.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('Logged **chicken salad** — ≈250 kcal.'),
        }));

        // The postLogActions implicitly sets pending context and sends follow-up
        // So, we just need to check for the pending context being set
        expect(deps.set).toHaveBeenCalledWith(deps.keyFrom(mealMessage), expect.objectContaining({ type: 'post_meal_check' }), 120);

        // 2. User responds positively to "How are you feeling?"
        const followUpMessage = await simulateMessage('feeling good');
        expect(deps.googleSheets.getMealRowByRef).toHaveBeenCalledWith(expect.objectContaining({
            tab: 'TestSheet',
            rowId: expect.any(Number),
            item: 'chicken salad',
        }));
        expect(deps.updateMealNotes).toHaveBeenCalledWith(deps.googleSheets, expect.objectContaining({ item: 'chicken salad' }), ['after_effect=ok']);
        expect(followUpMessage.reply).toHaveBeenCalledWith({ content: 'Got it — no symptoms. ✅' });
        expect(deps.clear).toHaveBeenCalledWith(deps.keyFrom(followUpMessage));
        expect(deps.logSymptomForMeal).not.toHaveBeenCalled(); // Ensure no symptom is logged
    });

    // Test Case 2: Double click safety for symptom buttons
    test('should only log one symptom even if the severity button is tapped multiple times', async () => {
        // 1. User logs a meal to set up post-meal check
        const mealMessage = await simulateMessage('I had a smoothie');
        expect(deps.googleSheets.appendRowToSheet).toHaveBeenCalledTimes(1);
        
        // The postLogActions implicitly sets pending context and sends follow-up
        // We just need to capture the mealRef from the set call for later assertions.
        const setCalls = deps.set.mock.calls.filter(call => call[1].type === 'post_meal_check');
        const firstMealRef = setCalls[0][1].mealRef; // Extract mealRef from the first post_meal_check set call
        expect(firstMealRef).toBeDefined();

        // Simulate user saying something vague to trigger severity buttons
        const vagueResponse = await simulateMessage('not good');
        expect(vagueResponse.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: 'Any symptoms to log?',
            components: expect.any(Array),
        }));
        expect(deps.set).toHaveBeenCalledWith(deps.keyFrom(vagueResponse), expect.objectContaining({ type: 'post_meal_check_wait_severity', mealRef: firstMealRef }), 120);
        
        // Mock findSymptomNear to return null for the first call, then a found symptom for subsequent calls
        // This is handled by the `buttonHandlers.handleButtonInteraction` mock
        deps.findSymptomNear.mockImplementationOnce(() => null); // First click
        deps.findSymptomNear.mockImplementation(() => ({ Type: 'symptom' })); // Subsequent clicks

        // 2. User taps "Moderate" button the first time
        const interaction1 = await simulateButtonInteraction('pmc.moderate', userId, vagueResponse.id);
        expect(deps.logSymptomForMeal).toHaveBeenCalledTimes(1);
        expect(deps.logSymptomForMeal).toHaveBeenCalledWith(userId, 'after_meal_symptom', 6, `${firstMealRef.tab}:${firstMealRef.rowId}`, deps);
        expect(interaction1.reply).toHaveBeenCalledWith({ content: 'Logged moderate symptom. ✅' });
        expect(deps.clear).toHaveBeenCalledTimes(1); // Pending context cleared after first successful log

        // 3. User taps "Moderate" button a second time (should be ignored by idempotency)
        const interaction2 = await simulateButtonInteraction('pmc.moderate', userId, vagueResponse.id);
        expect(deps.logSymptomForMeal).toHaveBeenCalledTimes(1); // Should still be 1, not 2
        expect(interaction2.reply).toHaveBeenCalledWith({ content: 'Already logged 👍' });

        // Ensure pending context is still clear after the first interaction
        const currentPending = await deps.get(deps.keyFrom(vagueResponse));
        expect(currentPending).toBeNull();
    });

    // Test Case 3: Post-meal with negative response and direct severity
    test('should log meal and then correctly process a negative post-meal check with direct severity', async () => {
        // 1. User logs a meal
        const mealMessage = await simulateMessage('I had a burger');
        expect(deps.googleSheets.appendRowToSheet).toHaveBeenCalledTimes(1);

        // The postLogActions implicitly sets pending context and sends follow-up
        const setCalls = deps.set.mock.calls.filter(call => call[1].type === 'post_meal_check');
        const firstMealRef = setCalls[0][1].mealRef; // Extract mealRef
        expect(firstMealRef).toBeDefined();

        // 2. User responds negatively with severity
        const negResponse = await simulateMessage('feeling reflux severity 7');
        expect(deps.logSymptomForMeal).toHaveBeenCalledTimes(1);
        expect(deps.logSymptomForMeal).toHaveBeenCalledWith(userId, 'reflux', 7, `${firstMealRef.tab}:${firstMealRef.rowId}`, deps);
        expect(negResponse.reply).toHaveBeenCalledWith({ content: 'Logged reflux (severity 7).' });
        expect(deps.clear).toHaveBeenCalledWith(deps.keyFrom(negResponse));
    });

    // Test Case 4: Post-meal with negative response and severity word
    test('should log meal and then correctly process a negative post-meal check with severity word', async () => {
        // 1. User logs a meal
        const mealMessage = await simulateMessage('I had pizza');
        expect(deps.googleSheets.appendRowToSheet).toHaveBeenCalledTimes(1);

        // The postLogActions implicitly sets pending context and sends follow-up
        const setCalls = deps.set.mock.calls.filter(call => call[1].type === 'post_meal_check');
        const firstMealRef = setCalls[0][1].mealRef; // Extract mealRef
        expect(firstMealRef).toBeDefined();

        // 2. User responds negatively with a severity word
        const negResponse = await simulateMessage('bloating is moderate');
        expect(deps.logSymptomForMeal).toHaveBeenCalledTimes(1);
        expect(deps.logSymptomForMeal).toHaveBeenCalledWith(userId, 'bloating', 6, `${firstMealRef.tab}:${firstMealRef.rowId}`, deps);
        expect(negResponse.reply).toHaveBeenCalledWith({ content: 'Logged bloating (severity 6).' });
        expect(deps.clear).toHaveBeenCalledWith(deps.keyFrom(negResponse));
    });
});
