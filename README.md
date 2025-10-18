# Louton GI Bot

Louton GI Bot - A Discord bot for tracking gastrointestinal symptoms, food intake, and identifying patterns to help manage digestive health.

## Features

- **Direct Message Support**: Both users can privately DM the bot independently
- **Food & Drink Tracking**: Log meals and beverages with natural language
- **Symptom Logging**: Track symptoms with severity levels
- **Pattern Analysis**: Identify correlations between foods and symptoms
- **Daily/Weekly Summaries**: Personalized insights from your tracking data
- **Streak Tracking**: Monitor consistency and trigger-free days
- **Smart Reactions**: Visual feedback for healthy vs trigger foods
- **Google Sheets Storage**: All data stored in a shared Google Sheet with user tracking
- **Scheduled Reminders**: Optional daily check-ins
- **Multi-User Support**: Track multiple users in the same household

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!food [description]` | Log food intake | `!food chicken salad with ranch` |
| `!drink [description]` | Log beverages | `!drink chai with oat milk` |
| `!symptom [description] [severity]` | Log symptoms | `!symptom stomach pain moderate` |
| `!bm [description]` | Log bowel movement | `!bm normal` or `!bm bristol 4` |
| `!reflux [severity]` | Log reflux episode | `!reflux mild` |
| `!today` | View today's entries | `!today` |
| `!week` | Get weekly summary | `!week` |
| `!streak` | Check tracking streaks | `!streak` |
| `!patterns` | Analyze data patterns | `!patterns` |
| `!help` | Show all commands | `!help` |

## Setup Instructions

### Prerequisites

- Node.js v16 or higher
- npm or yarn
- A Discord account
- A private Discord server for your bot

### Step 1: Create Discord Application & Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name (e.g., "Louton GI Bot")
3. Go to the "Bot" section in the left sidebar
4. Click "Add Bot"
5. Under "Token", click "Reset Token" and copy the token (save it securely!)
6. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT
7. Scroll up and copy the APPLICATION ID

### Step 2: Invite Bot to Your Server

1. Go to the "OAuth2" → "URL Generator" section
2. Under "Scopes", select:
   - `bot`
   - `applications.commands`
3. Under "Bot Permissions", select:
   - Send Messages
   - Read Messages/View Channels
   - Add Reactions
   - Embed Links
   - Read Message History
   - Use External Emojis
4. Copy the generated URL at the bottom
5. Open the URL in your browser and select your server
6. Authorize the bot

### Step 3: Get Your Channel ID

1. In Discord, go to Settings → Advanced
2. Enable "Developer Mode"
3. Right-click on the channel where you want the bot to operate
4. Click "Copy Channel ID"

### Step 4: Install and Configure the Bot

1. Clone or download this repository:
```bash
git clone <repository-url>
cd louton-gi-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from the example:
```bash
cp .env.example .env
```

4. Edit `.env` with your values:
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
USER1_NAME=YourName
USER2_NAME=PartnerName
TIMEZONE=America/Los_Angeles
ENABLE_REMINDERS=false
```

### Step 5: Run the Bot

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

The bot should come online and respond to commands!

## Using the Bot

### Direct Messages (Recommended)

The bot works best through Direct Messages for privacy:

1. **Find the bot** in your server's member list
2. **Right-click** on the bot and select "Message"
3. **Send commands** directly in the DM chat
4. Each user's data is tracked separately by Discord username
5. All commands work the same in DMs as in channels

**Benefits of using DMs:**
- Complete privacy - only you see your entries
- No channel clutter
- Can log sensitive health information comfortably
- Works from any device where you're logged into Discord

### Channel Messages (Optional)

If you prefer using a shared channel:
1. Set `DISCORD_CHANNEL_ID` in your `.env` file
2. The bot will respond in that specific channel
3. All users can see each other's entries

### Personalized Tracking

- `!today` shows only YOUR entries when used in DMs
- `!week` displays YOUR personal weekly statistics
- `!streak` tracks YOUR individual progress
- All data goes to the same Google Sheet but is organized by user

## Data Storage

The bot uses Google Sheets for data storage:
- All data is stored in a Google Spreadsheet
- Automatic sheet creation with headers on first run
- Real-time data synchronization
- Easy to view and analyze data directly in Google Sheets
- Columns: Timestamp, User, Type, Details, Severity, Notes, Date, Source (DM/Channel)

### Google Cloud Setup

#### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Name your project (e.g., "louton-gi-bot")
4. Click "Create"

#### Step 2: Enable Google Sheets API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Sheets API"
3. Click on it and press "Enable"

#### Step 3: Create Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Name it (e.g., "louton-bot-service")
4. Click "Create and Continue"
5. Skip optional permissions (click "Continue")
6. Click "Done"

#### Step 4: Create Service Account Key

1. Click on your new service account
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON" format
5. Click "Create" (key downloads automatically)
6. **Save this file as `credentials.json` in your project root**

#### Step 5: Set Up Google Sheet

1. Create a new Google Sheet at [sheets.google.com](https://sheets.google.com)
2. Name it (e.g., "Louton GI Tracking")
3. Copy the Sheet ID from the URL:
   - URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Copy the `SHEET_ID_HERE` part
4. Share the sheet with your service account:
   - Click "Share" button
   - Paste the service account email (from credentials.json `client_email`)
   - Give it "Editor" access
   - Click "Send"

#### Step 6: Configure Environment Variables

From your `credentials.json` file, extract:
- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY`

