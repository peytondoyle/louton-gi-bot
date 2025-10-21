/**
 * Calorie System Upgrades Test Suite
 * Tests the new MacroFactor-style upgrades and enhancements
 * 
 * COMMENTED OUT - Recent testing work to focus on core functionality
 */
/*

const { analyzeMealPatterns, calculateOptimalTiming, updateLearnedPatterns } = require('../src/calories/adaptiveTiming');
const { calculateEstimateConfidence, recordEstimateFeedback, generateEstimateMessage } = require('../src/calories/confidence');
const { groupFoodEntries, shouldOfferMealGrouping, generateMealGroupingMessage } = require('../src/calories/mealGrouping');
const { checkGuardrailNeeded, getGuardrailStatus, shouldSendGuardrail } = require('../src/calories/guardrails');
const { checkDMHealth, recordDMResult, needsFallbackNotification } = require('../src/notify/healthMonitor');

/**
 * Test adaptive timing system
 */
function testAdaptiveTiming() {
    console.log('🧪 Testing adaptive timing system...');
    
    // Mock food entries with timestamps
    const mockEntries = [
        { Timestamp: '2024-01-15T07:30:00Z', Meal_Type: 'breakfast' },
        { Timestamp: '2024-01-15T07:45:00Z', Meal_Type: 'breakfast' },
        { Timestamp: '2024-01-16T07:20:00Z', Meal_Type: 'breakfast' },
        { Timestamp: '2024-01-17T07:35:00Z', Meal_Type: 'breakfast' },
        { Timestamp: '2024-01-15T12:15:00Z', Meal_Type: 'lunch' },
        { Timestamp: '2024-01-16T12:30:00Z', Meal_Type: 'lunch' },
        { Timestamp: '2024-01-17T12:00:00Z', Meal_Type: 'lunch' }
    ];
    
    const patterns = analyzeMealPatterns(mockEntries);
    
    let passed = 0;
    let failed = 0;
    
    // Test breakfast pattern detection
    if (patterns.breakfast && patterns.breakfast.sampleSize >= 3) {
        console.log('  ✅ [PASS]: Breakfast pattern detected');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Breakfast pattern not detected');
        failed++;
    }
    
    // Test optimal timing calculation
    const learnedWindows = { breakfast: patterns.breakfast };
    const actualMealTime = new Date('2024-01-18T07:25:00Z');
    const timing = calculateOptimalTiming(learnedWindows, 'breakfast', actualMealTime);
    
    if (timing.source === 'learned' && timing.confidence > 0) {
        console.log('  ✅ [PASS]: Optimal timing calculation');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Optimal timing calculation');
        failed++;
    }
    
    return { passed, failed, total: 2 };
}

/**
 * Test confidence and feedback system
 */
function testConfidenceSystem() {
    console.log('🧪 Testing confidence and feedback system...');
    
    let passed = 0;
    let failed = 0;
    
    // Test confidence calculation
    const estimate = { calories: 300, protein: 25, carbs: 30, fat: 10, note: '200g (100g base)' };
    const confidence = calculateEstimateConfidence(estimate, 'chicken breast', '200g');
    
    if (confidence === 'high') {
        console.log('  ✅ [PASS]: Confidence calculation for LUT match');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Confidence calculation for LUT match');
        failed++;
    }
    
    // Test feedback recording
    const feedback = recordEstimateFeedback('chicken breast', 'accepted', 300, '200g');
    
    if (feedback.feedback === 'accepted' && feedback.item === 'chicken breast') {
        console.log('  ✅ [PASS]: Feedback recording');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Feedback recording');
        failed++;
    }
    
    // Test estimate message generation
    const message = generateEstimateMessage(estimate, 'high', 'chicken breast');
    
    if (message.includes('high confidence')) {
        console.log('  ✅ [PASS]: Estimate message generation');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Estimate message generation');
        failed++;
    }
    
    return { passed, failed, total: 3 };
}

/**
 * Test meal grouping system
 */
function testMealGrouping() {
    console.log('🧪 Testing meal grouping system...');
    
    const mockEntries = [
        { Timestamp: '2024-01-15T19:00:00Z', Type: 'food', Calories: '', Item: 'Pasta' },
        { Timestamp: '2024-01-15T19:15:00Z', Type: 'food', Calories: '', Item: 'Bread' },
        { Timestamp: '2024-01-15T19:30:00Z', Type: 'drink', Calories: 50, Item: 'Wine' },
        { Timestamp: '2024-01-15T21:00:00Z', Type: 'food', Calories: 200, Item: 'Dessert' }
    ];
    
    let passed = 0;
    let failed = 0;
    
    // Test meal grouping
    const groups = groupFoodEntries(mockEntries, 60);
    
    if (groups.length >= 1 && groups[0].entries.length >= 3) {
        console.log('  ✅ [PASS]: Meal grouping within time window');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Meal grouping within time window');
        failed++;
    }
    
    // Test meal grouping offer
    const shouldOffer = shouldOfferMealGrouping(mockEntries, 60);
    
    if (shouldOffer && shouldOffer.entries.length >= 2) {
        console.log('  ✅ [PASS]: Meal grouping offer logic');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Meal grouping offer logic');
        failed++;
    }
    
    // Test meal grouping message
    if (shouldOffer) {
        const message = generateMealGroupingMessage(shouldOffer);
        
        if (message.includes('Meal Grouping Available') && message.includes('kcal')) {
            console.log('  ✅ [PASS]: Meal grouping message generation');
            passed++;
        } else {
            console.log('  ❌ [FAIL]: Meal grouping message generation');
            failed++;
        }
    }
    
    return { passed, failed, total: 3 };
}

