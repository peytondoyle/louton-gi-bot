/**
 * Interactive Command Palette
 * Browsable, filterable, searchable command documentation
 * Auto-generated from CommandRegistry
 */

const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ComponentType, ButtonBuilder, ButtonStyle } = require('discord.js');
const { CommandRegistry } = require('./registry');

/**
 * Chunk array into pages
 */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Format command for display
 */
function fmtCommand(c) {
  const aliases = c.aliases?.length ? ` (${c.aliases.join(', ')})` : '';
  const usage = c.usage?.length ? `\n**Usage:** ${c.usage.join(' • ')}` : '';
  const subs = c.subcommands?.length
    ? `\n**Subcommands:** ` + c.subcommands.map(s => `\`${s.name}\``).join(', ')
    : '';
  const ex = c.examples?.length ? `\n**Examples:** ${c.examples.map(e => '`' + e + '`').join(' • ')}` : '';

  return `**${c.name}**${aliases} — ${c.description}${subs}${usage}${ex}`;
}

/**
 * Build palette embed
 */
function buildEmbed({ title, items, page, pages, footerNote, query, category }) {
  const desc = items.map(fmtCommand).join('\n\n').slice(0, 4000) || '_No commands found._';

  const embed = new EmbedBuilder()
    .setTitle(title || '⚙️ Command Palette')
    .setDescription(desc)
    .setColor(0x5AC8FA)
    .setFooter({
      text: `${category ? `Category: ${category} • ` : ''}${pages > 1 ? `Page ${page}/${pages} • ` : ''}${footerNote || 'Type !help <search> to filter'}`
    });

  if (query) {
    embed.addFields({ name: 'Search Results', value: '`' + query + '`', inline: false });
  }

  return embed;
}

/**
 * Build category dropdown menu
 */
function buildCategoryMenu(selectedCat = null) {
  const cats = CommandRegistry.categories();
  const options = [
    { label: 'All Commands', value: '__all__', description: 'Show all commands' }
  ].concat(
    cats.map(c => ({ label: c, value: c, description: `View ${c} commands` }))
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('help:cat')
    .setPlaceholder('Filter by category...')
    .addOptions(options)
    .setMinValues(1)
    .setMaxValues(1);

  return new ActionRowBuilder().addComponents(menu);
}

/**
 * Build navigation buttons
 */
function buildNavRow(canPrev, canNext) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help:prev')
      .setLabel('← Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canPrev),
    new ButtonBuilder()
      .setCustomId('help:next')
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canNext)
  );
}

/**
 * Handle the palette command
 * @param {import('discord.js').Message} message - Discord message
 * @param {{ pageSize?: number }} opts - Options
 */
async function handleHelpPalette(message, opts = {}) {
  const pageSize = opts.pageSize || 6;

  // Parse search query from args
  const args = (message.content || '').trim().split(/\s+/).slice(1);
  const query = args.join(' ');

  // Initial source (all or search results)
  let source = query ? CommandRegistry.search(query) : CommandRegistry.all();
  let category = null;

  // Paginate
  let pages = chunk(source, pageSize);
  let pageIdx = 0;

  // Build initial embed
  const embed = buildEmbed({
    title: '⚙️ Command Palette',
    items: pages[pageIdx] || [],
    page: pageIdx + 1,
    pages: Math.max(1, pages.length),
    footerNote: 'Use dropdown to filter • Buttons to navigate • 60s timeout',
    query,
    category
  });

  // Send with components
  const msg = await message.channel.send({
    embeds: [embed],
    components: [
      buildCategoryMenu(category),
      buildNavRow(pageIdx > 0, pageIdx < pages.length - 1)
    ]
  });

  // Collectors
  const selectCollector = msg.createMessageComponentCollector({
    time: 60_000,
    componentType: ComponentType.StringSelect
  });

  const buttonCollector = msg.createMessageComponentCollector({
    time: 60_000,
    componentType: ComponentType.Button
  });

  // Handle category selection
  selectCollector.on('collect', async (interaction) => {
    // Ownership check
    if (interaction.user.id !== message.author.id) {
      return interaction.reply({ content: '❌ This palette belongs to someone else.', ephemeral: true });
    }

    const val = interaction.values?.[0] || '__all__';

    if (val === '__all__') {
      source = query ? CommandRegistry.search(query) : CommandRegistry.all();
      category = null;
    } else {
      source = CommandRegistry.byCategory(val);
      category = val;
    }

    pages = chunk(source, pageSize);
    pageIdx = 0;

    const newEmbed = buildEmbed({
      title: '⚙️ Command Palette',
      items: pages[pageIdx] || [],
      page: pageIdx + 1,
      pages: Math.max(1, pages.length),
      footerNote: 'Use dropdown to filter • Buttons to navigate • 60s timeout',
      query,
      category
    });

    await interaction.update({
      embeds: [newEmbed],
      components: [
        buildCategoryMenu(category),
        buildNavRow(false, pages.length > 1)
      ]
    });
  });

  // Handle pagination
  buttonCollector.on('collect', async (interaction) => {
    // Ownership check
    if (interaction.user.id !== message.author.id) {
      return interaction.reply({ content: '❌ This palette belongs to someone else.', ephemeral: true });
    }

    const customId = interaction.customId;

    if (customId === 'help:prev' && pageIdx > 0) {
      pageIdx--;
    } else if (customId === 'help:next' && pageIdx < pages.length - 1) {
      pageIdx++;
    }

    const newEmbed = buildEmbed({
      title: '⚙️ Command Palette',
      items: pages[pageIdx] || [],
      page: pageIdx + 1,
      pages: Math.max(1, pages.length),
      footerNote: 'Use dropdown to filter • Buttons to navigate • 60s timeout',
      query,
      category
    });

    await interaction.update({
      embeds: [newEmbed],
      components: [
        buildCategoryMenu(category),
        buildNavRow(pageIdx > 0, pageIdx < pages.length - 1)
      ]
    });
  });

  // Cleanup on timeout
  const endCollectors = () => {
    try {
      selectCollector.stop();
      buttonCollector.stop();

      // Remove components after timeout
      msg.edit({ components: [] }).catch(() => {});
    } catch (e) {
      // Ignore cleanup errors
    }
  };

  selectCollector.on('end', () => {
    console.log('[PALETTE] Collector ended');
    endCollectors();
  });

  setTimeout(() => endCollectors(), 60_000);
}

module.exports = { handleHelpPalette };