Add to your `.env` file:
```env
GOOGLE_SHEETS_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

## Deployment Options

### Local Deployment

Run the bot on your computer:
```bash
npm start
```

Note: Bot will only be online when your computer is running.

### Replit Deployment (Free 24/7 Hosting)

#### Step 1: Create Replit Account and Repl
1. Go to [Replit](https://replit.com) and create a free account
2. Click "Create Repl" → Choose "Node.js" template
3. Name it "louton-gi-bot"

#### Step 2: Upload Your Bot Files
Upload all files **except**:
- `node_modules/` folder
- `.env` file (we'll use Secrets instead)

Or import from GitHub if you have a repository.

#### Step 3: Add Secrets (Environment Variables)
1. Click the "Secrets" tab (🔐 icon) in the left sidebar
2. Add the following secrets one by one:
   - Key: `DISCORD_TOKEN`, Value: (your Discord bot token)
   - Key: `GOOGLE_SHEETS_ID`, Value: (your Google Sheet ID)
   - Key: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, Value: (service account email)
   - Key: `GOOGLE_PRIVATE_KEY`, Value: (paste the entire private key including BEGIN/END lines)
   - Key: `DISCORD_CHANNEL_ID`, Value: (leave empty for DM-only mode)
   - Key: `TIMEZONE`, Value: `America/New_York` (or your timezone)
   - Key: `USER1_NAME`, Value: `YourName`
   - Key: `USER2_NAME`, Value: `PartnerName`

#### Step 4: Upload credentials.json
1. Upload your `credentials.json` file to the root directory
2. This file contains your Google service account credentials

#### Step 5: Install Dependencies and Start
1. Open the Shell tab
2. Run: `npm install`
3. Click the "Run" button or type: `npm start`
4. You should see:
   ```
   ✅ Keep-alive server is ready on port 3000
   ✅ Louton GI Bot is online as Louton GI Bot#5255
   ✅ Connected to Google Sheets
   ```

#### Step 6: Get Your Repl URL
1. When the bot starts, a webview will appear
2. Copy the URL (format: `https://louton-gi-bot.YOUR-USERNAME.repl.co`)
3. This is your bot's health check endpoint

