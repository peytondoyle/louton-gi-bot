/**
 * UX Button Interaction Handler
 * Routes and handles all ux:* button interactions
 */

const { buildPortionPicker, buildBrandPicker, getBrandsForCategory } = require('../ui/chips');
const { parsePortion } = require('../nutrition/portionParser');
const { findBrandInfo } = require('../nutrition/brandLexicon');
const { estimateCaloriesForItemAndSides } = require('../nutrition/estimateCalories');

/**
 * Detect category from row details to show appropriate brand options
 * @param {string} sheetName - Sheet name
 * @param {number} rowIndex - Row index
 * @param {Object} deps - Dependencies
 * @returns {string} - Detected category
 */
async function detectCategoryFromDetails(sheetName, rowIndex, deps) {
    try {
        // Get the row data
        const result = await deps.googleSheets.getRows({}, sheetName);
        if (!result.success || !result.rows[rowIndex - 2]) {
            return 'generic';
        }

        const row = result.rows[rowIndex - 2];
        const details = (row.Details || row.Item || '').toLowerCase();
        
        // Category detection patterns
        if (details.includes('oat milk') || details.includes('oatmilk') || details.includes('oats')) {
            return 'oat_milk';
        }
        
        if (details.includes('almond milk') || details.includes('almondmilk')) {
            return 'almond_milk';
        }
        
        if (details.includes('chai') || details.includes('chai tea') || details.includes('chai latte')) {
            return 'chai';
        }
        
        if (details.includes('cereal') || details.includes('cheerios') || details.includes('life') || 
            details.includes('granola') || details.includes('kix') || details.includes('breakfast')) {
            return 'cereal';
        }
        
        // Default to generic
        return 'generic';
    } catch (error) {
        console.warn('[UX] Error detecting category:', error.message);
        return 'generic';
    }
}

// Import new pending context service
const pending = require('../../services/pending');
const TTL_SECONDS = 120; // 2 minutes, matching old PENDING_TTL_MS

/**
 * Main router for ux:* button interactions
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Object} deps - Dependencies { googleSheets, sendCleanReply, getLogSheetNameForUser }
 */
