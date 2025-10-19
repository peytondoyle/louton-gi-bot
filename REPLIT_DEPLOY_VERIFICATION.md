# Replit Deployment Verification Guide

**Date:** 2025-01-18
**Status:** Ready to Deploy

---

## ✅ Pre-Flight Checklist

### **1. Environment Variables in Replit Secrets**

Required secrets (check in Replit Secrets tab):

- [ ] `DISCORD_TOKEN` - Your Discord bot token
- [ ] `SPREADSHEET_ID` - Google Sheets ID
- [ ] `OPENAI_API_KEY` - OpenAI API key (no underscores!)
- [ ] `CHANNEL_ID` - Discord channel ID (optional, for channel-based mode)

**Google Sheets Authentication:**
Either one of these:
- [ ] `credentials.json` file uploaded to Replit
- [ ] OR environment variables: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, etc.

---

## 🚀 Deployment Steps

### **Step 1: Start the Bot**

In Replit, click the **"Run"** button or execute:

```bash
npm start
```

### **Step 2: Watch Startup Logs**

You should see:

```
🔧 Initializing Discord client with:
   Intents: Guilds, GuildMessages, MessageContent, DirectMessages
   Partials: Channel, Message (required for DM support)
🔑 Attempting to login to Discord...
🔐 Successfully authenticated with Discord
✅ Louton GI Bot is online as YourBot#1234
🕐 Bot ready at: Jan 18, 2025, 10:30:00 AM
📍 Mode: Channel + DM
✅ Connected to Google Sheets
🚀 Bot is fully operational and ready for commands!
```

**✅ SUCCESS INDICATORS:**
- No `❌` errors
- "Bot is fully operational" message appears
- Google Sheets connection confirmed

**❌ FAILURE INDICATORS:**
- `Error: Invalid token` → Check DISCORD_TOKEN
- `401 Unauthorized` (Sheets) → Check credentials.json or Google env vars
- `Missing Access` → Enable MESSAGE CONTENT INTENT in Discord Developer Portal
- `OPENAI_API_KEY not set` → Check environment variable name (no underscores!)

---

## 🧪 Smoke Tests (30 seconds)

Send these messages as **DMs to your bot** (not in a server channel):

### **Test 1: Command Test**
```
!test
```

**Expected Response:**
```
✅ Bot is working! All systems operational.
```

**Check Logs:**
```
[ROUTER] 📨 From: yourname | isDM=true | hasPrefix=true | Route: COMMAND
[ROUTER] 🔍 Command: "test" | Args: ""
[ROUTER] ✅ Command !test completed
```

---

### **Test 2: Simple Food (Rules-Only)**
```
Cheerios with milk
```

**Expected Response:**
```
✅ Logged Cheerios.

    You're building great data habits 💪
```

**Check Logs:**
```
[ROUTER] 📨 From: yourname | isDM=true | hasPrefix=false | Route: NLU
[ROUTER] ✅ Routing to NLU handler
[NLU] ✅ Rules confident (85%), skipping LLM
🧠 NLU: Intent: food (85%), Slots: {"item":"Cheerios","sides":"milk"}, Missing: []
```

**Verify Google Sheets:**
- New row added with Type="Food", Item="Cheerios"
- Notes column contains: `sides=milk`

---

### **Test 3: Complex Food (Should Skip LLM)**
```
Life cereal with banana and oat milk for breakfast
```

**Expected Response:**
```
✅ Logged Life cereal.

    Consistency wins the race 🏁
```

**Check Logs:**
```
[ROUTER] Route: NLU
[NLU] ✅ Rules confident (85%), skipping LLM
🧠 NLU: Intent: food (85%), Slots: {"item":"Life cereal","sides":"banana and oat milk","meal_time":"breakfast"}, Missing: []
```

**Verify Google Sheets:**
- Type="Food", Item="Life cereal"
- Notes contains: `sides=banana and oat milk; meal=breakfast`

---

### **Test 4: Ambiguous Message (Should Call LLM)**
```
acid reflux not feeling well
```

**Expected Response:**
```
😣 How severe is it? (1 = mild, 10 = severe)
[Shows buttons 1-10]
```

**Check Logs (WITH OPENAI_API_KEY set):**
```
[ROUTER] Route: NLU
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] 🤖 Calling gpt-4o-mini...
[LLM-PINCH] ✅ Success (427ms) - intent: reflux, confidence: 0.85
[NLU] ✨ LLM filled critical slots, boosted confidence to 85%
```

**Check Logs (WITHOUT OPENAI_API_KEY):**
```
[ROUTER] Route: NLU
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] ⚠️ OPENAI_API_KEY not set, skipping LLM fallback
[NLU] ⚠️ LLM pinch failed, using rules result
```

**Click a severity button (e.g., 7) to complete entry**

---

### **Test 5: Repeated Message (Should Hit Cache)**

Send the SAME message again:
```
acid reflux not feeling well
```

