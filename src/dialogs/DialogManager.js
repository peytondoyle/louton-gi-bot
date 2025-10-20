const symptomLogDialog = require('./symptomLogDialog');

// This will hold the state of all active conversations.
// In a larger bot, this might be moved to a persistent store like Redis.
const activeDialogs = new Map(); // userId -> DialogState

/**
 * @typedef {Object} DialogState
 * @property {string} currentDialog - The name of the active dialog script (e.g., 'symptom_log').
 * @property {number} step - The current step in the dialog script.
 * @property {Object} context - The data collected so far (e.g., { severity: 8, symptom_type: 'pain' }).
 * @property {number} expiresAt - A timestamp for when the dialog state should expire.
 */

const DIALOG_SCRIPTS = {
    symptom_log: symptomLogDialog,
    // Future dialogs like 'meal_log' can be added here
};

const DialogManager = {
    /**
     * Checks if a user has an active conversation.
     * @param {string} userId - The Discord user ID.
     * @returns {boolean}
     */
    hasActiveDialog(userId) {
        const dialog = activeDialogs.get(userId);
        if (dialog && Date.now() > dialog.expiresAt) {
            activeDialogs.delete(userId);
            return false;
        }
        return !!dialog;
    },

    /**
     * Starts a new dialog with a user.
     * @param {string} dialogName - The name of the dialog to start.
     * @param {import('discord.js').Message} message - The message that triggered the dialog.
     * @param {Object} initialContext - Any initial data to populate the dialog context with.
     */
    async startDialog(dialogName, message, initialContext = {}) {
        const userId = message.author.id;
        const script = DIALOG_SCRIPTS[dialogName];

        if (!script) {
            console.error(`[DIALOG] Attempted to start unknown dialog: ${dialogName}`);
            return;
        }

        const state = {
            currentDialog: dialogName,
            step: 0,
            context: { ...initialContext, userId },
            expiresAt: Date.now() + 10 * 60 * 1000, // Dialog expires in 10 minutes
        };

        activeDialogs.set(userId, state);
        console.log(`[DIALOG] Starting dialog '${dialogName}' for user ${userId}`);

        // Execute the first step of the dialog
        await this.handleResponse(message);
    },

    /**
     * Processes a user's message as part of an active dialog.
     * @param {import('discord.js').Message} message - The user's reply.
     */
    async handleResponse(message) {
        const userId = message.author.id;
        const state = activeDialogs.get(userId);

        if (!state) return;

        const script = DIALOG_SCRIPTS[state.currentDialog];
        if (!script) {
            console.error(`[DIALOG] No script found for active dialog: ${state.currentDialog}`);
            activeDialogs.delete(userId);
            return;
        }

        // Pass the current state and message to the script to handle
        const result = await script.handleStep(state, message);

        // Update the state with the result from the script
        activeDialogs.set(userId, result.newState);

        // If the dialog is complete, remove it from the active list
        if (result.isComplete) {
            console.log(`[DIALOG] Dialog '${state.currentDialog}' completed for user ${userId}`);
            activeDialogs.delete(userId);
        }
    },

    /**
     * Ends a dialog for a user manually.
     * @param {string} userId - The Discord user ID.
     */
    endDialog(userId) {
        if (activeDialogs.has(userId)) {
            activeDialogs.delete(userId);
            console.log(`[DIALOG] Manually ended dialog for user ${userId}`);
        }
    }
};

module.exports = DialogManager;