async function handleUxButton(interaction, deps) {
    const { customId } = interaction;
    const userId = interaction.user.id;

    console.log(`[UX] Button interaction: ${customId} from user ${userId}`);

    try {
        if (customId.startsWith('ux:undo:')) {
            await handleUndo(interaction, deps);
        } else if (customId.startsWith('ux:add_portion:')) {
            await handleAddPortion(interaction, deps);
        } else if (customId.startsWith('ux:add_brand:')) {
            await handleAddBrand(interaction, deps);
        } else if (customId.startsWith('ux:add_photo:')) {
            await handleAddPhoto(interaction, deps);
        } else if (customId.startsWith('ux:portion:')) {
            await handlePortionSelection(interaction, deps);
        } else if (customId.startsWith('ux:brand:')) {
            await handleBrandSelection(interaction, deps);
        } else {
            await interaction.reply({
                content: '❌ Unknown action.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('[UX] Error handling button:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Something went wrong. Please try again.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('[UX] Failed to send error reply:', replyError);
        }
    }
}

/**
 * Handle Undo button (delete the logged row)
 */
async function handleUndo(interaction, deps) {
    const { googleSheets, getLogSheetNameForUser } = deps;
    const userId = interaction.user.id;
    const customId = interaction.customId;

    // Extract undoId (format: ux:undo:sheetName:rowIndex)
    const parts = customId.split(':');
    if (parts.length < 4) {
        await interaction.reply({
            content: '❌ Invalid undo reference.',
            ephemeral: true
        });
        return;
    }

    const sheetName = parts[2];
    const rowIndex = parseInt(parts[3], 10);

    console.log(`[UNDO] Attempting to delete row ${rowIndex} from ${sheetName}`);

    // Verify this sheet belongs to this user
    const userSheet = getLogSheetNameForUser(userId);
    if (sheetName !== userSheet) {
        await interaction.reply({
            content: '❌ You can only undo your own entries.',
            ephemeral: true
        });
        return;
    }

    try {
        // Soft delete: mark as deleted in Notes
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success || !result.rows[rowIndex - 2]) { // -2 for header
            await interaction.reply({
                content: '❌ Entry not found or already removed.',
                ephemeral: true
            });
            return;
        }

        const row = result.rows[rowIndex - 2];
        const currentNotes = row.Notes || '';
        const updatedNotes = currentNotes + (currentNotes ? ', ' : '') + 'deleted=true';

        await googleSheets.updateRow(sheetName, rowIndex, { Notes: updatedNotes });

        await interaction.reply({
            content: '✅ Entry undone successfully!',
            ephemeral: true
        });

        // Update the original message to remove buttons
        if (interaction.message) {
            await interaction.message.edit({
                components: []
            });
        }

        console.log(`[UNDO] ✅ Marked row ${rowIndex} as deleted in ${sheetName}`);
    } catch (error) {
        console.error('[UNDO] Error:', error);
        await interaction.reply({
            content: '❌ Failed to undo entry. Please try `!undo` command instead.',
            ephemeral: true
        });
    }
}

/**
 * Handle "Add portion" button (show portion picker)
 */
async function handleAddPortion(interaction, deps) {
    const userId = interaction.user.id;
    const customId = interaction.customId;
    const parts = customId.split(':');

    if (parts.length < 3) {
        await interaction.reply({ content: '❌ Invalid reference.', ephemeral: true });
        return;
    }

    const sheetName = parts[2];
    const rowIndex = parseInt(parts[3], 10);

    // Store pending state
    await pending.set(pending.keyFrom(interaction), { type: 'portion', data: { sheetName, rowIndex } }, TTL_SECONDS);

    await interaction.reply({
        content: '📏 Select a portion size:',
        components: buildPortionPicker(),
        ephemeral: true
    });
}

/**
 * Handle portion selection (from picker or custom)
 */
async function handlePortionSelection(interaction, deps) {
    const { googleSheets, getLogSheetNameForUser } = deps;
    const userId = interaction.user.id;
    const customId = interaction.customId;

    const pendingState = await pending.get(pending.keyFrom(interaction));
    if (!pendingState || pendingState.type !== 'portion' || !pendingState.data) {
        await interaction.reply({
            content: '❌ Session expired or invalid. Please log again.',
            ephemeral: true
        });
        return;
    }

    const { sheetName, rowIndex } = pendingState.data;

    // Handle custom portion
    if (customId === 'ux:portion:custom') {
        await interaction.reply({
            content: '✏️ Type your custom portion (e.g., "16oz", "grande", "3 slices"):',
            ephemeral: true
        });
        // Keep pending state, will be handled in message handler
        return;
    }

    // Handle canned portions
    const portionMap = {
        'ux:portion:canned:1c': '1 cup',
        'ux:portion:canned:half': '½ cup',
        'ux:portion:canned:2c': '2 cups',
        'ux:portion:canned:1slice': '1 slice',
        'ux:portion:canned:2slices': '2 slices',
        'ux:portion:canned:bowl': '1 bowl'
    };

    const portionText = portionMap[customId];
    if (!portionText) {
        await interaction.reply({ content: '❌ Unknown portion.', ephemeral: true });
        return;
    }

    await applyPortionUpdate(interaction, deps, sheetName, rowIndex, portionText);
    await pending.clear(pending.keyFrom(interaction));
}

/**
 * Apply portion update to row
 */
async function applyPortionUpdate(interaction, deps, sheetName, rowIndex, portionText) {
    const { googleSheets } = deps;

    try {
        // Parse portion
        const portion = parsePortion(portionText, 'food');

        // Get current row
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success || !result.rows[rowIndex - 2]) {
            await interaction.reply({ content: '❌ Entry not found.', ephemeral: true });
            return;
        }

        const row = result.rows[rowIndex - 2];
        let currentNotes = row.Notes || '';

        // Remove existing portion tokens
        currentNotes = currentNotes.replace(/,?\s*portion(?:_g|_ml)?=[^,]*/g, '');

        // Add new portion tokens
        const portionTokens = [];
        if (portion.raw) portionTokens.push(`portion=${portion.raw}`);
        if (portion.normalized_g) portionTokens.push(`portion_g=${portion.normalized_g}`);
        if (portion.normalized_ml) portionTokens.push(`portion_ml=${portion.normalized_ml}`);

        const updatedNotes = currentNotes + (currentNotes ? ', ' : '') + portionTokens.join(', ');

        // Recalculate calories if applicable
        let updates = { Notes: updatedNotes };

        if (row.Calories && portion.multiplier) {
            const baseCalories = parseFloat(row.Calories.replace(/[^\d.]/g, ''));
            if (!isNaN(baseCalories)) {
                const newCalories = Math.round(baseCalories * portion.multiplier);
                updates.Calories = `${newCalories}`;
                console.log(`[UX] Recalculated calories: ${baseCalories} × ${portion.multiplier} = ${newCalories}`);
            }
        }

        await googleSheets.updateRow(sheetName, rowIndex, updates);

        await interaction.reply({
            content: `✅ Updated portion to **${portionText}**!`,
            ephemeral: true
        });

        console.log(`[UX] Updated row ${rowIndex} with portion: ${portionText}`);
    } catch (error) {
        console.error('[UX] Error applying portion:', error);
        await interaction.reply({
            content: '❌ Failed to update portion.',
            ephemeral: true
        });
    }
}

