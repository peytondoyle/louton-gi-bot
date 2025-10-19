# Replit Deployment Guide

Complete steps to deploy the bot on Replit with all fixes.

---

## 🚀 Step-by-Step Deployment

### **Step 1: Pull Latest Code**
```bash
git pull origin main
```

### **Step 2: Rebuild Environment for Node 20**

**In Replit**:
1. Click **"Replit"** menu (top left)
2. Select **"Rebuild environment"**
3. Wait for rebuild to complete (~30-60 seconds)

**Verify Node version**:
```bash
node -v
```
Should show: `v20.x.x` (not v18)

### **Step 3: Clean Install**
```bash
rm -rf node_modules package-lock.json
npm install
```

### **Step 4: Start Bot**
```bash
npm start
```

---

## ✅ Expected Startup Logs

```
[CHARTS] ✅ ChartService initialized (QuickChart API, 1200x700)
[HEARTBEAT] ✅ Started (interval: 60 minutes)
✅ Patched Message.prototype.reply() → clean sends (no gray bar)
✅ Louton GI Bot is online as Louton GI Bot#5255
✅ Google Sheets connected
✅ User tabs ensured: Peyton, Louis, Health_Peyton
🚀 Bot is fully operational and ready for commands!
```

On first NLU parse, you'll see:
```
[NLU-V2] ✅ understand-v2.js loaded and active
```

---

## 🧪 Critical Test Cases

### **Test 1: BM Early Route**
```
Pretty hard poop this morning
```

**Expected Console**:
```
[NLU-V2] 🚨 BM EARLY ROUTE ACTIVATED
[NLU-V2] Bristol auto-detected: hard → 2
```

**Expected Result**:
- Intent: bm
- Bristol: 2
- Notes: `time≈=morning`
- NO spell correction

---

### **Test 2: Protected Word**
```
poop
```

**Expected**:
- Intent: bm
- No spell correction
- Early route activated

---

### **Test 3: Legitimate Soda**
```
had a pop with lunch
```

**Expected**:
- Intent: drink
- Item: pop
- Meal: lunch
- NO BM detection

---

## 🔧 Troubleshooting

### **If Node version is still 18**:
1. Check `replit.nix` exists in repo root
2. Content should be:
```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
  ];
}
```
3. Rebuild environment again
4. If still issues, create `.replit` file with:
```
run = "npm start"
```

### **If "Cannot find module" errors**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### **If syntax errors**:
```bash
git pull origin main  # Get latest fixes
```

---

## 📊 Features Available

After successful deployment:

- ✅ **NLU V2**: 90% acceptance, spell correction, multi-intent
- ✅ **Notes v2.1**: Structured tokens
- ✅ **Charts**: 5 visual chart types via QuickChart
- ✅ **Command Palette**: Interactive help
- ✅ **BM Protection**: Bulletproof (early route + spell guards)

---

## 🎯 Quick Start Commands

```
!help
→ Interactive command palette

!charts
→ Chart menu with buttons

!chart budget today
→ Generate daily budget chart

Pretty hard poop this morning
→ Test BM detection
```

---

## ✅ Success Criteria

- [ ] Node version: v20.x.x
- [ ] No syntax errors on start
- [ ] Console shows: `[NLU-V2] ✅ understand-v2.js loaded and active`
- [ ] "Pretty hard poop this morning" logs as BM with bristol=2
- [ ] Charts render successfully

---

**All systems ready!** 🚀
