#!/bin/bash

# Replace YOUR_USERNAME with your actual GitHub username
GITHUB_USERNAME="YOUR_USERNAME"

echo "Setting up GitHub remote for louton-gi-bot..."
echo "Please replace YOUR_USERNAME with your actual GitHub username in this script first!"
echo ""

# Add the remote origin
git remote add origin https://github.com/$GITHUB_USERNAME/louton-gi-bot.git

# Verify the remote was added
echo "Remote added:"
git remote -v

# Push to GitHub
echo ""
echo "Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Done! Your code is now on GitHub at:"
echo "https://github.com/$GITHUB_USERNAME/louton-gi-bot"