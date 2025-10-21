# NLU V2 Acceptance Test Suite

## Overview
This document contains 60+ test cases for the NLU V2 system, covering all major scenarios and edge cases.

---

## 🍽️ Food Logging Tests

### Basic Food Items
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "I had chicken salad" | food | item: "chicken salad" | ≥0.8 |
| "ate a banana" | food | item: "banana" | ≥0.8 |
| "had pizza for dinner" | food | item: "pizza", meal_time: "dinner" | ≥0.8 |
| "chicken and rice" | food | item: "chicken and rice" | ≥0.8 |
| "oatmeal with berries" | food | item: "oatmeal", sides: "berries" | ≥0.8 |

### Complex Meals with Sides
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "chicken salad with ranch dressing" | food | item: "chicken salad", sides: "ranch dressing" | ≥0.8 |
| "pasta with marinara sauce and parmesan" | food | item: "pasta", sides: "marinara sauce and parmesan" | ≥0.8 |
| "eggs with toast and butter" | food | item: "eggs", sides: "toast and butter" | ≥0.8 |
| "rice bowl with vegetables and tofu" | food | item: "rice bowl", sides: "vegetables and tofu" | ≥0.8 |
| "sandwich with lettuce, tomato, and mayo" | food | item: "sandwich", sides: "lettuce, tomato, and mayo" | ≥0.8 |

### Brand-Specific Items
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "Life cereal" | food | item: "Life cereal", brand: "Life" | ≥0.8 |
| "Cheerios with milk" | food | item: "Cheerios", sides: "milk", brand: "Cheerios" | ≥0.8 |
| "Oatly oat milk" | food | item: "Oatly oat milk", brand: "Oatly" | ≥0.8 |
| "Starbucks coffee" | food | item: "Starbucks coffee", brand: "Starbucks" | ≥0.8 |
| "Trader Joe's granola" | food | item: "Trader Joe's granola", brand: "Trader Joe's" | ≥0.8 |

### Portion-Specific Items
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "2 cups of rice" | food | item: "rice", quantity: "2", unit: "cups" | ≥0.8 |
| "1 slice of bread" | food | item: "bread", quantity: "1", unit: "slice" | ≥0.8 |
| "half a banana" | food | item: "banana", quantity: "0.5", unit: "banana" | ≥0.8 |
| "3 tablespoons of peanut butter" | food | item: "peanut butter", quantity: "3", unit: "tablespoons" | ≥0.8 |
| "1 bowl of soup" | food | item: "soup", quantity: "1", unit: "bowl" | ≥0.8 |

---

## 🥤 Drink Logging Tests

### Basic Drinks
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "drank water" | drink | item: "water" | ≥0.8 |
| "had coffee" | drink | item: "coffee" | ≥0.8 |
| "drank tea" | drink | item: "tea" | ≥0.8 |
| "had orange juice" | drink | item: "orange juice" | ≥0.8 |
| "drank a smoothie" | drink | item: "smoothie" | ≥0.8 |

### Coffee Variations
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "black coffee" | drink | item: "black coffee", caffeine_type: "caffeinated" | ≥0.8 |
| "decaf coffee" | drink | item: "decaf coffee", caffeine_type: "decaf" | ≥0.8 |
| "coffee with cream" | drink | item: "coffee", sides: "cream" | ≥0.8 |
| "coffee with sugar" | drink | item: "coffee", sides: "sugar" | ≥0.8 |
| "iced coffee" | drink | item: "iced coffee" | ≥0.8 |

### Tea Variations
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "green tea" | drink | item: "green tea" | ≥0.8 |
| "chai tea" | drink | item: "chai tea" | ≥0.8 |
| "herbal tea" | drink | item: "herbal tea", caffeine_type: "decaf" | ≥0.8 |
| "iced tea" | drink | item: "iced tea" | ≥0.8 |
| "chai latte" | drink | item: "chai latte" | ≥0.8 |

### Milk Alternatives
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "oat milk" | drink | item: "oat milk", dairy_type: "non-dairy" | ≥0.8 |
| "almond milk" | drink | item: "almond milk", dairy_type: "non-dairy" | ≥0.8 |
| "soy milk" | drink | item: "soy milk", dairy_type: "non-dairy" | ≥0.8 |
| "coconut milk" | drink | item: "coconut milk", dairy_type: "non-dairy" | ≥0.8 |
| "regular milk" | drink | item: "milk", dairy_type: "dairy" | ≥0.8 |

---

## 🩺 Symptom Logging Tests

### Basic Symptoms
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "stomach pain" | symptom | symptom_type: "stomach pain" | ≥0.8 |
| "bloating" | symptom | symptom_type: "bloating" | ≥0.8 |
| "nausea" | symptom | symptom_type: "nausea" | ≥0.8 |
| "gas" | symptom | symptom_type: "gas" | ≥0.8 |
| "cramps" | symptom | symptom_type: "cramps" | ≥0.8 |

