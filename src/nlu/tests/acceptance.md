# NLU V2 Acceptance Test Suite

Test cases covering all 52 improvements. Expected: 90%+ acceptance rate.

---

## 🎯 Critical Cases (Louis's Issue)

### Test 1: Egg Bite + Beverage
**Input**: `"had a egg bite and jasmine tea for breakfast"`
**Expected**:
- Intent: `food`
- Item: `egg bites` (via EGG_CONSTRUCTIONS)
- Sides: N/A
- Secondary: `{ intent: 'drink', item: 'jasmine tea' }`
- Meal: `breakfast`
- Confidence: ≥0.75
- Decision: `strict` or `lenient`

### Test 2: Egg Cup Variant
**Input**: `"had egg cup for breakfast"`
**Expected**:
- Intent: `food`
- Item: `eggs`
- Implied portion: `1 cup`
- Meal: `breakfast`

### Test 3: Multi-Component Food
**Input**: `"2 slices toast & coffee at 7am"`
**Expected**:
- Intent: `food`
- Item: `toast`
- Portion: `2 slices`, portion_g: 56
- Secondary: `{ intent: 'drink', item: 'coffee' }`
- Time: `07:00:00`

---

## 🥣 Cereal & Brand Detection

### Test 4: Brand + Cereal
**Input**: `"life cereal with banana and oat milk for breakfast"`
**Expected**:
- Intent: `food`
- Item: `Life cereal`
- Sides: `banana & oat milk`
- Meal: `breakfast`
- Brand: `Life`
- Non-dairy: `true`

### Test 5: Spelling Correction
**Input**: `"cheerious with milk"`
**Expected**:
- Intent: `food`
- Item: `Cheerios cereal` (corrected from "cheerious")
- Sides: `milk`
- Spelling corrected: `[{ original: 'cheerious', corrected: 'Cheerios' }]`

### Test 6: Brand Without "Cereal"
**Input**: `"had Kashi this morning"`
**Expected**:
- Intent: `food`
- Item: `Kashi cereal` (brand implies cereal)
- Meal: `breakfast` (from "this morning")

---

## 🍚 Rice & Grains

### Test 7: Rice Variant
**Input**: `"jasmine rice and salmon for dinner"`
**Expected**:
- Intent: `food`
- Item: `jasmine rice`
- Sides: `salmon`
- Meal: `dinner`

### Test 8: Grain with Portion
**Input**: `"1 cup quinoa with vegetables"`
**Expected**:
- Intent: `food`
- Item: `quinoa`
- Portion: `1 cup`, portion_g: 185 (via DENSITY_MAP)
- Sides: `vegetables`

---

## ☕ Beverages & Café Sizes

### Test 9: Café Size
**Input**: `"grande oat milk latte"`
**Expected**:
- Intent: `drink`
- Item: `latte` or `oat milk latte`
- Portion: `grande`, portion_ml: 473
- Non-dairy: `true`

### Test 10: Venti with Syrup
**Input**: `"venti iced coffee 2 pumps vanilla"`
**Expected**:
- Intent: `drink`
- Item: `iced coffee`
- Portion: `venti`, portion_ml: 591
- Sweetener: `2 pumps vanilla`
- Caffeine: `true`

### Test 11: Decaf Flag
**Input**: `"decaf americano"`
**Expected**:
- Intent: `drink`
- Item: `americano`
- Decaf: `true`
- Caffeine: `false`

---

## 🔀 Secondary Intent Detection

### Test 12: Food + Drink Both Clear
**Input**: `"pizza and beer"`
**Expected**:
- Intent: `food`
- Item: `pizza`
- Secondary: `{ intent: 'drink', item: 'beer' }`

### Test 13: Weak Food, Strong Beverage
**Input**: `"something light and green tea"`
**Expected**:
- Intent: `drink` (promoted from secondary)
- Item: `green tea`
- Rescued by: `promote_beverage`

---

## 📏 Portions & Unicode

### Test 14: Unicode Fractions
**Input**: `"½ cup oatmeal"`
**Expected**:
- Intent: `food`
- Item: `oatmeal`
- Portion: `½ cup`, portion_g: 40 (80g/cup × 0.5)

### Test 15: Mixed Numbers
**Input**: `"1.5 cups rice"`
**Expected**:
- Intent: `food`
- Item: `rice`
- Portion: `1.5 cups`, portion_g: 237 (158g/cup × 1.5)

---

## ⏰ Time Parsing

### Test 16: Absolute Time
**Input**: `"had coffee at 7:30am"`
**Expected**:
- Intent: `drink`
- Item: `coffee`
- Time: `07:30:00`
- Caffeine: `true`

### Test 17: Relative Time
**Input**: `"mild reflux this evening"`
**Expected**:
- Intent: `reflux`
- Time approx: `evening`
- Meal: `dinner`
- Severity: 2 (from "mild")

