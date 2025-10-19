/**
 * Command Registry - Central declaration of all commands
 * Single source of truth for command metadata, categories, usage, examples
 */

const CommandRegistry = (() => {
  /** @typedef {{
   *   name: string,
   *   aliases?: string[],
   *   category: 'Logging'|'Insights'|'Reminders'|'Settings'|'Admin/Debug'|'Other',
   *   description: string,
   *   usage?: string[],
   *   examples?: string[],
   *   subcommands?: Array<{ name: string, description: string, usage?: string[], examples?: string[] }>,
   *   visible?: boolean
   * }} CommandMeta */

  /** @type {Record<string, CommandMeta>} */
  const byName = {};
  /** @type {CommandMeta[]} */
  const list = [];

  function add(meta) {
    const m = { visible: true, aliases: [], usage: [], examples: [], subcommands: [], ...meta };
    byName[m.name] = m;
    list.push(m);
    (m.aliases || []).forEach(a => (byName[a] = m));
  }

  // ========== INSIGHTS & SUMMARIES ==========
  add({
    name: '!today',
    category: 'Insights',
    description: 'Compact daily summary (intake, reflux, net, 7-day trend).',
    usage: ['!today'],
    examples: ['!today']
  });

  add({
    name: '!week',
    category: 'Insights',
    description: 'Weekly summary from your tab.',
    usage: ['!week'],
    examples: ['!week']
  });

  add({
    name: '!insights',
    category: 'Insights',
    description: 'Full analytics (budget, latency, trends, combos, streaks).',
    usage: ['!insights'],
    examples: ['!insights']
  });

  add({
    name: '!streak',
    category: 'Insights',
    description: 'Show symptom-free streak with milestones.',
    usage: ['!streak'],
    examples: ['!streak']
  });

  add({
    name: '!patterns',
    category: 'Insights',
    description: 'Analyze food/symptom patterns.',
    usage: ['!patterns'],
    examples: ['!patterns']
  });

  add({
    name: '!triggers',
    category: 'Insights',
    description: 'Show trigger food correlations.',
    usage: ['!triggers'],
    examples: ['!triggers']
  });

  add({
    name: '!trends',
    category: 'Insights',
    description: 'Long-term trend analysis.',
    usage: ['!trends'],
    examples: ['!trends']
  });

  add({
    name: '!weekly',
    category: 'Insights',
    description: 'Weekly digest summary.',
    usage: ['!weekly'],
    examples: ['!weekly']
  });

  // ========== LOGGING & UTILITIES ==========
  add({
    name: '!undo',
    category: 'Logging',
    description: 'Undo your last log (soft delete with deleted=true).',
    usage: ['!undo'],
    examples: ['!undo']
  });

  add({
    name: '!food',
    category: 'Logging',
    description: 'Log food (redirects to NLU). Prefer natural language.',
    usage: ['!food <description>'],
    examples: ['!food egg bite with bacon'],
    visible: false // Hidden - prefer natural language
  });

  add({
    name: '!drink',
    category: 'Logging',
    description: 'Log drink (redirects to NLU). Prefer natural language.',
    usage: ['!drink <description>'],
    examples: ['!drink jasmine tea'],
    visible: false
  });

  add({
    name: '!symptom',
    category: 'Logging',
    description: 'Log symptom (redirects to NLU). Prefer natural language.',
    usage: ['!symptom <description>'],
    examples: ['!symptom mild heartburn'],
    visible: false
  });

  add({
    name: '!reflux',
    category: 'Logging',
    description: 'Log reflux (redirects to NLU). Prefer natural language.',
    usage: ['!reflux <severity>'],
    examples: ['!reflux 7'],
    visible: false
  });

  add({
    name: '!bm',
    category: 'Logging',
    description: 'Log bowel movement (redirects to NLU). Prefer natural language.',
    usage: ['!bm <description>'],
    examples: ['!bm hard poop'],
    visible: false
  });

  // ========== REMINDERS ==========
  add({
    name: '!reminders',
    category: 'Reminders',
    description: 'Enable/disable and configure reminder times (morning, evening, inactivity).',
    usage: ['!reminders on|off', '!reminders time HH:MM', '!reminders evening HH:MM', '!reminders inactivity HH:MM'],
    examples: ['!reminders on', '!reminders time 08:00', '!reminders evening 20:30', '!reminders inactivity 14:00'],
    subcommands: [
      { name: 'on', description: 'Enable reminders' },
      { name: 'off', description: 'Disable reminders' },
      { name: 'time', description: 'Set morning check-in time', usage: ['!reminders time 08:00'] },
      { name: 'evening', description: 'Set evening recap time', usage: ['!reminders evening 20:30'] },
      { name: 'inactivity', description: 'Set inactivity nudge time', usage: ['!reminders inactivity 14:00'] }
    ]
  });

  add({
    name: '!dnd',
    category: 'Reminders',
    description: 'Set Do Not Disturb quiet hours (supports overnight windows).',
    usage: ['!dnd HH:MM-HH:MM', '!dnd off'],
    examples: ['!dnd 22:00-07:00', '!dnd off']
  });

  add({
    name: '!snooze',
    category: 'Reminders',
    description: 'Temporarily pause all reminders.',
    usage: ['!snooze <duration>'],
    examples: ['!snooze 3h', '!snooze 1d']
  });

  // ========== SETTINGS ==========
  add({
    name: '!timezone',
    category: 'Settings',
    description: 'Set or view your timezone (IANA format).',
    usage: ['!timezone', '!timezone <Area/City>'],
    examples: ['!timezone', '!timezone America/New_York', '!timezone Europe/London']
  });

  add({
    name: '!goal',
    category: 'Settings',
    description: 'View or set daily calorie goal (Peyton only).',
    usage: ['!goal', '!goal <number>'],
    examples: ['!goal', '!goal 2200'],
    subcommands: [
      { name: 'set', description: 'Set daily goal', usage: ['!goal 2200'] },
      { name: 'view', description: 'Show current goal', usage: ['!goal'] }
    ]
  });

  // ========== ADMIN & DEBUG ==========
  add({
    name: '!nlu-stats',
    category: 'Admin/Debug',
    description: 'Show NLU V2 coverage, acceptance rates, LLM usage, cache stats.',
    usage: ['!nlu-stats'],
    examples: ['!nlu-stats']
  });

  add({
    name: '!test',
    category: 'Admin/Debug',
    description: 'Test bot connectivity.',
    usage: ['!test'],
    examples: ['!test']
  });

  // ========== OTHER ==========
  add({
    name: '!help',
    aliases: ['!palette', '!commands'],
    category: 'Other',
    description: 'Open the Command Palette with interactive filters, search, and pagination.',
    usage: ['!help', '!help <search terms>'],
    examples: ['!help', '!help reminder', '!help timezone']
  });

  add({
    name: '!howto',
    category: 'Other',
    description: 'Beginner-friendly walkthrough of bot features.',
    usage: ['!howto'],
    examples: ['!howto']
  });

  // ========== CHARTS ==========
  add({
    name: '!chart',
    category: 'Insights',
    description: 'Generate visual charts (budget, intake, reflux, latency, triggers).',
    usage: ['!chart <type> <period>'],
    examples: ['!chart budget today', '!chart intake 7d', '!chart reflux 14d', '!chart latency 30d', '!chart triggers 30d'],
    subcommands: [
      { name: 'budget', description: 'Intake vs Burn budget chart', usage: ['!chart budget today', '!chart budget 7d'] },
      { name: 'intake', description: 'Intake vs Burn area chart', usage: ['!chart intake 7d'] },
      { name: 'reflux', description: 'Reflux count/severity trend', usage: ['!chart reflux 14d'] },
      { name: 'latency', description: 'Meal→symptom time distribution', usage: ['!chart latency 30d'] },
      { name: 'triggers', description: 'Trigger combination lifts', usage: ['!chart triggers 30d'] }
    ]
  });

  add({
    name: '!charts',
    category: 'Insights',
    description: 'Browse available charts with interactive buttons.',
    usage: ['!charts'],
    examples: ['!charts']
  });

  // ========== API ==========
  function all({ visibleOnly = true } = {}) {
    return visibleOnly ? list.filter(c => c.visible !== false) : list.slice();
  }

  function categories() {
    const set = new Set(all().map(c => c.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function byCategory(cat) {
    return all().filter(c => c.category === cat);
  }

  function search(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return all();
    return all().filter(c => {
      const hay = [
        c.name,
        ...(c.aliases || []),
        c.category,
        c.description,
        ...(c.usage || []),
        ...(c.examples || []),
        ...(c.subcommands || []).flatMap(sc => [sc.name, sc.description, ...(sc.usage || []), ...(sc.examples || [])])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function get(name) {
    return byName[name] || null;
  }

  function count() {
    return list.length;
  }

  return { add, all, byCategory, categories, search, get, count, byName };
})();

module.exports = { CommandRegistry };
