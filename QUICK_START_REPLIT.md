# 🚀 Quick Start - Deploy to Replit (30 seconds)

## Step 1: Check Secrets ✅

In Replit Secrets tab, verify these are set:

```
DISCORD_TOKEN=your_discord_bot_token
SPREADSHEET_ID=your_google_sheet_id
OPENAI_API_KEY=sk-proj-...    ← NO UNDERSCORES!
```

Also check `credentials.json` exists in file tree.

---

## Step 2: Run Bot 🏃

Click **"Run"** button in Replit

Expected output:
```
✅ Louton GI Bot is online as YourBot#1234
✅ Connected to Google Sheets
🚀 Bot is fully operational and ready for commands!
```

---

## Step 3: Test It 🧪

Send DM to your bot:

```
!test
```
→ Should reply: `✅ Bot is working!`

```
Life cereal with banana and oat milk for breakfast
```
→ Should reply: `✅ Logged Life cereal.`

Check Google Sheets - new row should appear with `sides=banana and oat milk` in Notes.

---

## ✅ Success!

If all 3 steps worked, you're done! 🎉

For detailed testing, see:
- `REPLIT_DEPLOY_VERIFICATION.md` - Full deployment guide
- `REGRESSION_CHECKLIST.md` - Complete QA tests
- `EXPECTED_LOGS.md` - Log pattern reference

---

## ⚠️ Common Issues

**Bot doesn't start:**
- Check `OPENAI_API_KEY` has no underscores
- Check `DISCORD_TOKEN` is correct
- Check `credentials.json` exists

**Bot doesn't respond to DMs:**
- Enable MESSAGE CONTENT INTENT in Discord Developer Portal
- Restart bot

**Google Sheets error:**
- Share Sheet with service account email from `credentials.json`
- Check `SPREADSHEET_ID` is correct

---

**Ready to deploy? Hit "Run" in Replit!** 🚀
