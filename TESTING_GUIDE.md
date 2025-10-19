# Testing Guide - Calorie Tracking & Multi-User Support

## Prerequisites

1. **Update .env file:**
   ```bash
   PEYTON_ID=<your_discord_user_id>
   LOUIS_ID=<other_user_discord_id>
   OPENAI_API_KEY=sk-your_openai_api_key_here  # Optional but recommended
   ```

2. **Get your Discord User ID:**
   - Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)
   - Right-click your username → Copy ID

3. **Start the bot:**
   ```bash
   npm start
   ```

---

## Test Suite

### ✅ Test 1: Verify Tab Creation

**Action:** Start the bot and check console output

**Expected Output:**
```
🔧 Ensuring user tabs exist...
✅ Created new sheet: Peyton
✅ Headers added to Peyton: Timestamp, User, Type, Details, Severity, Notes, Date, Source, Calories
✅ Created new sheet: Louis
✅ Headers added to Louis: Timestamp, User, Type, Details, Severity, Notes, Date, Source, Calories
✅ Created new sheet: Health_Peyton
✅ Headers added to Health_Peyton: Date, Active_kcal, Basal_kcal, Total_kcal, Steps, Exercise_min, Weight, Source
✅ User tabs ensured: Peyton, Louis, Health_Peyton
```

**Verification:**
- Open your Google Sheet
- Confirm three new tabs exist: `Peyton`, `Louis`, `Health_Peyton`
- Check headers match expected schema

---

### ✅ Test 2: Peyton Logs Food with Calories

**Action:** DM the bot as Peyton (user ID matching PEYTON_ID):
```
Life cereal with banana and oat milk for breakfast
```

**Expected Console Output:**
```
[CAL-EST] 📊 Estimating calories for: life cereal, banana, oat milk
[CAL-EST] ✅ Map hit: "life cereal" = 160 kcal
[CAL-EST] ✅ Map hit: "banana" = 100 kcal
[CAL-EST] ✅ Map hit: "oat milk" = 120 kcal
[CAL-EST] 📊 Total: 380 kcal (3/3 components)
✅ Logged to Sheets (Peyton): food for <username>
```

**Expected Bot Reply:**
```
✅ Logged Life cereal with banana and oat milk — ≈380 kcal.
```

**Google Sheet Verification (Peyton tab):**
| Timestamp | User | Type | Details | Severity | Notes | Date | Source | Calories |
|-----------|------|------|---------|----------|-------|------|--------|----------|
| 2025-01-19... | YourUsername | food | Life cereal with banana and oat milk | | sides=banana and oat milk; meal=breakfast | 2025-01-19 | discord-dm-nlu | 380 |

---

### ✅ Test 3: Louis Logs Same Food (No Calories)

**Action:** DM the bot as Louis (user ID matching LOUIS_ID):
```
Life cereal with banana and oat milk for breakfast
```

**Expected Console Output:**
```
✅ Logged to Sheets (Louis): food for <username>
```

**Expected Bot Reply:**
```
✅ Logged Life cereal with banana and oat milk.
```

**Google Sheet Verification (Louis tab):**
| Timestamp | User | Type | Details | Severity | Notes | Date | Source | Calories |
|-----------|------|------|---------|----------|-------|------|--------|----------|
| 2025-01-19... | LouisUsername | food | Life cereal with banana and oat milk | | sides=banana and oat milk; meal=breakfast; calories=disabled | 2025-01-19 | discord-dm-nlu | |

---

### ✅ Test 4: Unknown Food (LLM Fallback)

**Action:** DM the bot as Peyton:
```
had a quinoa bowl
```

**Expected Console Output (First Time):**
```
[CAL-EST] 📊 Estimating calories for: quinoa bowl
[CAL-EST] 🤖 Calling gpt-4o-mini for "quinoa bowl"...
[CAL-EST] ✅ Success (245ms) - "quinoa bowl": 350 kcal
✅ Logged to Sheets (Peyton): food for <username>
```

**Expected Bot Reply:**
```
✅ Logged quinoa bowl — ≈350 kcal.
```

**Action:** Repeat same message:
```
had a quinoa bowl
```

**Expected Console Output (Second Time - Cache Hit):**
```
[CAL-EST] ⚡ Cache hit for "quinoa bowl": 350 kcal
[CAL-EST] 📊 Total: 350 kcal (1/1 components)
```

---

### ✅ Test 5: No OPENAI_API_KEY Set

**Action:**
1. Remove or comment out `OPENAI_API_KEY` in `.env`
2. Restart bot
3. DM as Peyton:
   ```
   had some exotic fruit salad
   ```

**Expected Console Output:**
```
[CAL-EST] 📊 Estimating calories for: exotic fruit salad
[CAL-EST] ⚠️  OPENAI_API_KEY not set, skipping LLM estimate
[CAL-EST] ❌ No estimate for "exotic fruit salad"
[CAL-EST] ❌ No estimates found
```

**Expected Bot Reply:**
```
✅ Logged exotic fruit salad (calories pending).
```

**Google Sheet Verification:**
- `Notes` includes: `calories=pending`
- `Calories` column: empty

