# GitHub Setup Instructions

## Step 1: Create Repository on GitHub

1. Go to: https://github.com/new
2. Fill in:
   - Repository name: `louton-gi-bot`
   - Description: `Discord bot for tracking GI symptoms and food intake with Google Sheets integration`
   - Choose: Public or Private
   - ⚠️ **DO NOT** check any initialization options
3. Click "Create repository"

## Step 2: Push Your Code

After creating the repository, GitHub will show you commands. Run these in your terminal:

### Option A: If your GitHub username is `peyton-doyle` or similar:

```bash
# Add remote (replace USERNAME with your GitHub username)
git remote add origin https://github.com/USERNAME/louton-gi-bot.git

# Push code
git push -u origin main
```

### Option B: If you use SSH with GitHub:

```bash
# Add remote with SSH (replace USERNAME with your GitHub username)
git remote add origin git@github.com:USERNAME/louton-gi-bot.git

# Push code
git push -u origin main
```

## Step 3: Verify

Your repository should now be live at:
`https://github.com/USERNAME/louton-gi-bot`

## What's Included

✅ All bot code
✅ README with setup instructions
✅ Replit deployment files
✅ Example environment variables
✅ .gitignore (protecting credentials)

## What's NOT Included (for security)

❌ .env file (contains Discord token)
❌ credentials.json (contains Google service account key)
❌ node_modules/ (will be installed fresh)

## After Pushing

You can:
1. Share the repository link with others
2. Deploy directly to Replit from GitHub
3. Set up GitHub Actions for CI/CD (optional)
4. Add collaborators to help develop

## Quick Deploy to Replit from GitHub

1. Go to Replit
2. Click "Create Repl"
3. Choose "Import from GitHub"
4. Paste: `https://github.com/USERNAME/louton-gi-bot`
5. Follow the README deployment instructions