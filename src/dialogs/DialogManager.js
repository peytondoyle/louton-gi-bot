const symptomLogDialog = require('./symptomLogDialog');
const db = require('../../services/sqliteBridge');

// This module no longer holds state. It is now a stateless controller
// that uses the database as its source of truth.

/**
 * Generates a unique key for storing a user's dialog state.
 * @param {string} userId - The Discord user ID.
 * @returns {string}
 */
const getKey = (userId) => `dialog:${userId}`;

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
        // The get function in sqliteBridge automatically handles expiry.
        return !!db.get(getKey(userId));
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
        };

        // Store the new state in the database with a 10-minute TTL
        db.set(getKey(userId), state, 600);

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
        const state = db.get(getKey(userId));

        if (!state) return;

        const script = DIALOG_SCRIPTS[state.currentDialog];
        if (!script) {
            console.error(`[DIALOG] No script found for active dialog: ${state.currentDialog}`);
            db.del(getKey(userId));
            return;
        }

        // Pass the current state and message to the script to handle
        const result = await script.handleStep(state, message);

        // If the dialog is complete, remove it from the database
        if (result.isComplete) {
            console.log(`[DIALOG] Dialog '${state.currentDialog}' completed for user ${userId}`);
            db.del(getKey(userId));
        } else {
            // Otherwise, update the state in the database
            db.set(getKey(userId), result.newState, 600);
        }
    },

    /**
     * Ends a dialog for a user manually.
     * @param {string} userId - The Discord user ID.
     */
    endDialog(userId) {
        db.del(getKey(userId));
        console.log(`[DIALOG] Manually ended dialog for user ${userId}`);
    }
};

module.exports = DialogManager;