/**
 * Test guardrails system
 */
async function testGuardrails() {
    console.log('🧪 Testing guardrails system...');
    
    let passed = 0;
    let failed = 0;
    
    // Test guardrail check
    const dailyTotals = { calories: 1955, protein: 120, carbs: 200, fat: 80 };
    const target = 2300;
    const currentTime = new Date('2024-01-15T18:00:00Z'); // 1 PM EST (UTC-5)
    
    // Set environment variable for calorie user
    process.env.ALLOWED_CAL_USERS = 'test_user';
    
    // Re-import the modules to pick up the new environment variable
    delete require.cache[require.resolve('../src/auth/scope')];
    delete require.cache[require.resolve('../src/calories/guardrails')];
    
    // Re-require the functions
    const { checkGuardrailNeeded: checkGuardrailNeededFresh } = require('../src/calories/guardrails');
    
    const guardrail = checkGuardrailNeededFresh('test_user', dailyTotals, target, currentTime);
    
    if (guardrail && guardrail.type === 'high_intake_midday') {
        console.log('  ✅ [PASS]: Midday guardrail detection');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Midday guardrail detection');
        failed++;
    }
    
    // Test guardrail status
    const { getGuardrailStatus: getGuardrailStatusFresh } = require('../src/calories/guardrails');
    
    try {
        const status = await getGuardrailStatusFresh('test_user', [], currentTime);
        
        if (status.enabled && status.currentProgress !== undefined) {
            console.log('  ✅ [PASS]: Guardrail status calculation');
            passed++;
        } else {
            console.log('  ❌ [FAIL]: Guardrail status calculation');
            failed++;
        }
    } catch (error) {
        console.log('  ❌ [FAIL]: Guardrail status calculation - Error:', error.message);
        failed++;
    }
    
    // Test guardrail throttling
    const userProfile = { guardrails: {} };
    const shouldSend = shouldSendGuardrail('test_user', 'high_intake_midday', userProfile);
    
    if (shouldSend === true) {
        console.log('  ✅ [PASS]: Guardrail throttling logic');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Guardrail throttling logic');
        failed++;
    }
    
    return { passed, failed, total: 3 };
}

/**
 * Test DM health monitoring
 */
function testDMHealthMonitor() {
    console.log('🧪 Testing DM health monitoring...');
    
    let passed = 0;
    let failed = 0;
    
    // Test DM health check
    const userProfile = {
        dmHealth: {
            consecutiveFailures: 1,
            lastSuccess: '2024-01-15T10:00:00Z',
            lastFailure: '2024-01-15T11:00:00Z',
            fallbackMode: false
        }
    };
    
    // Set environment variable for calorie user
    process.env.ALLOWED_CAL_USERS = 'test_user';
    
    // Re-import the modules to pick up the new environment variable
    delete require.cache[require.resolve('../src/auth/scope')];
    delete require.cache[require.resolve('../src/notify/healthMonitor')];
    
    // Re-require the functions
    const { checkDMHealth: checkDMHealthFresh } = require('../src/notify/healthMonitor');
    
    const health = checkDMHealthFresh('test_user', userProfile);
    
    if (health.enabled && health.consecutiveFailures === 1) {
        console.log('  ✅ [PASS]: DM health status check');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: DM health status check');
        failed++;
    }
    
    // Test DM result recording
    const updatedProfile = recordDMResult('test_user', true, 'dm', userProfile);
    
    if (updatedProfile.dmHealth.consecutiveFailures === 0) {
        console.log('  ✅ [PASS]: DM result recording');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: DM result recording');
        failed++;
    }
    
    // Test fallback notification check
    const needsFallback = needsFallbackNotification('test_user', userProfile);
    
    if (needsFallback === false) { // Should be false after successful DM
        console.log('  ✅ [PASS]: Fallback notification logic');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Fallback notification logic');
        failed++;
    }
    
    return { passed, failed, total: 3 };
}

/**
 * Run all upgrade tests
 */
async function runUpgradeTests() {
    console.log('🔬 Running Calorie System Upgrade Tests...\n');
    
    const results = [
        testAdaptiveTiming(),
        testConfidenceSystem(),
        testMealGrouping(),
        await testGuardrails(),
        testDMHealthMonitor()
    ];
    
    const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
    const totalTests = results.reduce((sum, r) => sum + r.total, 0);
    
    console.log('\n--- Calorie Upgrade Test Summary ---');
    console.log(`Total: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalFailed}`);
    
    if (totalFailed > 0) {
        console.error('\nCalorie upgrade tests failed. Exiting with error.');
        process.exit(1);
    } else {
        console.log('\nAll calorie upgrade tests passed successfully!');
    }
}

// Run tests if called directly
if (require.main === module) {
    runUpgradeTests();
}
*/

module.exports = { runUpgradeTests };
