
# Dashboard Analytics with Notes v2.1

Notes v2.1 structured tokens enable powerful cross-cutting analysis without schema changes.

---

## 🍽️ Calories by Category

**Query Pattern**:
```javascript
const rows = await loadUserRows(googleSheets, 'Peyton', { sinceDays: 30 });
const byCategory = {};

rows.forEach(row => {
    if (row.Type !== 'food' && row.Type !== 'drink') return;

    const notes = parseNotes(row.Notes);
    const category = notes.get('category') || 'unknown';

    if (!byCategory[category]) byCategory[category] = 0;
    byCategory[category] += row.Calories || 0;
});

// Result: { grain: 4200, protein: 3800, caffeine: 890, ... }
```

**Dashboard**: Pie chart of calorie distribution by category

---

## 🔥 Reflux Incidents vs Dairy

**Query Pattern**:
```javascript
const refluxDays = new Set();
const dairyDays = new Set();

rows.forEach(row => {
    const notes = parseNotes(row.Notes);

    if (row.Type === 'reflux') {
        refluxDays.add(row.Date);
    }

    if (notes.has('dairy') && notes.get('dairy') === 'dairy') {
        dairyDays.add(row.Date);
    }
});

const overlap = [...refluxDays].filter(day => dairyDays.has(day)).length;
const correlation = overlap / refluxDays.size;

// Result: 0.67 (67% of reflux days had dairy)
```

**Dashboard**: Correlation heatmap (dairy vs symptoms)

---

## 🌙 Late Meal Frequency

**Query Pattern**:
```javascript
const lateMeals = rows.filter(row => {
    if (row.Type !== 'food' && row.Type !== 'drink') return false;

    const notes = parseNotes(row.Notes);
    return notes.get('meal') === 'late'; // 22:00-02:00
});

const byWeek = {};
lateMeals.forEach(row => {
    const week = moment(row.Date).week();
    byWeek[week] = (byWeek[week] || 0) + 1;
});

// Result: { week42: 3, week43: 5, week44: 1 }
```

**Dashboard**: Line chart of late eating trends

---

## ☕ Caffeine Load by Day

**Query Pattern**:
```javascript
const dailyCaffeine = {};

rows.forEach(row => {
    if (row.Type !== 'drink') return;

    const notes = parseNotes(row.Notes);
    if (!notes.has('caffeine')) return;

    const date = row.Date;
    if (!dailyCaffeine[date]) dailyCaffeine[date] = [];

    dailyCaffeine[date].push({
        item: row.Details,
        time: notes.get('time') || notes.get('time≈') || 'unknown',
        ml: notes.get('portion_ml') || 0
    });
});

// Result: { "2025-10-19": [{ item: "latte", time: "08:00", ml: 473 }, ...] }
```

**Dashboard**: Stacked bar chart (caffeine servings per day + timing)

---

## 🍜 Prep Method Distribution

**Query Pattern**:
```javascript
const byPrep = {};

rows.forEach(row => {
    if (row.Type !== 'food') return;

    const notes = parseNotes(row.Notes);
    const prep = notes.get('prep');

    if (prep) {
        byPrep[prep] = (byPrep[prep] || 0) + 1;
    }
});

// Result: { grilled: 12, fried: 3, baked: 8, raw: 5, ... }
```

**Dashboard**: Bar chart (cooking methods preference)

---

## 🌮 Cuisine Diversity

**Query Pattern**:
```javascript
const cuisines = {};

rows.forEach(row => {
    const notes = parseNotes(row.Notes);
    const cuisine = notes.get('cuisine');

    if (cuisine) {
        cuisines[cuisine] = (cuisines[cuisine] || 0) + 1;
    }
});

// Result: { mexican: 8, italian: 5, american: 12, ... }
```

**Dashboard**: Donut chart (cuisine variety)

---

## 🎯 Meal-Time Symptom Correlation

