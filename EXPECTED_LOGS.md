# Expected Logs Reference

**Quick sanity-check guide for monitoring bot behavior**

---

## 🎯 Healthy Operation Logs

### **Bot Startup:**

```
🔧 Initializing Discord client with:
   Intents: Guilds, GuildMessages, MessageContent, DirectMessages
   Partials: Channel, Message (required for DM support)
🔑 Attempting to login to Discord...
🔐 Successfully authenticated with Discord
✅ Louton GI Bot is online as BotName#1234
🕐 Bot ready at: Jan 18, 2025, 10:30:00 AM
📍 Mode: Channel + DM
✅ Connected to Google Sheets
🚀 Bot is fully operational and ready for commands!
```

---

## 📨 Message Routing Logs

### **DM with Natural Language (No Prefix):**

```
[ROUTER] 📨 From: username | isDM=true | hasPrefix=false | Route: NLU
[ROUTER] 📝 Content: "Life cereal with banana and oat milk for breakfast"
[ROUTER] ✅ Routing to NLU handler
```

### **DM with Command (Prefix):**

```
[ROUTER] 📨 From: username | isDM=true | hasPrefix=true | Route: COMMAND
[ROUTER] 📝 Content: "!food pizza"
[ROUTER] ✅ Routing to command handler
[ROUTER] 🔍 Command: "food" | Args: "pizza"
[ROUTER] ✅ Command !food completed
```

### **Message Ignored (Not Allowed Channel):**

```
(No logs - silently ignored)
```

---

## 🧠 NLU Decision Logs

### **High Confidence → Skip LLM:**

```
[NLU] ✅ Rules confident (85%), skipping LLM
```

**When this happens:**
- Rules extracted all needed information
- Confidence ≥ 0.8 and no missing critical slots
- LLM not needed (saves time & cost)

---

### **Low Confidence → Try LLM:**

```
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] 🤖 Calling gpt-4o-mini...
[LLM-PINCH] ✅ Success (427ms) - intent: food, confidence: 0.85
[NLU] ✨ LLM filled critical slots, boosted confidence to 85%
```

**When this happens:**
- Rules had low confidence (<75%) OR
- Missing critical slots (item, severity, bristol)
- LLM called to fill gaps

---

### **LLM Cache Hit:**

```
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] ⚡ Cache hit
[NLU] ✨ LLM filled critical slots, boosted confidence to 85%
```

**When this happens:**
- User sent same/similar message before
- LLM result cached (instant, 0ms)
- No API call made

---

### **LLM Failed → Use Rules:**

```
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] ⏱️ Timeout (800ms exceeded)
[NLU] ⚠️ LLM pinch failed, using rules result
```

**When this happens:**
- LLM took >800ms (timeout)
- Bot falls back to rules-only result
- May ask user for clarification

---

### **LLM Not Configured:**

```
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] ⚠️ OPENAI_API_KEY not set, skipping LLM fallback
[NLU] ⚠️ LLM pinch failed, using rules result
```

**When this happens:**
- `OPENAI_API_KEY` environment variable not set
- Bot works normally with rules only
- May ask more clarification questions

---

## 🍽️ Food Extraction Logs

### **Successful Extraction:**

```
🧠 NLU: Intent: food (85%), Slots: {"item":"Life cereal","sides":"banana and oat milk","meal_time":"breakfast"}, Missing: []
```

**Key fields:**
- `item`: Main food item extracted
- `sides`: Sides/toppings (from "with" split)
- `meal_time`: Breakfast/lunch/dinner/snack

---

### **Missing Item:**

```
🧠 NLU: Intent: food (70%), Slots: {"meal_time":"lunch"}, Missing: ["item"]
🍽️ What did you have? (Type the food/drink name)
```

**When this happens:**
- Rules couldn't extract item
- LLM didn't help (or not configured)
- Bot asks user to clarify

---

## 📊 Full Message Flow Examples

### **Example 1: Perfect Rules Extraction**

```
[ROUTER] 📨 From: peyton | isDM=true | hasPrefix=false | Route: NLU
[ROUTER] 📝 Content: "Cheerios with milk"
[ROUTER] ✅ Routing to NLU handler
[NLU] ✅ Rules confident (85%), skipping LLM
🧠 NLU: Intent: food (85%), Slots: {"item":"Cheerios","sides":"milk"}, Missing: []
✅ Logged Cheerios.

    You're building great data habits 💪
```

---

### **Example 2: LLM Fills Gap (Cache Miss)**

```
[ROUTER] 📨 From: peyton | isDM=true | hasPrefix=false | Route: NLU
[ROUTER] 📝 Content: "acid reflux not feeling well"
[ROUTER] ✅ Routing to NLU handler
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] 🤖 Calling gpt-4o-mini...
[LLM-PINCH] ✅ Success (523ms) - intent: reflux, confidence: 0.85
[NLU] ✨ LLM filled critical slots, boosted confidence to 85%
🧠 NLU: Intent: reflux (85%), Slots: {"severity":7}, Missing: []
😣 How severe is it? (1 = mild, 10 = severe)
[Shows severity buttons 1-10]
```

---

### **Example 3: LLM Cache Hit (Instant)**

