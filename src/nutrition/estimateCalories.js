// Small rules-first calorie estimator with tiny LLM fallback and cache
const { llmCache } = require('../nlu/cache'); // existing LRU
const { OpenAI } = require('openai');

// Common food calorie map (per serving)
const CALORIE_MAP = {
  "life cereal": 160,
  "banana": 100,
  "oat milk": 120,
  "cheerios": 140,
  "oatmeal": 150,
  "greek yogurt": 130,
  "chicken": 180,
  "salad": 120,
  "pizza": 280,
  "sandwich": 350,
  "rice": 200,
  "pasta": 220,
  "eggs": 140,
  "toast": 80,
  "avocado": 160,
  "apple": 95,
  "orange": 62,
  "berries": 50,
  "nuts": 160,
  "peanut butter": 190,
  "bread": 80,
  "cheese": 110,
  "yogurt": 100,
  "milk": 150,
  "coffee": 5,
  "tea": 2,
  "water": 0,
  "soda": 140,
  "juice": 110,
  "smoothie": 200,
  "burrito": 400,
  "taco": 180,
  "soup": 150,
  "stir fry": 300,
  "noodles": 200
};

// Initialize OpenAI client (lazy - only if API key exists)
let openai = null;
function getOpenAI() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 800 // Hard 800ms timeout
    });
  }
  return openai;
}

/**
 * Normalize text for cache key
 * @param {string} s - Text to normalize
 * @returns {string} Normalized text
 */
function norm(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * LLM estimate for a single food item
 * @param {string} food - Food item name
 * @returns {Promise<number|null>} Estimated calories or null
 */
async function llmEstimateOne(food) {
  const key = 'cal_' + norm(food);
  const cached = llmCache.get(key);
  if (cached) {
    console.log(`[CAL-EST] ⚡ Cache hit for "${food}": ${cached} kcal`);
    return cached;
  }

  const client = getOpenAI();
  if (!client) {
    console.log('[CAL-EST] ⚠️  OPENAI_API_KEY not set, skipping LLM estimate');
    return null;
  }

  const prompt = `Estimate the average calories for one serving of ${food}. Respond with only a number.`;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.log('[CAL-EST] ⏱️  Timeout (800ms exceeded)');
    controller.abort();
  }, 800);

  try {
    console.log(`[CAL-EST] 🤖 Calling gpt-4o-mini for "${food}"...`);
    const startTime = Date.now();

    const resp = await client.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 10,
        messages: [{ role: 'user', content: prompt }]
      },
      { signal: controller.signal } // IMPORTANT: options arg, not in body
    );

    const elapsed = Date.now() - startTime;
    clearTimeout(timer);

    const text = resp.choices?.[0]?.message?.content || '';
    const num = parseInt(text.match(/\d+/)?.[0], 10);

    if (Number.isFinite(num) && num > 0) {
      console.log(`[CAL-EST] ✅ Success (${elapsed}ms) - "${food}": ${num} kcal`);
      llmCache.set(key, num);
      return num;
    }

    console.log(`[CAL-EST] ❌ Invalid response: "${text}"`);
    return null;
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      console.log('[CAL-EST] ⏱️  Request aborted (timeout)');
    } else {
      console.log(`[CAL-EST] ❌ Error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Estimate calories for item + sides (multi-component)
 * @param {string} item - Main food item
 * @param {string} sides - Comma/&/and-separated sides
 * @returns {Promise<number|null>} Total estimated calories or null
 */
async function estimateCaloriesForItemAndSides(item, sides) {
  const parts = [];

  // Add main item
  if (item) {
    parts.push(norm(item));
  }

  // Split sides by common separators: ',', '&', 'and'
  if (sides) {
    const raw = norm(sides);
    raw.split(/,|&| and /g)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(x => parts.push(x));
  }

  if (parts.length === 0) {
    console.log('[CAL-EST] ⚠️  No parts to estimate');
    return null;
  }

  console.log(`[CAL-EST] 📊 Estimating calories for: ${parts.join(', ')}`);

  let total = 0;
  let hits = 0;

  for (const p of parts) {
    // 1) Direct map hit
    if (CALORIE_MAP[p] != null) {
      console.log(`[CAL-EST] ✅ Map hit: "${p}" = ${CALORIE_MAP[p]} kcal`);
      total += CALORIE_MAP[p];
      hits++;
      continue;
    }

    // 2) Try to match partial words (e.g., "oatmeal with banana" -> "oatmeal", "banana")
    let found = false;
    for (const [key, cal] of Object.entries(CALORIE_MAP)) {
      if (p.includes(key) || key.includes(p)) {
        console.log(`[CAL-EST] ✅ Partial match: "${p}" ~= "${key}" = ${cal} kcal`);
        total += cal;
        hits++;
        found = true;
        break;
      }
    }
    if (found) continue;

    // 3) LLM fallback for this component
    const guess = await llmEstimateOne(p);
    if (guess != null) {
      total += guess;
      hits++;
    } else {
      console.log(`[CAL-EST] ❌ No estimate for "${p}"`);
    }
  }

  if (hits === 0) {
    console.log('[CAL-EST] ❌ No estimates found');
    return null;
  }

  console.log(`[CAL-EST] 📊 Total: ${total} kcal (${hits}/${parts.length} components)`);
  return total;
}

module.exports = { estimateCaloriesForItemAndSides };