**Query Pattern**:
```javascript
const symptomsByMeal = {};

rows.forEach(row => {
    if (row.Type !== 'symptom' && row.Type !== 'reflux') return;

    const notes = parseNotes(row.Notes);
    const meal = notes.get('meal') || 'unknown';

    symptomsByMeal[meal] = (symptomsByMeal[meal] || 0) + 1;
});

// Result: { dinner: 15, late: 8, lunch: 3, breakfast: 1 }
```

**Dashboard**: Heatmap (meal period vs symptom frequency)

---

## 📊 Category + Time Matrix

**Query Pattern**:
```javascript
const matrix = {};

rows.forEach(row => {
    if (row.Type !== 'food') return;

    const notes = parseNotes(row.Notes);
    const category = notes.get('category') || 'unknown';
    const meal = notes.get('meal') || 'unknown';

    const key = `${meal}:${category}`;
    matrix[key] = (matrix[key] || 0) + row.Calories || 0;
});

// Result: { "breakfast:grain": 1200, "lunch:protein": 800, ... }
```

**Dashboard**: 2D heatmap (meal × category with calorie intensity)

---

## 🚀 Integration with Supabase/Metabase

**ETL Pattern** (for `cron/dailyRollup.js`):
```javascript
const { parseNotes } = require('../src/utils/notesValidator');

// During rollup, parse Notes and flatten to columns
const enrichedRow = {
    date: row.Date,
    user: row.User,
    type: row.Type,
    calories: row.Calories,

    // Parsed from Notes v2.1
    meal: parsed.get('meal'),
    category: parsed.get('category'),
    prep: parsed.get('prep'),
    caffeine: parsed.has('caffeine'),
    dairy_type: parsed.get('dairy'),

    // Analysis fields
    is_late_meal: parsed.get('meal') === 'late',
    has_portion: parsed.has('portion_g') || parsed.has('portion_ml'),
    confidence: parsed.get('confidence')
};

// Write to Supabase for dashboards
await supabase.from('daily_enriched').insert(enrichedRow);
```

---

## 📈 Example Dashboard Panels

### **Panel 1: Calorie Distribution**
- Pie chart: Calories by category (grain 35%, protein 30%, caffeine 15%, ...)
- Filters: Date range, meal period

### **Panel 2: Symptom Triggers**
- Bar chart: Reflux incidents grouped by meal period
- Overlay: Dairy vs non-dairy days
- Correlation coefficient displayed

### **Panel 3: Late Eating Trends**
- Line chart: Late meals per week
- Alert: Highlight weeks with >3 late meals

### **Panel 4: Caffeine Timeline**
- Timeline: Daily caffeine servings with time dots
- Red zone: After 14:00
- Total ml/day calculation

### **Panel 5: Prep Method Health Score**
- Comparison: Grilled/baked (healthy) vs fried (trigger)
- Symptom rate by prep method

---

## 🔍 Advanced Queries

### **Find Trigger Combinations**:
```javascript
// Dairy + Late + Fried = High reflux risk?
const combos = rows.filter(row => {
    const notes = parseNotes(row.Notes);
    return notes.get('dairy') === 'dairy' &&
           notes.get('meal') === 'late' &&
           notes.get('prep') === 'fried';
});

const subsequentSymptoms = combos.filter(meal => {
    // Check for symptom within 6h
    const mealTime = new Date(meal.Timestamp);
    const symptom = rows.find(r =>
        r.Type === 'reflux' &&
        new Date(r.Timestamp) > mealTime &&
        (new Date(r.Timestamp) - mealTime) < 6 * 60 * 60 * 1000
    );
    return !!symptom;
});

console.log(`Combo trigger rate: ${(subsequentSymptoms.length / combos.length * 100).toFixed(0)}%`);
```

---

## 🎯 Recommended Tools

- **Metabase**: Connect to Sheets API, auto-refresh dashboards
- **Supabase**: Replicate Sheets → Postgres for fast queries
- **Grafana**: Time-series visualization for trends
- **Custom React Dashboard**: Full control with recharts/d3

All powered by **Notes v2.1 structured tokens**! 🚀