#### Step 7: Set Up UptimeRobot (Keep Bot Alive 24/7)
1. Go to [UptimeRobot](https://uptimerobot.com) and create a free account
2. Click "Add New Monitor"
3. Monitor Type: **HTTP(s)**
4. Friendly Name: `Louton GI Bot`
5. URL: Paste your Repl URL from Step 6
6. Monitoring Interval: **5 minutes**
7. Click "Create Monitor"

#### Step 8: Verify Everything Works
1. The bot should now be online 24/7
2. Test by sending a DM to the bot: `!help`
3. Check UptimeRobot dashboard - should show "Up"
4. Your bot will restart automatically if it crashes

**Important Notes:**
- Replit free tier may sleep after ~1 hour of inactivity
- UptimeRobot pings every 5 minutes to keep it awake
- The bot runs completely free 24/7!
- If the bot goes offline, check Replit console for errors
- Replit provides 500MB storage and 512MB RAM (plenty for this bot)

### VPS Deployment (Recommended for 24/7)

1. Set up a VPS (DigitalOcean, Linode, AWS, etc.)
2. Install Node.js
3. Clone repository
4. Set up PM2 for process management:
```bash
npm install -g pm2
pm2 start index.js --name "louton-gi-bot"
pm2 save
pm2 startup
```

## Configuration Options

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DISCORD_TOKEN` | Yes | Your bot's token | - |
| `DISCORD_CHANNEL_ID` | No | Channel ID (optional, leave empty for DM-only) | - |
| `GOOGLE_SHEETS_ID` | Yes | Google Sheet ID from URL | - |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Service account email | - |
| `GOOGLE_PRIVATE_KEY` | Yes | Service account private key | - |
| `USER1_NAME` | No | Primary user's name | User1 |
| `USER2_NAME` | No | Secondary user's name | User2 |
| `TIMEZONE` | No | Timezone for timestamps | America/Los_Angeles |
| `ENABLE_REMINDERS` | No | Enable scheduled reminders | false |
| `MORNING_REMINDER_TIME` | No | Morning reminder time (24h) | 09:00 |
| `EVENING_REMINDER_TIME` | No | Evening reminder time (24h) | 20:00 |

### Customizing Trigger Foods

Edit these arrays in `index.js`:

```javascript
const TRIGGER_ITEMS = {
    positive: ['chai', 'water', 'herbal tea', 'ginger tea'],
    warning: ['refresher', 'coffee', 'alcohol', 'soda'],
    problematic: ['spicy', 'dairy', 'gluten', 'fried']
};
```

## Analyzing Your Data

### Direct Google Sheets Access

Your data is automatically available in Google Sheets where you can:
- Create charts and graphs
- Use pivot tables for analysis
- Apply conditional formatting to identify patterns
- Share read-only access with healthcare providers
- Export to other formats (CSV, Excel, PDF)

### Built-in Analysis Commands

The bot provides real-time analysis through commands:
- `!patterns` - Identifies food-symptom correlations
- `!week` - Shows weekly statistics with trends
- `!streak` - Tracks consistency and trigger-free days
- `!today` - Daily summary pulled directly from Sheets

### Advanced Analysis

Use Google Sheets formulas for custom analysis:
- `COUNTIF` to count specific symptoms
- `AVERAGEIF` for severity trends
- `QUERY` for complex data filtering
- Charts for visualizing patterns over time

## Troubleshooting

### Bot Not Responding

1. Check bot is online in Discord (green dot)
2. Verify channel ID in `.env`
3. Check bot has permissions in the channel
4. Look for errors in console

### Missing Intents Error

Enable Message Content Intent in Discord Developer Portal:
1. Go to your application
2. Bot section → Privileged Gateway Intents
3. Enable MESSAGE CONTENT INTENT

### Permission Errors

Ensure bot role has these permissions:
- Send Messages
- Read Messages
- Add Reactions
- Embed Links

### Google Sheets Connection Issues

1. Verify service account email has Editor access to the sheet
2. Check `GOOGLE_SHEETS_ID` matches your sheet URL
3. Ensure private key format is correct (include \n characters)
4. Check console for authentication errors
5. Try creating a new service account key if issues persist

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Future Enhancements

- [x] Google Sheets integration
- [ ] Web dashboard
- [ ] Mobile app companion
- [ ] AI-powered insights
- [ ] Food database integration
- [ ] Medication tracking
- [ ] Export reports as PDF
- [ ] Multi-user household support
- [ ] Voice commands via Discord
- [ ] Automated weekly/monthly reports

## Privacy & Security

- All data is stored in your own Google Sheets
- No data is sent to external services
- Bot only operates in specified channel
- Use a private Discord server for sensitive health data

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review existing GitHub issues
3. Create a new issue with:
   - Error messages
   - Steps to reproduce
   - Your configuration (without tokens!)

## License

MIT License - See LICENSE file for details

## Disclaimer

This bot is not a substitute for professional medical advice. Always consult with healthcare providers for medical concerns.

---

Made with 💚 for better digestive health tracking