```
[ROUTER] 📨 From: peyton | isDM=true | hasPrefix=false | Route: NLU
[ROUTER] 📝 Content: "acid reflux not feeling well"
[ROUTER] ✅ Routing to NLU handler
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] ⚡ Cache hit
[NLU] ✨ LLM filled critical slots, boosted confidence to 85%
🧠 NLU: Intent: reflux (85%), Slots: {"severity":7}, Missing: []
😣 How severe is it? (1 = mild, 10 = severe)
```

---

### **Example 4: Command (Not NLU)**

```
[ROUTER] 📨 From: peyton | isDM=true | hasPrefix=true | Route: COMMAND
[ROUTER] 📝 Content: "!food pizza"
[ROUTER] ✅ Routing to command handler
[ROUTER] 🔍 Command: "food" | Args: "pizza"
[ROUTER] ✅ Command !food completed
```

---

## ⚠️ Warning Logs (Acceptable)

### **LLM Timeout (Occasional):**

```
[LLM-PINCH] ⏱️ Timeout (800ms exceeded)
```

**Action:** None needed. Bot falls back to rules.

---

### **LLM Not Configured:**

```
[LLM-PINCH] ⚠️ OPENAI_API_KEY not set, skipping LLM fallback
```

**Action:** Add `OPENAI_API_KEY` if you want LLM fallback, or ignore if rules-only is fine.

---

### **Lexicon Not Found:**

```
(No special log - just proceeds with rules)
```

**Action:** Normal. Lexicon builds over time as users correct entries.

---

## 🚨 Error Logs (Investigate)

### **Router Error:**

```
[ROUTER] ❌ Error in messageCreate handler: TypeError: Cannot read property 'content' of undefined
😅 Oops — something went wrong handling that message. Please try again or use a command like `!help`.
```

**Action:** Check Discord.js version, message object structure, intents enabled.

---

### **Google Sheets Error:**

```
❌ Failed to connect to Google Sheets: Error: Invalid credentials
```

**Action:** Check `credentials.json` exists and is valid. Re-authenticate if needed.

---

### **LLM API Error:**

```
[LLM-PINCH] ❌ Error: Incorrect API key provided
```

**Action:** Verify `OPENAI_API_KEY` is correct. Get new key from https://platform.openai.com/api-keys

---

### **NLU Parse Error:**

```
NLU Error: TypeError: Cannot read property 'slots' of undefined
❌ An error occurred while processing your message. Please try again or use a command.
```

**Action:** Check `src/nlu/rules.js` and `src/nlu/understand.js` for syntax errors. Run `node --check`.

---

## 📈 Performance Indicators

### **Good:**

- Most messages: `[NLU] ✅ Rules confident, skipping LLM` (~75%)
- Some messages: `[LLM-PINCH] ⚡ Cache hit` (~15%)
- Few messages: `[LLM-PINCH] 🤖 Calling gpt-4o-mini...` (~10%)

### **Concerning:**

- Every message calls LLM (should skip most)
- Frequent timeouts (>10% of LLM calls)
- No cache hits after warmup (cache not working)

---

## 🔍 Log Filtering Tips

### **Show only routing decisions:**

```bash
grep "\[ROUTER\]" logs.txt
```

### **Show only NLU decisions:**

```bash
grep "\[NLU\]" logs.txt
```

### **Show only LLM calls:**

```bash
grep "\[LLM-PINCH\]" logs.txt
```

### **Show only errors:**

```bash
grep "❌\|Error:" logs.txt
```

### **Count LLM call rate:**

```bash
# Total NLU messages
grep "\[NLU\]" logs.txt | wc -l

# LLM calls
grep "\[LLM-PINCH\] 🤖 Calling" logs.txt | wc -l

# Calculate percentage
# (LLM calls / Total NLU) * 100 should be ~20-25%
```

---

## ✅ Healthy Log Pattern (30 min session)

```
Startup logs: ✅
10 commands executed: ✅ All completed
20 natural language messages:
  - 15 skipped LLM (75%) ✅
  - 3 cache hits (15%) ✅
  - 2 LLM calls (10%) ✅
  - 0 errors ✅
Google Sheets: ✅ 30 entries logged
No warnings (except OPENAI_API_KEY if not set): ✅
```

**This is perfect! 🎉**

---

## 📞 Troubleshooting Guide

| Log Pattern | Issue | Fix |
|-------------|-------|-----|
| `Cannot read property 'content'` | Missing message object | Check Discord intents |
| `401 Unauthorized` (Sheets) | Invalid credentials | Re-authenticate Google |
| `401 Unauthorized` (OpenAI) | Invalid API key | Check OPENAI_API_KEY |
| `Every message calls LLM` | needsPinch() broken | Check understand.js logic |
| `No cache hits ever` | Cache not working | Check lru-cache installed |
| `All messages ignored` | Routing broken | Check MESSAGE_CONTENT intent |
| `"Unknown command !xyz"` | Command not found | Check commands object |

---

**Quick Sanity Check Command:**

Test these 3 messages and watch logs:

1. `!test` → Should show `[ROUTER] COMMAND`
2. `Cheerios` → Should show `[NLU] ✅ Rules confident, skipping LLM`
3. `acid reflux` → Should show `[NLU] 🤔` + `[LLM-PINCH]` (if configured)

If all 3 work ✅ → System healthy!
