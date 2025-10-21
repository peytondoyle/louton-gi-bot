const store = new Map(); // { key -> { payload, expiresAt } }

function keyFrom(ctx) {
  // Handle both context objects and message objects
  let guildId, channelId, userId;
  
  if (ctx.guildId !== undefined || ctx.channelId !== undefined || ctx.authorId !== undefined) {
    // Context object format
    guildId = ctx.guildId || 'dm';
    channelId = ctx.channelId;
    userId = ctx.authorId || ctx.userId;
  } else if (ctx.guild !== undefined || ctx.channel !== undefined || ctx.author !== undefined) {
    // Message object format
    guildId = ctx.guild ? ctx.guild.id : 'dm';
    channelId = ctx.channel.id;
    userId = ctx.author.id;
  } else {
    throw new Error('pending.keyFrom: invalid context format');
  }
  
  if (!channelId || !userId) throw new Error('pending.keyFrom: missing ids');
  return `pending:${guildId}:${channelId}:${userId}`;
}

function set(key, payload, ttlMs = 120_000) {
  const expiresAt = Date.now() + ttlMs;
  store.set(key, { payload, expiresAt });
  console.log(`[PENDING] set  ${payload?.type || 'unknown'} key=${key} ttl=${ttlMs}`);
}

function get(key) {
  const v = store.get(key);
  if (!v) return null;
  if (Date.now() > v.expiresAt) { store.delete(key); console.log(`[PENDING] miss ${key} (expired)`); return null; }
  console.log(`[PENDING] hit  ${v.payload?.type || 'unknown'} key=${key}`);
  return v.payload;
}

// Soft extend so replies near-expiry still work
function getSoft(key, minMs = 10_000, extendMs = 60_000) {
  const v = store.get(key);
  if (!v) return null;
  const now = Date.now();
  if (now > v.expiresAt) { store.delete(key); console.log(`[PENDING] miss ${key} (expired)`); return null; }
  if (v.expiresAt - now < minMs) v.expiresAt += extendMs;
  console.log(`[PENDING] hit+ ${v.payload?.type || 'unknown'} key=${key}`);
  return v.payload;
}

function clear(key) { if (store.delete(key)) console.log(`[PENDING] clr  key=${key}`); }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store.entries()) if (v.expiresAt <= now) store.delete(k);
}, 30_000).unref();

module.exports = { keyFrom, set, get, getSoft, clear };
