# Notes Column Schema Specification v2.1

This document describes all structured tokens that can appear in the **Notes** column of GI tracking sheets.

## Overview

The Notes column contains semi-structured metadata extracted from natural language input. Each token follows the format `key=value` or `flag` (for boolean indicators).

**Version**: 2.1 (NLU V2 + Structured Tokens)
**Format**: Canonical ordering enforced by notesValidator.js
**Separator**: `; ` (semicolon + space)

## Complete Token Reference (v2.1)

| Key | Type | Values/Format | Example | Description |
|-----|------|---------------|---------|-------------|
| `notes_v` | version | `2.1` | `notes_v=2.1` | **Always first** - Schema version |
| `meal` | enum | breakfast\|lunch\|dinner\|snack\|late | `meal=breakfast` | Meal period |
| `time` | time | HH:mm:ss | `time=07:45:00` | Absolute time |
| `time≈` | enum | morning\|midday\|afternoon\|evening\|night\|late | `time≈=morning` | Approximate time |
| `category` | enum | grain\|protein\|dairy\|non_dairy\|veg\|fruit\|caffeine\|sweet\|fat | `category=grain` | **NEW** Primary food category |
| `prep` | enum | raw\|baked\|fried\|boiled\|steamed\|roasted\|grilled\|iced\|hot | `prep=grilled` | **NEW** Preparation method |
| `cuisine` | enum | american\|mexican\|italian\|indian\|japanese\|thai\|chinese\|mediterranean\|other | `cuisine=mexican` | **NEW** Cultural origin |
| `context` | enum | default\|on_the_go\|social\|post_workout\|late\|travel | `context=on_the_go` | **NEW** Consumption context |
| `size` | enum | short\|tall\|grande\|venti\|trenta\|small\|medium\|large | `size=grande` | Café size |
| `portion` | string | User-specified | `portion=2 slices` | Raw portion text |
| `portion_g` | number | Grams | `portion_g=56` | Normalized grams |
| `portion_ml` | number | Milliliters | `portion_ml=473` | Normalized milliliters |
| `brand` | string | Brand name | `brand=Oatly` | Generic brand |
| `brand_variant` | string | Specific variant | `brand_variant=oatly barista` | Detailed brand |
| `variant` | string | Variant type | `variant=barista` | Variant classification |
| `dairy` | flag/enum | dairy\|non_dairy | `dairy=non_dairy` | Dairy classification |
| `non_dairy` | flag | - | `non_dairy` | Non-dairy flag |
| `caffeine` | flag | - | `caffeine` | Contains caffeine |
| `decaf` | flag | - | `decaf` | Decaffeinated |
| `sides` | string | Comma-separated | `sides=banana & oat milk` | Accompanying items |
| `sweetener` | string | Description | `sweetener=2 pumps vanilla` | Added sweeteners |
| `severity` | number | 1-10 | `severity=7` | Symptom severity |
| `bristol` | number | 1-7 | `bristol=4` | Bristol stool scale |
| `symptom_type` | string | pain\|reflux\|bloat\|nausea | `symptom_type=reflux` | Symptom classification |
| `confidence` | enum | rules\|llm\|merged\|manual | `confidence=rules` | **NEW** Parse source |
| `suspected_trigger` | string | Description | `suspected_trigger=coffee 90min ago` | Linked trigger |
| `severity_note` | string | Auto-note | `severity_note=auto-detected from adjective` | Metadata |
| `bristol_note` | string | Auto-note | `bristol_note=auto-detected from loose` | Metadata |
| `meal_time_note` | string | Auto-note | `meal_time_note=inferred from current time` | Metadata |
| `deleted` | flag | - | `deleted` | Soft delete |
| `photo` | url | URL | `photo=https://...` | Single photo |
| `photo1` | url | URL | `photo1=https://...` | Multiple photos |

---

## V2.1 New Features

### 🏷️ Auto-Classification
- **category**: Automatically inferred from item (oats→grain, eggs→protein, coffee→caffeine)
- **prep**: Detected from text keywords (grilled, fried, baked, iced)
- **confidence**: Tracks parse source (rules, llm, merged)

### ⏰ Enhanced Time Tracking
- **time≈**: Approximate time buckets for analysis
- **meal**: Standardized meal periods (5-11=breakfast, 11-15=lunch, etc.)

### 📊 Analysis-Ready
All new tokens use **controlled vocabularies** for reliable cross-cutting queries.

---

## V2.1 Canonical Order Example

```
notes_v=2.1; meal=breakfast; time≈=morning; category=protein; non_dairy; portion=1 cup; sides=jasmine tea; confidence=rules
```

**Key Points**:
- ✅ Version tag always first
- ✅ Time/meal before classification
- ✅ Portions before brands
- ✅ Flags before sides
- ✅ Confidence before notes
- ✅ System flags (deleted, photo) last

---

### 🍽️ Meal & Timing (Original)

