# Chart System Testing Guide

Test the visual charting system with real data.

---

## 🎯 Prerequisites

**Seed Data** (for comprehensive testing):
- 10 days of food/drink logs with varying calories
- 6 days with reflux events (severities 3-8)
- Some entries with caffeine flag, dairy flag
- Health_Peyton data for 8/10 days (for burn comparison)
- At least 8 meal→symptom pairs for latency

---

## 📊 Test Cases

### **Test 1: Budget Chart (Today)**

**Command**: `!chart budget today`

**Expected**:
- PNG image (1200x700, retina 2x)
- Bar chart showing today's intake
- If Health data available: Burn shown as line
- Caption: `🍽️ Intake: 1,460 kcal • 🔥 Burn: 2,120 kcal • ⚖️ Net: -660 (69%)`
- Render time: <800ms (first), <300ms (cached)
- Image size: 100-250KB

**Screenshot expectation**:
- Clean bars with rounded corners
- Subtle grid lines
- Left-aligned title "Daily Budget"
- Legend showing Intake (solid) and Burn (line)

---

### **Test 2: Budget Chart (7 days)**

**Command**: `!chart budget 7d`

**Expected**:
- 7 bars (one per day)
- Both intake bars and burn line visible
- Caption: `Last 7 days — intake vs burn`
- X-axis labels: "Oct 13", "Oct 14", etc.

---

### **Test 3: Intake vs Burn Area (7 days)**

**Command**: `!chart intake 7d`

**Expected**:
- Area chart (filled for intake, line for burn)
- Smooth curves (tension: 0.3)
- Blue fill (14% alpha) for intake
- Red dashed line for burn
- Caption: `📊 Intake vs Burn — last 7 days`

---

### **Test 4: Reflux Trend (14 days)**

**Command**: `!chart reflux 14d`

**Expected**:
- Dual y-axis chart
- Left axis: Count (bars, faint cyan)
- Right axis: Severity (purple line, 1-10 scale)
- MA7 overlay (thick cyan line)
- Caption: `📊 Reflux Trend (14 days) — 12 events • count & severity with MA7`

**Edge case**: If no reflux events, shows message instead:
```
📊 No reflux events in the last 14 days. Great streak! 🎉
```

---

### **Test 5: Latency Distribution (30 days)**

**Command**: `!chart latency 30d`

**Expected**:
- Histogram with 15-min bins (0-15, 15-30, ..., 345-360)
- Bars show frequency
- Caption: `📊 Latency Distribution (30 days) — median 110 min (n=18)`

**Edge case**: If <3 samples:
```
📊 Not enough data yet (2 samples). Need at least 3 meal→symptom pairs.
```

---

### **Test 6: Trigger Combinations (30 days)**

**Command**: `!chart triggers 30d`

**Expected**:
- Horizontal bars (indexAxis: 'y')
- Labels include sample counts: "Caffeine (n=12)", "Dairy (n=8)"
- Bars show lift values (e.g., 1.8, 2.1)
- Only shows lift ≥1.3 with n≥3
- Green bars with darker border
- Caption: `📊 Trigger Combinations (30 days) — Top 3 by lift (min n=3)`

**Edge case**: If no triggers found:
```
📊 No strong trigger combinations detected (lift ≥1.3, min n=3). Keep tracking!
```

---

### **Test 7: Charts Menu (Interactive)**

**Command**: `!charts`

**Expected**:
- Embed listing all 5 chart types
- 2 rows of buttons:
  - Row 1: [Budget Today] [Budget 7d] [Intake 7d]
  - Row 2: [Reflux 14d] [Latency 30d] [Triggers 30d]
- Clicking button generates that chart immediately
- Buttons show emoji + label

---

### **Test 8: Chart via Command Palette**

**Command**: `!help chart`

**Expected**:
- Palette shows `!chart` command
- Lists all 5 subcommands (budget, intake, reflux, latency, triggers)
- Shows usage examples
- User can then run `!chart reflux 14d` directly

---

## ⏱️ Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| First render | <800ms | ___ms |
| Cached render | <300ms | ___ms |
| Image size | 100-250KB | ___KB |
| Dataset load | <500ms | ___ms |
| Cache hit rate | >80% (after 2nd call) | __% |

---

## 🎨 Visual Quality Checklist

**For all charts**:
- [ ] Retina-sharp (devicePixelRatio: 2)
- [ ] Consistent color palette (blues, reds, purples, greens)
- [ ] Readable fonts (14px for ticks, 24px for title)
- [ ] Subtle gridlines (rgba(0,0,0,0.06))
- [ ] Rounded bar corners (6px)
- [ ] Proper padding (24-28px)
- [ ] Accessible contrast (WCAG AA)
- [ ] No chartjunk (minimal, clean)

---

## 🐛 Error Handling Tests

### **Test 9: No Data**
**Command**: `!chart budget today` (on day with zero logs)

**Expected**:
- No image sent
- Text reply: `📊 No intake data found for this period. Start logging to see your budget!`

### **Test 10: Missing Health Data**
**Command**: `!chart budget today` (Peyton with no Health_Peyton data)

**Expected**:
- Chart shows intake bars only
- No burn line
- Caption: `🍽️ Intake: 1,460 kcal` (no burn mentioned)

### **Test 11: Render Failure**
**Simulate**: Break ChartService temporarily

**Expected**:
- Text fallback: `❌ Failed to generate chart. Please try again later.`
- Error logged to console

---

## 📈 Integration Tests

### **Test 12: Cache Invalidation**
1. Run `!chart budget today`
2. Log new food entry
3. Run `!chart budget today` again

**Expected**:
- Second chart reflects new entry (cache invalidated)

### **Test 13: Soft Delete Respect**
1. Run `!chart intake 7d`
2. Undo an entry (adds `deleted=true`)
3. Run `!chart intake 7d` again

**Expected**:
- Second chart excludes the deleted entry

---

## 🚀 Load Test

**Scenario**: 10 users request charts simultaneously

**Expected**:
- All charts render successfully
- No memory leaks
- Heap usage stays <500MB
- Response times remain under targets

---

## ✅ Acceptance Criteria

- [ ] All 5 chart types render successfully
- [ ] Charts are retina-sharp (2x scale)
- [ ] Captions are contextual and informative
- [ ] No data cases handled gracefully
- [ ] Cache speeds up 2nd call by >50%
- [ ] Images are 100-250KB
- [ ] All charts respect soft deletes (`deleted=true`)
- [ ] Interactive buttons work (!charts menu)
- [ ] Command Palette shows chart commands
- [ ] Performance targets met

---

## 📸 Sample Output Captions

```
!chart budget today
→ 🍽️ 1,460 kcal • 🔥 2,120 kcal • ⚖️ Net: -660 (69%)

!chart intake 7d
→ 📊 Intake vs Burn — last 7 days

!chart reflux 14d
→ 📊 Reflux Trend (14 days) — 12 events • count & severity with MA7

!chart latency 30d
→ 📊 Latency Distribution (30 days) — median 110 min (n=18)

!chart triggers 30d
→ 📊 Trigger Combinations (30 days) — Top 3 by lift (min n=3)
```

---

## 🎓 Next Steps

After testing:
1. Adjust color palette if needed
2. Tune font sizes for readability
3. Add more chart types (meal timing, category breakdown, etc.)
4. Consider adding chart exports to weekly digests
5. Integrate with dashboard (Metabase/Grafana)
