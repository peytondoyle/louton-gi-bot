const store = new Map(); // { key -> { payload, expiresAt } }

function keyFrom(ctx) {
  // Always use the same shape everywhere
  const guildId = ctx.guildId || 'dm';
  const channelId = ctx.channelId;
  const userId = ctx.authorId || ctx.userId;
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