### Symptoms with Severity
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "mild stomach pain" | symptom | symptom_type: "stomach pain", severity: 3 | ≥0.8 |
| "severe bloating" | symptom | symptom_type: "bloating", severity: 8 | ≥0.8 |
| "moderate nausea" | symptom | symptom_type: "nausea", severity: 6 | ≥0.8 |
| "bad gas" | symptom | symptom_type: "gas", severity: 7 | ≥0.8 |
| "terrible cramps" | symptom | symptom_type: "cramps", severity: 9 | ≥0.8 |

### Numeric Severity
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "stomach pain level 5" | symptom | symptom_type: "stomach pain", severity: 5 | ≥0.8 |
| "bloating severity 8" | symptom | symptom_type: "bloating", severity: 8 | ≥0.8 |
| "nausea 3 out of 10" | symptom | symptom_type: "nausea", severity: 3 | ≥0.8 |
| "gas level 7" | symptom | symptom_type: "gas", severity: 7 | ≥0.8 |
| "cramps 9/10" | symptom | symptom_type: "cramps", severity: 9 | ≥0.8 |

---

## 🔥 Reflux Logging Tests

### Basic Reflux
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "reflux" | reflux | symptom_type: "reflux" | ≥0.8 |
| "heartburn" | reflux | symptom_type: "heartburn" | ≥0.8 |
| "acid reflux" | reflux | symptom_type: "reflux" | ≥0.8 |
| "chest burning" | reflux | symptom_type: "chest burning" | ≥0.8 |
| "throat burning" | reflux | symptom_type: "throat burning" | ≥0.8 |

### Reflux with Severity
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "mild reflux" | reflux | symptom_type: "reflux", severity: 3 | ≥0.8 |
| "severe heartburn" | reflux | symptom_type: "heartburn", severity: 8 | ≥0.8 |
| "bad acid reflux" | reflux | symptom_type: "reflux", severity: 7 | ≥0.8 |
| "terrible chest burning" | reflux | symptom_type: "chest burning", severity: 9 | ≥0.8 |
| "awful throat burning" | reflux | symptom_type: "throat burning", severity: 9 | ≥0.8 |

---

## 💩 Bowel Movement Tests

### Basic BM
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "bm" | bm | item: "bm" | ≥0.8 |
| "bowel movement" | bm | item: "bowel movement" | ≥0.8 |
| "poop" | bm | item: "poop" | ≥0.8 |
| "stool" | bm | item: "stool" | ≥0.8 |
| "went to bathroom" | bm | item: "bm" | ≥0.8 |

### BM with Bristol Scale
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "bm bristol 4" | bm | item: "bm", bristol: 4 | ≥0.8 |
| "bowel movement bristol 6" | bm | item: "bowel movement", bristol: 6 | ≥0.8 |
| "poop bristol 2" | bm | item: "poop", bristol: 2 | ≥0.8 |
| "stool bristol 5" | bm | item: "stool", bristol: 5 | ≥0.8 |
| "bm scale 3" | bm | item: "bm", bristol: 3 | ≥0.8 |

### BM Descriptions
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "normal bm" | bm | item: "bm", bristol: 4 | ≥0.8 |
| "loose stool" | bm | item: "stool", bristol: 6 | ≥0.8 |
| "hard stool" | bm | item: "stool", bristol: 2 | ≥0.8 |
| "diarrhea" | bm | item: "diarrhea", bristol: 7 | ≥0.8 |
| "constipation" | bm | item: "constipation", bristol: 1 | ≥0.8 |

---

## 😊 Mood and Check-in Tests

### Mood Logging
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "feeling good" | mood | item: "good" | ≥0.8 |
| "feeling tired" | mood | item: "tired" | ≥0.8 |
| "feeling energetic" | mood | item: "energetic" | ≥0.8 |
| "feeling bloated" | mood | item: "bloated" | ≥0.8 |
| "feeling nauseous" | mood | item: "nauseous" | ≥0.8 |

### Check-in Responses
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "good" | checkin | item: "good" | ≥0.8 |
| "okay" | checkin | item: "okay" | ≥0.8 |
| "bad" | checkin | item: "bad" | ≥0.8 |
| "fine" | checkin | item: "fine" | ≥0.8 |
| "not great" | checkin | item: "not great" | ≥0.8 |

---

## 🕐 Time-Based Tests

### Time References
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "had breakfast at 8am" | food | item: "breakfast", time: "8am", meal_time: "breakfast" | ≥0.8 |
| "lunch at noon" | food | item: "lunch", time: "noon", meal_time: "lunch" | ≥0.8 |
| "dinner at 7pm" | food | item: "dinner", time: "7pm", meal_time: "dinner" | ≥0.8 |
| "snack at 3pm" | food | item: "snack", time: "3pm", meal_time: "snack" | ≥0.8 |
| "coffee this morning" | drink | item: "coffee", time: "morning", meal_time: "breakfast" | ≥0.8 |

