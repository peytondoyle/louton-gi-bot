/**
 * UX Chip Builders (Discord v14 Components)
 * Post-log quick actions: Undo, Add portion, Add brand, Add photo
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Build post-log action chips (shown after successful log)
 * @param {Object} options - { undoId, intent }
 * @returns {ActionRowBuilder[]} - Array of action rows with buttons
 */
function buildPostLogChips({ undoId, intent }) {
    const row = new ActionRowBuilder();

    // Show different chips based on intent
    const isFood = intent === 'food' || intent === 'drink';

    if (isFood) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`ux:add_portion:${undoId}`)
                .setLabel('Add portion')
                .setEmoji('📏')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`ux:add_brand:${undoId}`)
                .setLabel('Add brand')
                .setEmoji('🏷️')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`ux:add_photo:${undoId}`)
                .setLabel('Add photo')
                .setEmoji('📸')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    // Always show Undo
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`ux:undo:${undoId}`)
            .setLabel('Undo')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Danger)
    );

    return [row];
}

/**
 * Build portion picker chips (common portions)
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
function buildPortionPicker() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ux:portion:canned:1c')
            .setLabel('1 cup')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('ux:portion:canned:half')
            .setLabel('½ cup')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('ux:portion:canned:2c')
            .setLabel('2 cups')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('ux:portion:canned:1slice')
            .setLabel('1 slice')
            .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ux:portion:canned:2slices')
            .setLabel('2 slices')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('ux:portion:canned:bowl')
            .setLabel('1 bowl')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('ux:portion:custom')
            .setLabel('Custom...')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

/**
 * Build brand picker chips (category-specific common brands)
 * @param {string} category - Detected category (oat_milk, chai, cereal, etc.)
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
function buildBrandPicker(category = 'generic') {
    const brands = getBrandsForCategory(category);

    const row = new ActionRowBuilder();

    brands.slice(0, 4).forEach(brand => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`ux:brand:${brand.id}`)
                .setLabel(brand.label)
                .setStyle(ButtonStyle.Primary)
        );
    });

    // Always add "Other..." option
    if (brands.length >= 4) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('ux:brand:custom')
                .setLabel('Other...')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    return [row];
}

/**
 * Get common brands for a category
 * @param {string} category - Category name
 * @returns {Array<{id: string, label: string, value: string}>}
 */
function getBrandsForCategory(category) {
    const brandMap = {
        oat_milk: [
            { id: 'oatly_barista', label: 'Oatly Barista', value: 'oatly barista' },
            { id: 'oatly_unsweetened', label: 'Oatly Unsweetened', value: 'oatly unsweetened' },
            { id: 'planet_oat', label: 'Planet Oat', value: 'planet oat' },
            { id: 'chobani', label: 'Chobani Oat', value: 'chobani oat' }
        ],
        almond_milk: [
            { id: 'almond_breeze', label: 'Almond Breeze', value: 'almond breeze unsweetened' },
            { id: 'silk', label: 'Silk Almond', value: 'silk almond unsweetened' },
            { id: 'califia', label: 'Califia', value: 'califia almond' }
        ],
        chai: [
            { id: 'oregon_chai', label: 'Oregon Chai', value: 'oregon chai original' },
            { id: 'tazo', label: 'Tazo', value: 'tazo chai concentrate' },
            { id: 'pacific', label: 'Pacific', value: 'pacific chai' }
        ],
        cereal: [
            { id: 'life', label: 'Life', value: 'life cereal' },
            { id: 'cheerios', label: 'Cheerios', value: 'cheerios' },
            { id: 'kix', label: 'Kix', value: 'kix' },
            { id: 'granola', label: 'Granola', value: 'granola' }
        ],
        generic: [
            { id: 'starbucks', label: 'Starbucks', value: 'starbucks' },
            { id: 'trader_joes', label: "Trader Joe's", value: "trader joe's" },
            { id: 'whole_foods', label: 'Whole Foods', value: 'whole foods' }
        ]
    };

    return brandMap[category] || brandMap.generic;
}

module.exports = {
    buildPostLogChips,
    buildPortionPicker,
    buildBrandPicker,
    getBrandsForCategory
};
