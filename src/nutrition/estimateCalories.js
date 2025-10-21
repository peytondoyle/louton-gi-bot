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

const { CALORIE_MAP: CALORIE_LOOKUP } = require('./calorieLookup.json'); // Use lookup.json as primary source

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
    // Cache hit
    return cached;
  }

  const client = getOpenAI();
  if (!client) {
    // OpenAI API key not available
    return null;
  }

  const prompt = `Estimate the average calories for one serving of ${food}. Respond with only a number.`;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 800);

  try {
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
      llmCache.set(key, num);
      return num;
    }

    return null;
  } catch (error) {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Master calorie estimation function for an item and its sides.
 * Prioritizes deterministic lookup, then falls back to LLM if enabled.
 * @param {string} item - The main food item.
 * @param {string} sides - Additional items/modifiers.
 * @returns {Promise<number|null>} Estimated total calories or null.
 */
async function estimateCaloriesForItemAndSides(item, sides) {
  // Calorie estimator hardening — skip junk like "you"
  const txt = (item || '').toLowerCase().trim();
  if (!txt || txt.length < 3) return null;
  if (/\b(you|thanks|thank you|ok|okay|fine|solid)\b/.test(txt)) return null; // user replies

  let totalCalories = 0;
  let notes = [];

  // Combine item and sides for initial lookup attempts
  const fullDescription = `${item || ''} ${sides || ''}`.trim();
  const components = fullDescription.split(/\s*,\s*|\s+with\s+/).filter(Boolean);

  for (const component of components) {
    let componentCalories = null;

    // 1. Try deterministic lookup first
    const key = norm(component);
    if (CALORIE_LOOKUP[key]) {
      componentCalories = CALORIE_LOOKUP[key];
      notes.push(`✅ Partial match: "${component}" ~= "${key}" = ${componentCalories} kcal`);
    } else if (process.env.CAL_EST_USE_LLM === 'true') {
      // 2. Fallback to LLM if enabled
      const llmResult = await llmEstimateOne(component);
      if (llmResult && llmResult.calories) {
        componentCalories = llmResult.calories;
        notes.push(`🤖 LLM estimate for "${component}": ${componentCalories} kcal`);
      } else {
        notes.push(`❌ No estimate for "${component}"`);
      }
    } else {
        notes.push(`❌ No deterministic estimate for "${component}"`);
    }

    if (componentCalories !== null) {
      totalCalories += componentCalories;
    }
  }

  // Calorie estimation completed
  
  return totalCalories > 0 ? totalCalories : null;
}

module.exports = { estimateCaloriesForItemAndSides };
