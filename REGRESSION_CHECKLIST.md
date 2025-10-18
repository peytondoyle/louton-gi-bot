# Regression Checklist - Quick QA After Deploys

**Version:** Post-NLU + LLM Pinch + Food Heuristics
**Last Updated:** 2025-01-18

---

## 🚀 Pre-Deployment

- [ ] All commits pushed to `main` branch
- [ ] `npm install` completed (dependencies up to date)
- [ ] `node --check index.js` passes (no syntax errors)
- [ ] Environment variables set (at minimum: `DISCORD_TOKEN`, `SPREADSHEET_ID`)
- [ ] Discord **MESSAGE CONTENT INTENT** enabled in dev portal
- [ ] Google Sheets credentials configured (`credentials.json` or env vars)

---

## ✅ Core Functionality Tests

### **Commands (Prefixed)**

Send these as DMs to the bot:

- [ ] `!help` → Shows help menu with commands
- [ ] `!food pizza` → Logs food entry
- [ ] `!drink chai` → Logs drink entry
- [ ] `!symptom mild headburn` → Logs symptom
- [ ] `!bm` → Logs BM entry
- [ ] `!today` → Shows today's summary
- [ ] `!undo` → Undoes last entry
- [ ] `!test` → Responds with "Bot is working"

**Expected:** All commands execute without errors

---

### **Natural Language (Non-Prefixed DMs)**

Send these as DMs (no `!` prefix):

#### **Food Extraction Tests:**

- [ ] `Life cereal with banana and oat milk for breakfast`
  - **Expected:** Logs "Life cereal" with `sides=banana and oat milk` in Notes
  - **Check logs:** `[NLU] ✅ Rules confident (85%), skipping LLM`

- [ ] `Cheerios with milk`
  - **Expected:** Logs "Cheerios" with `sides=milk` in Notes
  - **Check logs:** Should skip LLM (high confidence)

- [ ] `oatmeal with banana`
  - **Expected:** Logs "oatmeal" with `sides=banana` in Notes

- [ ] `pizza at lunch`
  - **Expected:** Logs "pizza" with `meal=lunch` in Notes

#### **LLM Pinch Tests (if OPENAI_API_KEY set):**

- [ ] `acid reflux not feeling well`
  - **Expected:** May call LLM for severity, shows buttons to confirm
  - **Check logs:** `[LLM-PINCH] 🤖 Calling gpt-4o-mini...` or `[NLU] 🤔 Rules uncertain`

- [ ] `bad poop`
  - **Expected:** Auto-detects Bristol 6, shows buttons to confirm
  - **Check logs:** Should skip LLM if rules confident

#### **Without OpenAI Key:**

- [ ] Same messages above still work (may show more clarification buttons)
- **Check logs:** `[LLM-PINCH] ⚠️ OPENAI_API_KEY not set, skipping LLM fallback`

---

### **Button Interactions**

- [ ] Send `acid reflux` → Click severity button (1-10) → Logs successfully
- [ ] Send `bathroom` → Click Bristol button (1-7) → Logs successfully
- [ ] Send `ate something` → Click meal time button → Logs successfully
- [ ] Daily check-in (if scheduled) → Click symptom button → Logs successfully

**Expected:** All button clicks work, entries logged to Google Sheets

---

### **Correction & Lexicon Learning**

- [ ] Send `had pizza for lunch` → Logs successfully
- [ ] Send `correction: had salad for lunch` → Undoes pizza, logs salad, learns phrase
- [ ] Send `had salad for lunch` again → Should have higher confidence (learned)

**Expected:** Corrections undo + re-log + learn phrase

---

### **Google Sheets Integration**

After running above tests:

- [ ] Open Google Sheet → Verify all entries logged
- [ ] Check **Notes** column contains tokens:
  - `sides=banana and oat milk`
  - `meal=breakfast`
  - `time=10:30:00`
  - `qty=grande`
  - `adjSeverity=bad→7`

**Expected:** All metadata in Notes column, no new columns added

---

## 🔍 Log Validation

Check console logs for expected patterns:

### **Routing Logs:**

```
[ROUTER] 📨 From: username | isDM=true | hasPrefix=false | Route: NLU
[ROUTER] ✅ Routing to NLU handler
```

### **NLU Decision Logs:**

```
[NLU] ✅ Rules confident (85%), skipping LLM
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[NLU] ⚠️ LLM pinch failed, using rules result
[NLU] ✨ LLM filled critical slots, boosted confidence to 85%
```

### **LLM Pinch Logs (if enabled):**

```
[LLM-PINCH] ⚡ Cache hit
[LLM-PINCH] 🤖 Calling gpt-4o-mini...
[LLM-PINCH] ✅ Success (427ms) - intent: food, confidence: 0.85
[LLM-PINCH] ⏱️ Timeout (800ms exceeded)
[LLM-PINCH] ⚠️ OPENAI_API_KEY not set, skipping LLM fallback
```

### **Food Extraction Logs:**

Look for successful item extraction in parse results:
```
🧠 NLU: Intent: food (85%), Slots: {"item":"Life cereal","sides":"banana and oat milk","meal_time":"breakfast"}
```

---

## ⚠️ Error Checks

### **Should NOT see:**

- [ ] ❌ `TypeError: Cannot read property...` (undefined errors)
- [ ] ❌ `SyntaxError:` (syntax errors)
- [ ] ❌ `UnhandledPromiseRejectionWarning` (uncaught promises)
- [ ] ❌ `ECONNREFUSED` (Google Sheets connection failed)
- [ ] ❌ Messages ignored in DMs (routing broken)

### **Acceptable warnings:**

- [ ] ✅ `[LLM-PINCH] ⚠️ OPENAI_API_KEY not set` (if not configured)
- [ ] ✅ `[LLM-PINCH] ⏱️ Timeout` (occasional LLM timeouts OK)
- [ ] ✅ `[NLU] ⚠️ LLM pinch failed` (fails soft, uses rules)

---

## 📊 Performance Checks

### **Response Times:**

- [ ] Commands respond within 1-2 seconds
- [ ] Natural language (rules-only) responds within 1-2 seconds
- [ ] Natural language (with LLM cache hit) responds within 1-2 seconds
- [ ] Natural language (with LLM cache miss) responds within 3-5 seconds

### **LLM Usage (if enabled):**

- [ ] Check OpenAI usage dashboard: https://platform.openai.com/usage
- [ ] Verify ~20-25% of messages trigger LLM calls (not 100%)
- [ ] Verify repeated messages hit cache (0ms, not calling API)

---

## 🔄 Cleanup After Testing

- [ ] Run `!undo` to remove test entries (or delete from Sheet manually)
- [ ] Verify bot still responds after cleanup
- [ ] Check Google Sheets quota not exceeded

---

## ✅ Sign-Off

**Tested by:** _________________
**Date:** _________________
**All tests passed:** ☐ Yes ☐ No
**Issues found:** _________________
**Notes:** _________________

---

## 🚨 Rollback Plan (if needed)

If critical issues found:

```bash
# Revert to previous commit
git log --oneline -5  # Find last good commit
git reset --hard <commit-hash>
git push origin main --force

# Restart bot
npm start
```

**Previous stable commits:**
- `79243a5` - Routing fixes (before food heuristics)
- `ea30a59` - NLU integration (before LLM pinch)
- `751d26a` - Rules-based NLU only

---

**Quick Smoke Test (30 seconds):**
1. `!test` → ✅ Response
2. `!help` → ✅ Help menu
3. `Life cereal with banana` → ✅ Logs item + sides
4. Check Google Sheets → ✅ Entry logged

If all ✅, deployment successful! 🎉