/**
 * Handle "Add brand" button (show brand picker)
 */
async function handleAddBrand(interaction, deps) {
    const userId = interaction.user.id;
    const customId = interaction.customId;
    const parts = customId.split(':');

    if (parts.length < 3) {
        await interaction.reply({ content: '❌ Invalid reference.', ephemeral: true });
        return;
    }

    const sheetName = parts[2];
    const rowIndex = parseInt(parts[3], 10);

    // Store pending state
    await pending.set(pending.keyFrom(interaction), { type: 'brand', data: { sheetName, rowIndex } }, TTL_SECONDS);

    // Try to detect category from row details
    const category = await detectCategoryFromDetails(sheetName, rowIndex, deps);

    await interaction.reply({
        content: '🏷️ Select a brand:',
        components: buildBrandPicker(category),
        ephemeral: true
    });
}

/**
 * Handle brand selection
 */
async function handleBrandSelection(interaction, deps) {
    const { googleSheets } = deps;
    const userId = interaction.user.id;
    const customId = interaction.customId;

    const pendingState = await pending.get(pending.keyFrom(interaction));
    if (!pendingState || pendingState.type !== 'brand' || !pendingState.data) {
        await interaction.reply({
            content: '❌ Session expired or invalid. Please log again.',
            ephemeral: true
        });
        return;
    }

    const { sheetName, rowIndex } = pendingState.data;

    // Handle custom brand
    if (customId === 'ux:brand:custom') {
        await interaction.reply({
            content: '✏️ Type the brand name:',
            ephemeral: true
        });
        // Keep pending state
        return;
    }

    // Extract brand ID
    const brandId = customId.replace('ux:brand:', '');

    // Find brand value from ID
    const allBrands = [
        ...getBrandsForCategory('oat_milk'),
        ...getBrandsForCategory('almond_milk'),
        ...getBrandsForCategory('chai'),
        ...getBrandsForCategory('cereal'),
        ...getBrandsForCategory('generic')
    ];

    const brand = allBrands.find(b => b.id === brandId);
    if (!brand) {
        await interaction.reply({ content: '❌ Unknown brand.', ephemeral: true });
        return;
    }

    await applyBrandUpdate(interaction, deps, sheetName, rowIndex, brand.value);
    await pending.clear(pending.keyFrom(interaction));
}

/**
 * Apply brand update to row
 */
async function applyBrandUpdate(interaction, deps, sheetName, rowIndex, brandText) {
    const { googleSheets } = deps;

    try {
        // Get brand info and multipliers
        const brandInfo = findBrandInfo(brandText);

        // Get current row
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success || !result.rows[rowIndex - 2]) {
            await interaction.reply({ content: '❌ Entry not found.', ephemeral: true });
            return;
        }

        const row = result.rows[rowIndex - 2];
        let currentNotes = row.Notes || '';

        // Remove existing brand tokens
        currentNotes = currentNotes.replace(/,?\s*brand(?:_variant)?=[^,]*/g, '');
        currentNotes = currentNotes.replace(/,?\s*variant=[^,]*/g, '');

        // Add new brand tokens
        const brandTokens = [`brand_variant=${brandText}`];
        if (brandInfo && brandInfo.variant) {
            brandTokens.push(`variant=${brandInfo.variant}`);
        }

        const updatedNotes = currentNotes + (currentNotes ? ', ' : '') + brandTokens.join(', ');

        // Recalculate calories if brand has multiplier
        let updates = { Notes: updatedNotes };

        if (row.Calories && brandInfo && brandInfo.multiplier) {
            const baseCalories = parseFloat(row.Calories.replace(/[^\d.]/g, ''));
            if (!isNaN(baseCalories)) {
                const newCalories = Math.round(baseCalories * brandInfo.multiplier);
                updates.Calories = `${newCalories}`;
                console.log(`[UX] Recalculated calories with brand: ${baseCalories} × ${brandInfo.multiplier} = ${newCalories}`);
            }
        }

        await googleSheets.updateRow(sheetName, rowIndex, updates);

        await interaction.reply({
            content: `✅ Updated brand to **${brandText}**!`,
            ephemeral: true
        });

        console.log(`[UX] Updated row ${rowIndex} with brand: ${brandText}`);
    } catch (error) {
        console.error('[UX] Error applying brand:', error);
        await interaction.reply({
            content: '❌ Failed to update brand.',
            ephemeral: true
        });
    }
}

