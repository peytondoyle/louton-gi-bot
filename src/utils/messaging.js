/**
 * Clean messaging utilities for Discord bot
 * Replaces message.reply() to avoid gray reply bars while maintaining mentions
 */

/**
 * Send a clean message to the channel with user mention (no reply UI)
 * @param {Message} message - The original Discord message object
 * @param {string|Object} content - Message content (string or embed object)
 * @param {Object} options - Additional options
 * @param {boolean} options.mention - Whether to mention the user (default: true)
 * @returns {Promise<Message>} The sent message
 */
async function sendCleanReply(message, content, options = {}) {
  try {
    const mentionUser = options.mention ?? true;
    const prefix = mentionUser ? `<@${message.author.id}> ` : '';
    let payload;

    // Handle string content
    if (typeof content === 'string') {
      payload = { content: prefix + content, ...options }; // Merge options for string content
    }
    // Handle embed or object content
    else if (typeof content === 'object' && !Array.isArray(content)) {
      payload = { ...content, ...options }; // Merge content and options
      // Only add prefix to content if it exists
      if (payload.content) {
        payload.content = prefix + payload.content;
      } else {
        payload.content = prefix;
      }
    }
    // Fallback for other types
    else {
      payload = { content: prefix + String(content), ...options };
    }

    // Normalize components to an array of action rows
    let rows = [];
    if (payload.components) {
      if (Array.isArray(payload.components)) {
        rows = payload.components;
      } else if (typeof payload.components === 'object') {
        rows = [payload.components]; // Wrap single action row
      }
      payload.components = rows;
    }

    return await message.channel.send(payload);
  } catch (err) {
    console.error('[MSG] ❌ Failed to sendCleanReply:', err);
    throw err;
  }
}

module.exports = { sendCleanReply };
