/**
 * Rules-Based NLU Parser V2 - Comprehensive Upgrade
 * Implements 50+ heuristics for robust, lenient natural language understanding
 *
 * Pipeline:
 * 1. Pre-clean (spell correct, strip stopwords)
 * 2. Intent detection (conversational → loggable)
 * 3. Item extraction (brand-aware, egg constructions, head-noun anchoring)
 * 4. Secondary intent detection (beverages in sides)
 * 5. Portion parsing
 * 6. Time parsing
 * 7. Metadata tagging (dairy, caffeine, negations)
 * 8. Confidence scoring + rescue metadata
 * 9. Return deterministic result
 */

const chrono = require('chrono-node');
const compromise = require('compromise');

// V2 Imports
const {
    HEAD_NOUNS,
    EGG_CONSTRUCTIONS,
    CEREAL_BRANDS,
    CEREAL_VARIANTS,
    BEVERAGES,
    ALL_BEVERAGES,
    CAFE_SIZES,
    DAIRY_ITEMS,
    NON_DAIRY_ITEMS,
    CAFFEINATED_ITEMS,
    DECAF_FLAGS,
    ADJECTIVE_SEVERITY,
    BM_KEYWORDS,
    BM_DESCRIPTORS,
    BRISTOL_ADJ,
    BM_BRISTOL_MAP,
    SYMPTOM_CANONICAL,
    NEGATION_PATTERNS,
    MINIMAL_CORE_FOODS,
    STOPWORDS,
    containsSynonym,
    findSynonymGroup,
    extractSeverityFromAdjectives,
    getCurrentWindow,
    isBeverage,
    hasNegation,
    isMinimalCoreFood
} = require('./ontology-v2');

const { safeCorrectToken, correctTokens } = require('../utils/spell');
const { parseTimeInfo } = require('../utils/timeParse');
const { extractPortion } = require('../nutrition/portionParser');

// Legacy ontology for backward compatibility
const INTENT_KEYWORDS = {
    bm: ["bm", "bowel", "bathroom", "poop", "poo", "stool", "toilet", "pooped"],
    drink: ["drank", "drinking", "sipped"],
    food: ["ate", "eaten", "had", "having"]
};

/**
 * Parse natural language text into structured intent and slots
 * @param {string} text - User input
 * @param {Object} options - { tz: 'America/Los_Angeles' }
 * @returns {ParseResult}
 */