/**
 * Handle "Add photo" button
 */
async function handleAddPhoto(interaction, deps) {
    const userId = interaction.user.id;
    const customId = interaction.customId;
    const parts = customId.split(':');

    if (parts.length < 3) {
        await interaction.reply({ content: '❌ Invalid reference.', ephemeral: true });
        return;
    }

    const sheetName = parts[2];
    const rowIndex = parseInt(parts[3], 10);

    // Store pending state
    await pending.set(pending.keyFrom(interaction), { type: 'photo', data: { sheetName, rowIndex } }, TTL_SECONDS);

    await interaction.reply({
        content: '📸 Send a message with one or more photos in the next 2 minutes.',
        ephemeral: true
    });

    console.log(`[PHOTO] Waiting for photos from user ${userId}`);
}

/**
 * Handle photo message (called from main message handler)
 */
async function handlePhotoMessage(message, deps) {
    const { googleSheets } = deps;
    const userId = message.author.id;

    const pendingState = await pending.get(pending.keyFrom(message));
    if (!pendingState || pendingState.type !== 'photo' || !pendingState.data) return false;

    const { sheetName, rowIndex } = pendingState.data;

    if (message.attachments.size === 0) {
        return false; // Not a photo message
    }

    try {
        // Collect all image URLs
        const photos = [];
        message.attachments.forEach(attachment => {
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                photos.push(attachment.url);
            }
        });

        if (photos.length === 0) {
            await message.reply('❌ No images found in your message.');
            return true;
        }

        // Get current row
        const result = await googleSheets.getRows({}, sheetName);
        if (!result.success || !result.rows[rowIndex - 2]) {
            await message.reply('❌ Entry not found.');
            await pending.clear(pending.keyFrom(message));
            return true;
        }

        const row = result.rows[rowIndex - 2];
        let currentNotes = row.Notes || '';

        // Add photo tokens
        const photoTokens = photos.map((url, idx) => {
            return photos.length === 1 ? `photo=${url}` : `photo${idx + 1}=${url}`;
        });

        const updatedNotes = currentNotes + (currentNotes ? ', ' : '') + photoTokens.join(', ');

        await googleSheets.updateRow(sheetName, rowIndex, { Notes: updatedNotes });

        await message.reply(`✅ Added ${photos.length} photo(s) to your entry!`);

        console.log(`[PHOTO] Added ${photos.length} photos to row ${rowIndex}`);
        await pending.clear(pending.keyFrom(message));
        return true;
    } catch (error) {
        console.error('[PHOTO] Error handling photo:', error);
        await message.reply('❌ Failed to add photos.');
        await pending.clear(pending.keyFrom(message));
        return true;
    }
}

/**
 * Handle custom text input (portion or brand)
 */
async function handleCustomInput(message, deps) {
    const userId = message.author.id;
    const text = message.content.trim();

    // Check for pending portion
    const portionPendingState = await pending.get(pending.keyFrom(message));
    if (portionPendingState && portionPendingState.type === 'portion' && portionPendingState.data) {
        const { sheetName, rowIndex } = portionPendingState.data;
        await applyPortionUpdate({ reply: (opts) => message.reply(opts) }, deps, sheetName, rowIndex, text);
        await pending.clear(pending.keyFrom(message));
        return true;
    }

    // Check for pending brand
    const brandPendingState = await pending.get(pending.keyFrom(message));
    if (brandPendingState && brandPendingState.type === 'brand' && brandPendingState.data) {
        const { sheetName, rowIndex } = brandPendingState.data;
        await applyBrandUpdate({ reply: (opts) => message.reply(opts) }, deps, sheetName, rowIndex, text);
        await pending.clear(pending.keyFrom(message));
        return true;
    }

    return false;
}

module.exports = {
    handleUxButton,
    handlePhotoMessage,
    handleCustomInput
};

Object.defineProperty(module.exports, 'pendingClarifications', {
  get() {
    throw new Error(
      'DEPRECATED: pendingClarifications was removed. Use services/pending.js'
    );
  },
  set() {
    throw new Error('Cannot set deprecated export pendingClarifications');
},
  configurable: false,
  enumerable: false,
});
