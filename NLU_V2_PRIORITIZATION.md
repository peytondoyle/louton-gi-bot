# NLU V2 Implementation Prioritization Guide

## 🎯 Overview
The NLU V2 system is designed to improve acceptance rates from ~70% to 90-95% while reducing LLM usage to ≤25%. This guide breaks down the remaining work into prioritized phases.

---

## 📊 Current Status
- **Completed**: Phases 1-2 (Foundation + Core) ✅
- **Remaining**: Phases 3-6 (Quality, Observability, UX, Documentation)
- **Current Acceptance Rate**: ~70%
- **Target Acceptance Rate**: 90-95%

---

## 🚀 Phase 3: Quality & Safety (HIGH PRIORITY)

### **7. postprocess.js** - Token Normalization
**Priority**: HIGH | **Effort**: Medium | **Impact**: High

**What it does**:
- Normalizes tokens (strips trailing meal phrases like "for breakfast")
- Ensures canonical ordering of slots
- Cleans up parsing artifacts

**Implementation**:
```javascript
// Example transformations:
"chicken salad for lunch" → "chicken salad"
"egg bite and jasmine tea" → "egg bite" + secondary: "jasmine tea"
"mild reflux after dinner" → "reflux" + severity: "mild" + time: "after dinner"
```

**Benefits**:
- Cleaner data storage
- Better pattern recognition
- Improved user experience

---

### **8. disambiguate.js** - Multi-Candidate Resolution
**Priority**: HIGH | **Effort**: Medium | **Impact**: High

**What it does**:
- Resolves conflicts when multiple interpretations are possible
- Uses context and user history for tie-breaking
- Handles edge cases like "coffee" (drink vs food)

**Implementation**:
```javascript
// Example scenarios:
"coffee" → Check context: "had coffee" (drink) vs "coffee cake" (food)
"chicken" → Check modifiers: "chicken salad" (food) vs "chicken soup" (food)
```

**Benefits**:
- Reduces false positives
- Improves accuracy for ambiguous inputs
- Better handling of context-dependent parsing

---

## 📈 Phase 4: Observability (MEDIUM PRIORITY)

### **9. metrics.js** - Coverage Counters
**Priority**: MEDIUM | **Effort**: Low | **Impact**: Medium

**What it does**:
- Tracks acceptance rates by category (strict/lenient/rescued/rejected)
- Monitors LLM usage patterns
- Records performance metrics

**Implementation**:
```javascript
// Metrics tracked:
- strict_accept: 45%
- lenient_accept: 30%
- rescued_accept: 15%
- llm_used: 8%
- rejected: 2%
```

**Benefits**:
- System health monitoring
- Performance optimization insights
- User experience analytics

---

### **10. coverageReport.js** - Periodic Stats
**Priority**: MEDIUM | **Effort**: Low | **Impact**: Medium

**What it does**:
- Generates daily/weekly reports
- Identifies patterns in failures
- Suggests improvements

**Benefits**:
- Proactive issue detection
- Data-driven improvements
- System maintenance insights

---

### **11. tests/acceptance.md** - Test Suite
**Priority**: MEDIUM | **Effort**: High | **Impact**: High

**What it does**:
- 60+ test cases with expected outputs
- Covers edge cases and common scenarios
- Automated regression testing

**Test Categories**:
- Basic food logging
- Complex meals with sides
- Symptom logging with severity
- Time-based entries
- Negation handling
- Multi-intent scenarios

**Benefits**:
- Prevents regressions
- Ensures quality
- Facilitates safe refactoring

---

### **12. bench.js** - Performance Validation
**Priority**: MEDIUM | **Effort**: Low | **Impact**: Medium

**What it does**:
- Validates <1ms fast path performance
- Load testing for high-volume scenarios
- Memory usage monitoring

**Benefits**:
- Performance guarantees
- Scalability validation
- Resource optimization

---

## 🎨 Phase 5: Advanced UX (LOW PRIORITY)

### **13. chipsNLU.js** - Secondary Intent Detection
**Priority**: LOW | **Effort**: High | **Impact**: Medium

**What it does**:
- Detects secondary intents in complex messages
- Shows interactive chips for additional actions
- Example: "had egg bite and jasmine tea" → Shows "Also log 'jasmine tea'?" chip

**Implementation**:
```javascript
// Example flow:
User: "had egg bite and jasmine tea"
Bot: "Logged egg bite. Also log 'jasmine tea'?" [Yes] [No]
```

**Benefits**:
- Captures more data per interaction
- Reduces follow-up messages
- Improves user experience

---

## 📚 Phase 6: Documentation (LOW PRIORITY)

### **14. Final CHANGELOG.md** - Complete Narrative
**Priority**: LOW | **Effort**: Low | **Impact**: Low

**What it does**:
- Documents all changes and improvements
- Provides migration guide
- Explains new features

---

## 🎯 Recommended Implementation Order

### **Immediate (Next 1-2 weeks)**
1. **postprocess.js** - Critical for data quality
2. **disambiguate.js** - Essential for accuracy
3. **metrics.js** - Needed for monitoring

### **Short-term (Next month)**
4. **tests/acceptance.md** - Comprehensive testing
5. **coverageReport.js** - Analytics and insights
6. **bench.js** - Performance validation

### **Long-term (Future iterations)**
7. **chipsNLU.js** - Advanced UX features
8. **Final CHANGELOG.md** - Documentation

---

## 💡 Implementation Tips

### **For postprocess.js**:
- Focus on common patterns first
- Use regex for simple transformations
- Test with real user data

### **For disambiguate.js**:
- Start with high-confidence rules
- Use user history for context
- Implement fallback strategies

### **For metrics.js**:
- Use lightweight counters
- Store in memory with periodic dumps
- Focus on actionable metrics

### **For tests/acceptance.md**:
- Start with happy path scenarios
- Add edge cases incrementally
- Use real user examples

---

## 🔧 Technical Considerations

### **Performance**:
- Keep fast path <1ms
- Use caching for expensive operations
- Monitor memory usage

### **Maintainability**:
- Clear separation of concerns
- Comprehensive error handling
- Extensive logging

### **Scalability**:
- Stateless design
- Efficient data structures
- Minimal external dependencies

---

## 📈 Success Metrics

### **Phase 3 Completion**:
- Acceptance rate: 85-90%
- LLM usage: 10-15%
- Reject rate: 5%

### **Phase 4 Completion**:
- Full observability
- Automated testing
- Performance validation

### **Phase 5 Completion**:
- Secondary intent detection
- Enhanced UX
- 90-95% acceptance rate

---

## 🚨 Risk Mitigation

### **High-Risk Items**:
- **disambiguate.js**: Complex logic, test thoroughly
- **chipsNLU.js**: High effort, consider deferring

### **Low-Risk Items**:
- **metrics.js**: Straightforward implementation
- **postprocess.js**: Well-defined transformations

### **Mitigation Strategies**:
- Implement incrementally
- Extensive testing at each step
- Rollback plans for each component
- Performance monitoring throughout

---

This prioritization ensures the most critical improvements are implemented first while maintaining system stability and performance.