| Token | Format | Example | Description |
|-------|--------|---------|-------------|
| `meal=` | `meal={breakfast\|lunch\|dinner\|snack}` | `meal=breakfast` | Meal time classification |
| `time=` | `time=HH:MM:SS` | `time=08:30:00` | Specific time (when not meal-based) |
| `inferred from current time` | Flag | - | Indicates meal time was auto-detected from clock |

### 📏 Portions & Quantities

| Token | Format | Example | Description |
|-------|--------|---------|-------------|
| `portion=` | `portion={text}` | `portion=2 slices` | Raw portion text as entered by user |
| `portion_g=` | `portion_g={number}` | `portion_g=56` | Normalized portion in grams |
| `portion_ml=` | `portion_ml={number}` | `portion_ml=473` | Normalized portion in milliliters |
| `qty=` | `qty={text}` | `qty=16oz` | **Legacy** quantity (superseded by portion tokens) |

### 🏷️ Brands & Variants

| Token | Format | Example | Description |
|-------|--------|---------|-------------|
| `brand=` | `brand={text}` | `brand=Oatly` | Generic brand name (capitalized words) |
| `brand_variant=` | `brand_variant={text}` | `brand_variant=oatly barista` | Specific brand variant from lexicon |
| `variant=` | `variant={type}` | `variant=barista` | Variant type (unsweetened, barista, etc.) |

### 🥗 Ingredients

| Token | Format | Example | Description |
|-------|--------|---------|-------------|
| `sides=` | `sides={text}` | `sides=banana` | Side items parsed from "with X" |

### ☕ Caffeine & Substances

| Token | Format | Example | Description |
|-------|--------|---------|-------------|
| `caffeine` | Flag | - | Item contains caffeine |
| `decaf` | Flag | - | Item is decaffeinated |

### 🔥 Calories

| Token | Format | Example | Description |
|-------|--------|---------|-------------|
| `calories≈{number}` | Inline value | `calories≈350` | Estimated calories (stored in Notes, not Calories column) |
| `calories=pending` | Flag | - | Calorie estimation in progress |
| `calories=disabled` | Flag | - | User has calorie tracking disabled |

> **Note**: Calories are displayed in the **Calories** column, but estimation metadata appears in Notes.

### 🤢 Symptoms

| Token | Format | Example | Description |
|-------|--------|---------|-------------|
| `severity={1-10}` | Inline value | `severity=7` | Symptom severity rating |
| `auto-detected from adjective` | Flag | - | Severity inferred from words like "mild", "severe" |
| `suspected_trigger={item}` | Text | `suspected_trigger=coffee 90min ago` | Linked trigger food/drink |

### 💩 Bowel Movements

| Token | Format | Example | Description |
|-------|--------|---------|-------------|
| `bristol={1-7}` | Inline value | `bristol=4` | Bristol Stool Scale rating |
| `auto-detected from loose/diarrhea` | Flag | - | Bristol auto-set from descriptors |
| `auto-detected from hard/constipated` | Flag | - | Bristol auto-set from descriptors |
| `auto-detected from normal` | Flag | - | Bristol auto-set from descriptors |

## Examples

### Food Entry with Portion
```
User: "had 2 slices of Life cereal with banana for breakfast"

Notes:
meal=breakfast, portion=2 slices, portion_g=56, sides=banana, brand_variant=life cereal
```

### Drink with Brand Variant
```
User: "grande oatly barista latte"

Notes:
portion=grande, portion_ml=473, brand_variant=oatly barista, variant=barista, caffeine
```

### Symptom with Auto-Severity
```
User: "mild reflux"

Notes:
severity=3, auto-detected from adjective
```

### Bowel Movement
```
User: "bad poop this morning"

Notes:
bristol=6, auto-detected from loose/diarrhea, meal=breakfast, inferred from current time
```

## Calorie Multipliers

Portions and brand variants affect calorie estimates through multipliers:

| Multiplier Source | Base | Example |
|-------------------|------|---------|
| Portion | Standard serving | `2 slices` → 2× base calories |
| Coffee size | 1 cup (236ml) | `grande` (473ml) → 2× base |
| Brand variant | Generic variant | `oatly barista` vs `oatly unsweetened` → 2.33× |

Multipliers stack:
```
"grande oatly barista latte"
= latte calories (190 kcal)
× coffee size (473ml/236ml = 2.0)
× brand variant (140/120 = 1.17)
= ~445 kcal
```

## Backward Compatibility

Legacy tokens are maintained but superseded by newer formats:

- `qty=16oz` → Use `portion=16oz, portion_ml=473` instead
- Generic `brand=Oatly` → Use `brand_variant=oatly barista, variant=barista` for specificity

## Data Quality Guards

Entries may be rejected before logging if:

1. **Confidence < 0.8**: Intent unclear, user prompted for clarification
2. **Item < 3 chars**: Too short, asks "Are you sure?"
3. **No noun detected**: Invalid food/drink item
4. **Duplicate message**: Same user + text within 2 seconds → deduplicated

## Schema Version

**Version**: 2.0
**Last Updated**: 2025-10-19
**Changes**: Added portion_g/portion_ml, brand_variant, caffeine detection