### Relative Time
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "had lunch an hour ago" | food | item: "lunch", time: "an hour ago", meal_time: "lunch" | ≥0.8 |
| "drank coffee earlier" | drink | item: "coffee", time: "earlier" | ≥0.8 |
| "ate breakfast this morning" | food | item: "breakfast", time: "this morning", meal_time: "breakfast" | ≥0.8 |
| "had dinner last night" | food | item: "dinner", time: "last night", meal_time: "dinner" | ≥0.8 |
| "snack a few hours ago" | food | item: "snack", time: "a few hours ago", meal_time: "snack" | ≥0.8 |

---

## ❌ Negation Tests

### Negative Food
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "no coffee today" | other | item: "coffee", negated: true | ≥0.8 |
| "didn't have lunch" | other | item: "lunch", negated: true | ≥0.8 |
| "skipped breakfast" | other | item: "breakfast", negated: true | ≥0.8 |
| "avoided dairy" | other | item: "dairy", negated: true | ≥0.8 |
| "no gluten today" | other | item: "gluten", negated: true | ≥0.8 |

### Negative Symptoms
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "no symptoms" | other | item: "symptoms", negated: true | ≥0.8 |
| "no pain" | other | item: "pain", negated: true | ≥0.8 |
| "no bloating" | other | item: "bloating", negated: true | ≥0.8 |
| "no reflux" | other | item: "reflux", negated: true | ≥0.8 |
| "no nausea" | other | item: "nausea", negated: true | ≥0.8 |

---

## 🔄 Multi-Intent Tests

### Food + Symptom
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "had pizza and got heartburn" | food | item: "pizza", secondary: "heartburn" | ≥0.7 |
| "ate dairy and felt bloated" | food | item: "dairy", secondary: "bloated" | ≥0.7 |
| "had coffee and stomach pain" | food | item: "coffee", secondary: "stomach pain" | ≥0.7 |

### Drink + Symptom
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "drank milk and got gas" | drink | item: "milk", secondary: "gas" | ≥0.7 |
| "had coffee and reflux" | drink | item: "coffee", secondary: "reflux" | ≥0.7 |
| "drank soda and bloating" | drink | item: "soda", secondary: "bloating" | ≥0.7 |

---

## 🧪 Edge Case Tests

### Ambiguous Items
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "coffee" | drink | item: "coffee" | ≥0.7 |
| "soup" | food | item: "soup" | ≥0.7 |
| "smoothie" | drink | item: "smoothie" | ≥0.7 |
| "milk" | drink | item: "milk" | ≥0.7 |
| "juice" | drink | item: "juice" | ≥0.7 |

### Complex Sentences
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "I had a really good chicken salad with lots of vegetables for lunch" | food | item: "chicken salad", sides: "vegetables", meal_time: "lunch" | ≥0.7 |
| "Drank some delicious herbal tea this afternoon" | drink | item: "herbal tea", time: "afternoon" | ≥0.7 |
| "Had terrible stomach pain after eating spicy food" | symptom | symptom_type: "stomach pain", severity: 8 | ≥0.7 |

### Typos and Variations
| Input | Expected Intent | Expected Slots | Confidence |
|-------|----------------|----------------|------------|
| "chiken salad" | food | item: "chicken salad" | ≥0.6 |
| "cofee" | drink | item: "coffee" | ≥0.6 |
| "stomache pain" | symptom | symptom_type: "stomach pain" | ≥0.6 |
| "reflx" | reflux | symptom_type: "reflux" | ≥0.6 |
| "bloatng" | symptom | symptom_type: "bloating" | ≥0.6 |

---

## 📊 Performance Tests

### Response Time
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Simple food logging | <100ms | | |
| Complex meal parsing | <200ms | | |
| Symptom with severity | <150ms | | |
| Multi-intent parsing | <300ms | | |
| LLM fallback | <800ms | | |

### Memory Usage
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Peak memory usage | <50MB | | |
| Memory growth rate | <1MB/hour | | |
| Garbage collection | <5% CPU | | |

---

## 🎯 Success Criteria

### Acceptance Rate Targets
- **Overall**: ≥90%
- **Food logging**: ≥95%
- **Symptom logging**: ≥90%
- **Drink logging**: ≥95%
- **BM logging**: ≥85%

### Performance Targets
- **Average response time**: <200ms
- **95th percentile**: <500ms
- **99th percentile**: <1000ms
- **LLM usage**: <25%

### Error Rate Targets
- **Overall error rate**: <5%
- **Timeout rate**: <2%
- **Validation errors**: <1%
- **System errors**: <0.5%

---

## 🔧 Test Execution

### Automated Testing
```bash
# Run all acceptance tests
npm run test:acceptance

# Run specific test categories
npm run test:food
npm run test:symptoms
npm run test:performance

# Generate test report
npm run test:report
```

### Manual Testing
1. Use the test cases above in the Discord bot
2. Verify expected outputs match actual outputs
3. Record any discrepancies
4. Update test cases as needed

### Continuous Integration
- Run tests on every commit
- Generate coverage reports
- Alert on performance regressions
- Track acceptance rate trends

---

This test suite ensures the NLU V2 system meets all quality and performance requirements while providing comprehensive coverage of real-world usage scenarios.
