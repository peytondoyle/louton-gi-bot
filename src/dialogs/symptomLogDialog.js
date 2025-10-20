const { understand } = require('../nlu/understand-v2');
const { buttonsSeverity, buttonsSymptomType } = require('../ui/components');
const { EMOJI } = require('../constants/ux');

// This is a placeholder for where the actual logging function will be.
// We'll pass it in from index.js to avoid circular dependencies.
let logFunction = async () => console.error('[DIALOG] Log function not initialized!');

const symptomLogDialog = {
    // A function to set the logger dependency from index.js
    initialize(logger) {
        logFunction = logger;
    },

    /**
     * Handles the current step of the symptom logging dialog.
     * @param {import('./DialogManager').DialogState} state - The current state of the dialog.
     * @param {import('discord.js').Message} message - The user's message.
     * @returns {Promise<{newState: import('./DialogManager').DialogState, isComplete: boolean}>}
     */
    async handleStep(state, message) {
        // First, try to parse the user's message for any and all relevant information.
        // This allows the user to answer multiple questions at once.
        if (state.step > 0) { // Don't parse the initial trigger message
            await this.parseResponse(state, message.content);
        }

        // Now, ask the next required question.
        let isComplete = false;
        if (!state.context.symptom_type) {
            await this.askSymptomType(message);
        } else if (!state.context.severity) {
            await this.askSeverity(message);
        } else {
            // All required info is gathered.
            isComplete = true;
            await this.completeDialog(state, message);
        }
        
        state.step++;
        return { newState: state, isComplete };
    },

    /**
     * Parses a user's free-text response to fill in any missing context.
     * @param {import('./DialogManager').DialogState} state - The current dialog state.
     * @param {string} text - The user's message content.
     */
    async parseResponse(state, text) {
        const result = await understand(text, { forcedIntent: 'symptom' });

        if (result.intent === 'symptom' || result.intent === 'reflux') {
            if (result.slots.symptom_type && !state.context.symptom_type) {
                state.context.symptom_type = result.slots.symptom_type;
                console.log(`[DIALOG] Parsed symptom_type: ${result.slots.symptom_type}`);
            }
            if (result.slots.severity && !state.context.severity) {
                state.context.severity = result.slots.severity;
                console.log(`[DIALOG] Parsed severity: ${result.slots.severity}`);
            }
            // Can be expanded to parse linked items, etc.
        }
    },

    async askSymptomType(message) {
        await message.reply({
            content: `${EMOJI.symptom} What kind of symptom is it?`,
            components: buttonsSymptomType(),
        });
    },

    async askSeverity(message) {
        await message.reply({
            content: `${EMOJI.thinking} Got it. And how severe is the ${state.context.symptom_type}? (1-10)`,
            components: buttonsSeverity(),
        });
    },

    /**
     * Completes the dialog and logs the final entry.
     * @param {import('./DialogManager').DialogState} state - The final dialog state.
     * @param {import('discord.js').Message} message - The last message from the user.
     */
    async completeDialog(state, message) {
        const finalParseResult = {
            intent: 'symptom',
            slots: {
                symptom_type: state.context.symptom_type,
                severity: state.context.severity,
                // Pass through any other context gathered
                ...state.context,
            },
            missing: [],
            confidence: 1.0, // We have high confidence after a dialog
        };

        await logFunction(message, finalParseResult);
    },
};

module.exports = symptomLogDialog;