---

### ✅ Test 6: Set Daily Goal

**Action:** DM the bot as Peyton:
```
!goal 2200
```

**Expected Bot Reply:**
```
✅ Set your daily goal to 2200 kcal.
```

**Action:** Check goal:
```
!goal
```

**Expected Bot Reply:**
```
📊 Your current daily goal is 2200 kcal.

Use `!goal <number>` to change it.
```

**Action:** Try as Louis:
```
!goal 2000
```

**Expected Bot Reply:**
```
Goal tracking is only enabled for Peyton.
```

---

### ✅ Test 7: Health Data Ingestion

**Action:** POST to health endpoint:
```bash
curl -X POST http://localhost:3000/ingest/health \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-01-19",
    "active_kcal": 450,
    "basal_kcal": 1750,
    "total_kcal": 2200,
    "steps": 8500,
    "exercise_min": 30,
    "weight": 175,
    "source": "apple-health"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Health data logged successfully",
  "rowNumber": "2"
}
```

**Google Sheet Verification (Health_Peyton tab):**
| Date | Active_kcal | Basal_kcal | Total_kcal | Steps | Exercise_min | Weight | Source |
|------|-------------|------------|------------|-------|--------------|--------|---------|
| 2025-01-19 | 450 | 1750 | 2200 | 8500 | 30 | 175 | apple-health |

---

### ✅ Test 8: Symptom Logging (No Calories)

**Action:** DM the bot as Peyton:
```
mild heartburn
```

**Expected Console Output:**
```
✅ Logged to Sheets (Peyton): reflux for <username>
```

**Expected Bot Reply:**
```
🔥 Logged reflux.
```

**Google Sheet Verification:**
- `Type`: reflux
- `Severity`: mild
- `Calories`: empty (symptoms don't track calories)

---

### ✅ Test 9: Multi-Component Meal

**Action:** DM the bot as Peyton:
```
chicken salad with avocado and toast
```

**Expected Console Output:**
```
[CAL-EST] 📊 Estimating calories for: chicken salad with avocado and toast, avocado, toast
[CAL-EST] ✅ Partial match: "chicken salad with avocado and toast" ~= "chicken" = 180 kcal
[CAL-EST] ✅ Map hit: "avocado" = 160 kcal
[CAL-EST] ✅ Map hit: "toast" = 80 kcal
[CAL-EST] 📊 Total: 420 kcal (3/3 components)
```

**Expected Bot Reply:**
```
✅ Logged chicken salad with avocado and toast — ≈420 kcal.
```

---

### ✅ Test 10: Backwards Compatibility (Missing Calories Column)

**Action:**
1. Manually delete `Calories` column from `Peyton` tab in Google Sheets
2. DM as Peyton:
   ```
   banana
   ```

**Expected Behavior:**
- Bot logs successfully (no errors)
- `Notes` field includes: `calories≈100`
- No `Calories` column in sheet

**Expected Bot Reply:**
```
✅ Logged banana — ≈100 kcal.
```

---

## Common Issues & Fixes

### Issue: "No headers found for sheet Peyton"
**Fix:** Restart bot to trigger `ensureSheetAndHeaders()` again

### Issue: Calorie estimates always "pending"
**Fix:**
1. Verify `OPENAI_API_KEY` is set in `.env`
2. Check console for `[CAL-EST]` logs
3. Confirm you have OpenAI API credits

### Issue: Wrong user gets logged to wrong tab
**Fix:**
1. Verify `PEYTON_ID` and `LOUIS_ID` in `.env`
2. Get your actual Discord User ID (right-click → Copy ID)
3. Restart bot

### Issue: Health ingestion returns 400
**Fix:** Ensure JSON body includes required fields: `date` and `total_kcal`

---

## Performance Benchmarks

**Expected Timings:**
- Rules-only food (map hit): < 50ms
- LLM fallback (first time): 200-800ms
- LLM fallback (cached): < 10ms
- Sheet write: 100-300ms
- Total E2E (with LLM): < 1.5s
- Total E2E (cached): < 500ms

---

## Debug Commands

**View all logs in real-time:**
```bash
npm start | tee logs.txt
```

**Test health endpoint with verbose:**
```bash
curl -v -X POST http://localhost:3000/ingest/health \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-01-19","total_kcal":2000}'
```

**Check OpenAI API key works:**
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | jq
```

---

## Success Criteria

✅ All 10 tests pass
✅ Peyton gets calorie estimates
✅ Louis does NOT get calorie estimates
✅ Logs route to correct tabs
✅ Health data writes to Health_Peyton only
✅ No errors in console
✅ Bot responds within 2 seconds
✅ Backwards compatibility maintained

---

## Next Steps After Testing

1. **Set actual Discord User IDs** in `.env`
2. **Add more foods** to CALORIE_MAP in `src/nutrition/estimateCalories.js`
3. **Implement daily total calculation** for "remaining kcal" display
4. **Monitor cache hit rate** over time
5. **Consider persistent goal storage** (env var or sheet)

---

**Happy Testing!** 🎉