---

## 🚫 Negations

### Test 18: Skipped Meal
**Input**: `"skipped breakfast today"`
**Expected**:
- Intent: `checkin`
- Note: includes "skipped breakfast"
- No food/drink log created

### Test 19: Avoided Item
**Input**: `"no coffee today, but green tea"`
**Expected**:
- Intent: `drink`
- Item: `green tea`
- Negated item: `coffee`

---

## 🔄 Rescue Strategies

### Test 20: Swap Main/Sides
**Input**: `"had a with salad chicken"` (malformed)
**Expected**:
- Rescued by: `swap_sides`
- Item: `salad` (has head noun)
- Sides: `chicken`

### Test 21: Empty Main, Beverage in Sides
**Input**: `"with jasmine tea"`
**Expected**:
- Intent: `drink`
- Item: `jasmine tea`
- Rescued by: `promote_beverage`

---

## 🩺 Symptoms

### Test 22: Adjective Severity
**Input**: `"awful heartburn"`
**Expected**:
- Intent: `reflux`
- Severity: 9 (from "awful")
- Note: `auto-detected from adjective`

### Test 23: Canonicalized Symptom
**Input**: `"stomach ache mild"`
**Expected**:
- Intent: `symptom`
- Symptom type: `pain` (canonicalized from "ache")
- Severity: 2 (from "mild")

---

## 💩 BM Classification

### Test 24: Auto-Bristol
**Input**: `"watery diarrhea this morning"`
**Expected**:
- Intent: `bm`
- Bristol: 7 (from "watery")
- Note: `auto-detected from watery`
- Meal: `breakfast`

### Test 25: Hard Stool
**Input**: `"hard poop, like pellets"`
**Expected**:
- Intent: `bm`
- Bristol: 1 (from "pellets")

---

## 🥛 Dairy Detection

### Test 26: Dairy vs Non-Dairy
**Input**: `"latte with oat milk"`
**Expected**:
- Intent: `drink`
- Item: `latte`
- Sides: `oat milk`
- Non-dairy: `true`
- Dairy: `false`

### Test 27: Regular Milk
**Input**: `"cereal with whole milk"`
**Expected**:
- Intent: `food`
- Item: `cereal`
- Sides: `whole milk`
- Dairy: `true`

---

## 🎯 Minimal Core Foods

### Test 28: Short but Whitelisted
**Input**: `"had tea"`
**Expected**:
- Intent: `drink`
- Item: `tea`
- Confidence: ≥0.70
- Minimal core food: `true`

### Test 29: Just "Rice"
**Input**: `"rice for lunch"`
**Expected**:
- Intent: `food`
- Item: `rice`
- Meal: `lunch`
- Minimal core food: `true`

---

## 🔄 Conversational (Should NOT Log)

### Test 30: Greeting
**Input**: `"good morning"`
**Expected**:
- Intent: `greeting`
- Confidence: 0.95
- Should NOT create log entry

### Test 31: Thanks
**Input**: `"thanks!"`
**Expected**:
- Intent: `thanks`
- Should NOT create log entry

### Test 32: Chit-chat
**Input**: `"lol okay"`
**Expected**:
- Intent: `chit_chat`
- Should NOT create log entry

---

## 📊 Expected Aggregate Results

**Target Metrics** (after processing all 32 tests):
- Acceptance rate: ≥90% (29+/32)
- LLM call rate: ≤25% (≤8/32)
- Reject rate: ≤3% (≤1/32)
- Secondary intent detection: ≥3 cases
- Rescue success: ≥2 cases

---

## 🧪 Test Execution

Run with:
```javascript
const { rulesParse } = require('../rules-v2');
const { understand } = require('../understand-v2');

const testCases = [/* load from this file */];
for (const test of testCases) {
    const result = await understand(test.input, { tz: 'America/Los_Angeles' });
    assert(result.intent === test.expected.intent);
    // ... validate all fields
}
```

---

## ✅ Coverage Goals

- ✅ Egg constructions (Tests 1-2)
- ✅ Beverage secondary intent (Tests 1, 3, 12-13)
- ✅ Brand detection & spell correction (Tests 4-6)
- ✅ Rice & grains (Tests 7-8)
- ✅ Café sizes & portions (Tests 9-10, 14-15)
- ✅ Caffeine/decaf detection (Tests 10-11)
- ✅ Time parsing (Tests 16-17)
- ✅ Negations (Tests 18-19)
- ✅ Rescue strategies (Tests 20-21)
- ✅ Severity auto-detection (Tests 22-23)
- ✅ Bristol auto-classification (Tests 24-25)
- ✅ Dairy detection (Tests 26-27)
- ✅ Minimal core foods (Tests 28-29)
- ✅ Conversational filtering (Tests 30-32)
