/**
 * Ensure Reply Shim
 * Guarantees message object has a reply() method
 * Prevents "message.reply is not a function" errors
 */

/**
 * Ensure message object has reply method
 * @param {Object} msg - Message or message-like object
 * @returns {Object} - Message with guaranteed reply() method
 */
function ensureReply(msg) {
    // If it's already a Message (has reply), do nothing
    if (msg && typeof msg.reply === 'function') {
        return msg;
    }

    // Otherwise, build a minimal facade that can still send
    const channel = msg?.channel;
    const send = channel && typeof channel.send === 'function'
        ? (opts) => channel.send(opts)
        : async () => {
            console.warn('[ensureReply] No channel to send - message dropped');
            return null;
        };

    return {
        ...msg,
        reply: (opts) => send(opts),
        author: msg?.author || { id: 'unknown', tag: 'unknown' }
    };
}

module.exports = { ensureReply };