**Expected Logs (if OpenAI configured):**
```
[NLU] 🤔 Rules uncertain (65%), trying LLM pinch...
[LLM-PINCH] ⚡ Cache hit
[NLU] ✨ LLM filled critical slots, boosted confidence to 85%
```

**Note:** Cache hit = 0ms, no API call made!

---

## 📊 Verify Google Sheets

Open your Google Sheet and verify:

1. **All 4 test entries logged** (test command won't log, but 3 food/symptom entries should)
2. **Notes column** contains metadata:
   - `sides=milk`
   - `sides=banana and oat milk; meal=breakfast`
3. **No new columns added** (all metadata in Notes only)

---

## 🔍 Log Health Check

### **Good Signs (75-85% of messages):**
```
[NLU] ✅ Rules confident (85%), skipping LLM
```

### **Acceptable (15-25% of messages):**
```
[LLM-PINCH] ⚡ Cache hit
[LLM-PINCH] 🤖 Calling gpt-4o-mini...
[LLM-PINCH] ✅ Success (200-600ms)
```

### **Warning Signs (Investigate):**
```
[LLM-PINCH] ⏱️ Timeout (800ms exceeded)  // Occasional is OK, frequent is bad
Every message calls LLM                   // needsPinch() logic broken
No cache hits after warmup                // Cache not working
```

### **Error Signs (Fix Immediately):**
```
❌ TypeError: Cannot read property...
❌ UnhandledPromiseRejectionWarning
❌ ECONNREFUSED (Google Sheets)
Messages ignored in DMs                   // MESSAGE_CONTENT intent missing
```

---

## 🎯 Performance Benchmarks

After 10-15 test messages:

| Metric | Target | Check |
|--------|--------|-------|
| Rules-only (no LLM) | 75-80% | Count `[NLU] ✅ Rules confident` |
| LLM cache hits | 10-15% | Count `[LLM-PINCH] ⚡ Cache hit` |
| LLM API calls | 10-15% | Count `[LLM-PINCH] 🤖 Calling` |
| LLM response time | <600ms | Check `Success (Xms)` values |
| Bot response time (rules) | <2s | Time from send to bot reply |
| Bot response time (LLM) | <3s | Time from send to bot reply |

---

## 🐛 Troubleshooting

### **Issue: Bot doesn't respond to DMs**

**Fix:**
1. Check Discord Developer Portal → Bot → MESSAGE CONTENT INTENT is **enabled**
2. Re-invite bot with new permissions: `https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_ID&permissions=2147483648&scope=bot`
3. Restart bot in Replit

---

### **Issue: "OPENAI_API_KEY not set" but I added it**

**Fix:**
1. Check exact spelling: `OPENAI_API_KEY` (no underscores, no spaces)
2. Delete any typo secrets (like `OPEN_AI_KEY`)
3. Restart bot in Replit (stop and run again)

---

### **Issue: Google Sheets 401 Unauthorized**

**Fix:**
1. Check `credentials.json` exists in project root
2. OR verify Google env vars are set correctly
3. Make sure Sheet is shared with service account email

---

### **Issue: Every message calls LLM (100%)**

**Fix:**
1. Check `src/nlu/understand.js` - `needsPinch()` function
2. Verify confidence threshold: `if (result.confidence >= 0.8 && ...)`
3. Check rules are returning high confidence for clear messages

---

### **Issue: Food extraction not working**

**Fix:**
1. Verify `src/nlu/ontology.js` exports `HEAD_NOUNS` and `CEREAL_BRANDS`
2. Check `src/nlu/rules.js` imports them correctly
3. Test with simple message: `pizza` (should extract "pizza")

---

## ✅ Deployment Success Criteria

**All of these must be true:**

- [ ] Bot starts without errors
- [ ] `!test` command responds
- [ ] `Cheerios with milk` logs correctly with sides
- [ ] `Life cereal with banana` extracts item + sides correctly
- [ ] Google Sheets entries appear with Notes metadata
- [ ] Logs show `[NLU] ✅ Rules confident` for most messages
- [ ] LLM called only when needed (<25% of messages)
- [ ] Cache hits observed on repeated messages (if OpenAI configured)
- [ ] No `❌` errors in logs
- [ ] No `TypeError` or `UnhandledPromiseRejection` errors

---

## 🎉 If All Tests Pass

**Congratulations! Your bot is fully deployed and operational.**

Next steps:
1. Share bot invite link with users
2. Monitor logs in Replit console
3. Check Google Sheets daily for entries
4. Review OpenAI usage dashboard: https://platform.openai.com/usage
5. Run full regression tests from `REGRESSION_CHECKLIST.md` weekly

---

## 📞 Need Help?

If issues persist:
1. Check `EXPECTED_LOGS.md` for log pattern reference
2. Run full QA from `REGRESSION_CHECKLIST.md`
3. Review Discord.js docs: https://discord.js.org/
4. Check OpenAI API status: https://status.openai.com/

---

**Last Updated:** 2025-01-18
**Version:** Post-NLU + LLM Pinch + Food Heuristics