function rulesParse(text, options = {}) {
    const tz = options.tz || 'America/Los_Angeles';
    const originalText = text.trim();
    const t = originalText.toLowerCase();

    const result = {
        intent: "other",
        confidence: 0.3,
        slots: {},
        missing: [],
        meta: {
            hasHeadNoun: false,
            rescuedBy: null,
            minimalCoreFood: false,
            secondaryDetected: false,
            spellingCorrected: []
        }
    };

    // ========== 0. BM EARLY ROUTE (BEFORE SPELL CORRECTION) ==========
    // Check for BM keywords FIRST to prevent spell-correction disasters
    const tokens = t.split(/\s+/);
    const hasBMKeyword = tokens.some(tok => BM_KEYWORDS.has(tok));

    if (hasBMKeyword) {
        console.log('[NLU-V2] 🚨 BM EARLY ROUTE ACTIVATED');
        result.intent = "bm";
        result.confidence = 0.90;

        // Detect Bristol from adjectives
        for (const token of tokens) {
            if (BRISTOL_ADJ[token]) {
                result.slots.bristol = String(BRISTOL_ADJ[token]);
                result.slots.bristol_note = `auto-detected from ${token}`;
                console.log(`[NLU-V2] Bristol auto-detected: ${token} → ${result.slots.bristol}`);
                break;
            }
        }

        // Parse daypart (no exact time)
        if (/\bmorning\b/i.test(t)) {
            result.slots.time_approx = 'morning';
            result.slots.meal_time = 'breakfast';
        } else if (/\bafternoon\b/i.test(t)) {
            result.slots.time_approx = 'afternoon';
            result.slots.meal_time = 'lunch';
        } else if (/\bevening|tonight\b/i.test(t)) {
            result.slots.time_approx = 'evening';
            result.slots.meal_time = 'dinner';
        }

        if (!result.slots.bristol) {
            result.missing.push("bristol");
        }

        return result; // Exit early - skip spell correction
    }

    // ========== 1. PRE-CLEAN (Only for non-BM domains) ==========
    // Spell correction for known brands/foods
    const spellingResult = correctTokens(originalText, {
        brands: CEREAL_BRANDS,
        foods: MINIMAL_CORE_FOODS,
        beverages: ALL_BEVERAGES
    });

    if (spellingResult.corrections.length > 0) {
        result.meta.spellingCorrected = spellingResult.corrections;
        console.log(`[NLU-V2] Spell corrected:`, spellingResult.corrections);
    }

    const cleanedText = spellingResult.corrected;
    const cleanedLower = cleanedText.toLowerCase();

    // ========== 2. CONVERSATIONAL INTENTS (Early Exit) ==========

    // Greeting
    if (/^(good\s*morning|good\s*evening|good\s*afternoon|hey|hi|hello|yo|sup|what'?s\s*up)/i.test(t)) {
        result.intent = "greeting";
        result.confidence = 0.95;
        return result;
    }

    // Thanks
    if (/^(thanks|thank\s*you|ty|thx|appreciate|cheers)/i.test(t)) {
        result.intent = "thanks";
        result.confidence = 0.95;
        return result;
    }

    // Chit-chat
    if (/^(lol|haha|ok|okay|cool|nice|awesome|great|perfect|got\s*it|sure|yep|yeah|nope|nah)/i.test(t)) {
        result.intent = "chit_chat";
        result.confidence = 0.9;
        return result;
    }

    // Farewell
    if (/^(bye|goodbye|good\s*bye|see\s*ya|see\s*you|later|night|good\s*night|gn|ttyl|talk\s*later)/i.test(t)) {
        result.intent = "farewell";
        result.confidence = 0.95;
        return result;
    }

    // Negation check (skip, no, avoided)
    if (hasNegation(cleanedText)) {
        if (/\b(skip|avoided|didn't\s+have|no\s+\w+\s+today)\b/i.test(t)) {
            result.intent = "checkin";
            result.confidence = 0.85;
            result.slots.note = cleanedText;
            return result;
        }
    }

    // ========== 3. TIME PARSING (Early - Affects Confidence) ==========
    const timeInfo = parseTimeInfo(cleanedText, tz);
    if (timeInfo.time) result.slots.time = timeInfo.time;
    if (timeInfo.timestamp) result.slots.timestamp = timeInfo.timestamp;
    if (timeInfo.meal_time) result.slots.meal_time = timeInfo.meal_time;
    if (timeInfo.approx) result.slots.time_approx = timeInfo.approx;

    // ========== 4. LOGGABLE INTENTS (Priority Order) ==========
    // NOTE: BM detection handled by early route (step 0) - if we're here, it's not BM

    // 4a. Reflux Detection
    const refluxKeywords = ["reflux", "heartburn", "acid", "acid reflux", "gerd", "burning chest"];
    if (containsSynonym(cleanedLower, refluxKeywords)) {
        result.intent = "reflux";
        result.confidence = 0.9;

        const severity = extractSeverityFromAdjectives(cleanedLower);
        if (severity) {
            result.slots.severity = severity;
            result.slots.severity_note = "auto-detected from adjective";
        } else {
            result.missing.push("severity");
        }

        return result;
    }

    // 4c. Symptom Detection
    const symptomKeywords = ["pain", "ache", "cramp", "hurt", "bloat", "bloated", "nausea", "nauseous", "queasy", "sick"];
    if (containsSynonym(cleanedLower, symptomKeywords)) {
        result.intent = "symptom";
        result.confidence = 0.8;

        // Canonicalize symptom type
        let symptomType = null;
        for (const keyword of symptomKeywords) {
            if (cleanedLower.includes(keyword)) {
                symptomType = SYMPTOM_CANONICAL[keyword] || keyword;
                break;
            }
        }

        result.slots.symptom_type = symptomType || "general";

        const severity = extractSeverityFromAdjectives(cleanedLower);
        if (severity) {
            result.slots.severity = severity;
            result.slots.severity_note = "auto-detected from adjective";
        } else {
            result.missing.push("severity");
        }

        return result;
    }

    // ========== 5. FOOD/DRINK ITEM EXTRACTION ==========
    // This is where the magic happens for "egg bite and jasmine tea"

    // 5a. Split on "with", "&", "and" to separate main from sides
    const extracted = extractItemAndSides(cleanedText, originalText);

    if (extracted.item) {
        result.slots.item = extracted.item;
        result.meta.hasHeadNoun = extracted.hasHeadNoun;
        result.meta.minimalCoreFood = isMinimalCoreFood(extracted.item);
    }

    if (extracted.sides) {
        result.slots.sides = extracted.sides;
    }

    // Copy rescue metadata if present
    if (extracted.rescuedBy) {
        result.meta.rescuedBy = extracted.rescuedBy;
    }

    // 5b. Check for secondary beverage intent
    if (extracted.secondaryBeverage) {
        result.slots._secondary = {
            intent: 'drink',
            item: extracted.secondaryBeverage,
            confidence: 0.85
        };
        result.meta.secondaryDetected = extracted.secondaryDetected || true;
    }

    // 5c. Portion parsing
    const portion = extractPortion(cleanedText, 'food');
    if (portion) {
        result.slots.portion = portion.raw;
        if (portion.normalized_g) result.slots.portion_g = portion.normalized_g;
        if (portion.normalized_ml) result.slots.portion_ml = portion.normalized_ml;
        result.slots.portion_multiplier = portion.multiplier || 1.0;
    }

    // 5d. Metadata tagging
    // Dairy detection
    const hasDairy = DAIRY_ITEMS.some(item => cleanedLower.includes(item));
    const hasNonDairy = NON_DAIRY_ITEMS.some(item => cleanedLower.includes(item));
    if (hasDairy && !hasNonDairy) {
        result.slots.dairy = true;
    } else if (hasNonDairy) {
        result.slots.non_dairy = true;
    }

    // Caffeine detection
    const hasCaffeine = CAFFEINATED_ITEMS.some(item => cleanedLower.includes(item));
    const hasDecaf = DECAF_FLAGS.some(flag => cleanedLower.includes(flag));
    if (hasCaffeine && !hasDecaf) {
        result.slots.caffeine = true;
    } else if (hasDecaf) {
        result.slots.decaf = true;
    }

    // ========== 6. INTENT CLASSIFICATION (Food vs Drink) ==========
    const drinkDetected = isBeverage(cleanedLower);
    const hasDrinkAction = INTENT_KEYWORDS.drink.some(word => cleanedLower.includes(word));
    const hasFoodAction = INTENT_KEYWORDS.food.some(word => cleanedLower.includes(word));

    if (drinkDetected || (hasDrinkAction && !hasFoodAction)) {
        result.intent = "drink";
        result.confidence = drinkDetected ? 0.80 : 0.75;

        if (!result.slots.item && drinkDetected) {
            // Extract beverage name
            for (const bev of ALL_BEVERAGES) {
                if (cleanedLower.includes(bev)) {
                    result.slots.item = bev;
                    break;
                }
            }
        }

        if (!result.slots.item) {
            result.missing.push("item");
        }

        // Infer meal time if missing
        if (!result.slots.meal_time && !result.slots.time) {
            result.slots.meal_time = getCurrentWindow();
            result.slots.meal_time_note = "inferred from current time";
        }

        return result;
    }

    // Default to food if we have an item or food indicators
    if (result.slots.item || hasFoodAction) {
        result.intent = "food";
        result.confidence = result.slots.item ? 0.75 : 0.65;

        if (!result.slots.item) {
            result.missing.push("item");
        }

        // Infer meal time if missing
        if (!result.slots.meal_time && !result.slots.time) {
            result.slots.meal_time = getCurrentWindow();
            result.slots.meal_time_note = "inferred from current time";
        }

        return result;
    }

    // ========== 6b. NOUN-ONLY MEAL PATTERN (Relaxed) ==========
    // Handle "egg bite breakfast" without verb
    const hasVerb = INTENT_KEYWORDS.food.some(word => cleanedLower.includes(word)) ||
                    INTENT_KEYWORDS.drink.some(word => cleanedLower.includes(word));

    const hasFoodWords = result.slots.item ||
                         result.meta.hasHeadNoun ||
                         isMinimalCoreFood(cleanedLower);

    const hasMealTime = result.slots.meal_time || result.slots.time;

    if (!hasVerb && hasFoodWords && hasMealTime && result.intent === "other") {
        result.intent = "food";
        result.confidence = 0.85;
        result.meta.nounOnlyMealPattern = true;
        console.log('[NLU-V2] Noun-only meal pattern detected (no verb, but has food + meal time)');

        if (!result.slots.item) {
            result.missing.push("item");
        }

        return result;
    }

    // ========== 7. FALLBACK ==========
    result.intent = "other";
    result.confidence = 0.3;
    result.missing.push("clarification_needed");

    return result;
}

/**
 * Extract item and sides with beverage detection
 * Implements improvements #1-10 (item extraction, brand detection, secondary intent)
 *
 * @param {string} text - Cleaned text
 * @param {string} originalText - Original text (for brand matching)
 * @returns {Object} - { item, sides, hasHeadNoun, secondaryBeverage }
 */
function extractItemAndSides(text, originalText) {
    const result = {
        item: null,
        sides: null,
        hasHeadNoun: false,
        secondaryBeverage: null,
        secondaryDetected: false
    };

    try {
        // Strip meal time suffix (e.g., "for breakfast")
        const MEAL_TIME_SUFFIX_RE = /\s+(for|at|during)\s+(breakfast|lunch|dinner|snack)\b.*$/i;
        const cleaned = text.replace(MEAL_TIME_SUFFIX_RE, '').trim();

        // ========== STEP 1: Split on "with", "&", "and" ==========
        let mainChunk = null;
        let sideChunk = null;

        // Try "with" first (strongest separator)
        if (/\bwith\b/i.test(cleaned)) {
            const parts = cleaned.split(/\bwith\b/i);
            mainChunk = (parts[0] || '').trim();
            sideChunk = (parts[1] || '').trim();
        }
        // Try "&" next
        else if (/\s+&\s+/.test(cleaned)) {
            const parts = cleaned.split(/\s+&\s+/);
            mainChunk = (parts[0] || '').trim();
            sideChunk = parts.slice(1).join(' & ').trim();
        }
        // Try "and" (careful - can be part of brand names)
        else if (/\s+and\s+(?!a\s)/i.test(cleaned)) {
            const parts = cleaned.split(/\s+and\s+/i);
            // Only split if second part looks like a food/drink
            const secondPart = (parts[1] || '').trim();
            if (hasHeadNoun(secondPart) || isBeverage(secondPart)) {
                mainChunk = (parts[0] || '').trim();
                sideChunk = parts.slice(1).join(' and ').trim();
            } else {
                mainChunk = cleaned;
            }
        }
        else {
            mainChunk = cleaned;
        }

        // ========== STEP 2: Check for Egg Constructions ==========
        for (const [pattern, config] of Object.entries(EGG_CONSTRUCTIONS)) {
            if (mainChunk && mainChunk.includes(pattern)) {
                result.item = config.item;
                result.hasHeadNoun = true;
                // Note: impliedPortion handled separately in portion parser
                return result;
            }
        }

        // ========== STEP 3: Brand-First Capture (Cereals) ==========
        if (mainChunk) {
            for (const brand of CEREAL_BRANDS) {
                const brandLower = brand.toLowerCase();
                if (mainChunk.includes(brandLower) || mainChunk.includes(brand)) {
                    result.item = `${brand} cereal`;
                    result.hasHeadNoun = true;
                    result.sides = sideChunk;
                    return result;
                }
            }

            // Check spelling variants
            for (const [variant, correct] of Object.entries(CEREAL_VARIANTS)) {
                if (mainChunk.includes(variant)) {
                    result.item = `${correct} cereal`;
                    result.hasHeadNoun = true;
                    result.sides = sideChunk;
                    return result;
                }
            }
        }

        // ========== STEP 4: Head-Noun Anchoring ==========
        const mainItem = chooseItemFromHeadNoun(mainChunk || cleaned);
        if (mainItem) {
            result.item = mainItem;
            result.hasHeadNoun = true;
        }

        // ========== STEP 5: Beverage Detection in Sides → Secondary Intent ==========
        if (sideChunk && isBeverage(sideChunk)) {
            // Extract beverage name from sides
            for (const bev of ALL_BEVERAGES) {
                if (sideChunk.toLowerCase().includes(bev)) {
                    result.secondaryBeverage = bev;
                    result.secondaryDetected = true;
                    console.log(`[NLU-V2] Secondary beverage detected: ${bev}`);
                    break;
                }
            }
        }

        // ========== STEP 6: Rescue Strategy - Swap if Sides Has Head Noun ==========
        if (!result.item && sideChunk) {
            const sideItem = chooseItemFromHeadNoun(sideChunk);
            if (sideItem) {
                // Swap: sides becomes main
                result.item = sideItem;
                result.sides = mainChunk; // Original main becomes side
                result.hasHeadNoun = true;
                result.rescuedBy = 'swap_sides';
                console.log(`[RESCUE] Swapped main/sides → chosen "${sideItem}"`);
            }
        }

        // ========== STEP 7: Rescue Strategy - Promote Secondary Beverage ==========
        if (!result.item && result.secondaryBeverage) {
            result.item = result.secondaryBeverage;
            result.hasHeadNoun = true;
            result.rescuedBy = 'promote_beverage';
            console.log(`[RESCUE] Promoted beverage to main: ${result.secondaryBeverage}`);
            // Clear secondary since it's now primary
            result.secondaryBeverage = null;
            result.secondaryDetected = false;
        }

        // ========== STEP 8: Fallback to Compromise Noun Extraction ==========
        if (!result.item && mainChunk) {
            const doc = compromise(mainChunk);
            const nouns = doc.nouns().out('array');

            if (nouns.length > 0) {
                // Filter blacklist and choose longest
                const validNouns = nouns
                    .filter(noun => !STOPWORDS.includes(noun.toLowerCase()))
                    .sort((a, b) => b.length - a.length);

                if (validNouns.length > 0) {
                    result.item = validNouns[0];
                }
            }
        }

        // Set sides
        if (sideChunk && !result.secondaryBeverage) {
            result.sides = sideChunk;
        }

        return result;

    } catch (error) {
        console.error('[NLU-V2] Error in extractItemAndSides:', error);
        return result;
    }
}

/**
 * Choose item from head noun with 2-token context
 * @param {string} src - Source text chunk
 * @returns {string|null} - Extracted item or null
 */
function chooseItemFromHeadNoun(src) {
    if (!src) return null;

    const lower = src.toLowerCase();

    // Find matching head noun
    const hit = HEAD_NOUNS.find(noun => lower.includes(noun));
    if (!hit) return null;

    // Capture up to 2 tokens before the head noun
    const tokens = src.split(/\s+/);
    const idx = tokens.findIndex(t => t.toLowerCase().includes(hit));
    if (idx < 0) return hit;

    const start = Math.max(0, idx - 2);
    return tokens.slice(start, idx + 1).join(' ').trim();
}

/**
 * Check if text chunk has a head noun
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function hasHeadNoun(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return HEAD_NOUNS.some(noun => lower.includes(noun));
}

module.exports = {
    rulesParse,
    extractItemAndSides,
    chooseItemFromHeadNoun,
    hasHeadNoun
};
