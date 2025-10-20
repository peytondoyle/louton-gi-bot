/**
 * Calorie System Acceptance Tests
 * Tests the new MacroFactor-style calorie tracking features
 */

const { parseComplexIntent } = require('../src/nlu/rulesIntent');
const { estimate, calculateDailyTotals, formatDailyProgress } = require('../src/calories/estimate');
const { shouldEnableCalorieFeatures } = require('../src/auth/scope');

/**
 * Test natural language reminder parsing
 */
function testReminderParsing() {
    console.log('🧪 Testing reminder parsing...');
    
    const testCases = [
        {
            input: "ask me 30 min after every meal to log calories",
            expected: { kind: "after_meal_ping", delayMin: 30, scope: "every_meal" }
        },
        {
            input: "remind me 15 minutes after breakfast to add calories",
            expected: { kind: "after_meal_ping", delayMin: 15, scope: "breakfast" }
        },
        {
            input: "ping me 45 min after dinner to log calories",
            expected: { kind: "after_meal_ping", delayMin: 45, scope: "dinner" }
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const testCase of testCases) {
        const result = parseComplexIntent(testCase.input);
        
        if (result && 
            result.kind === testCase.expected.kind &&
            result.delayMin === testCase.expected.delayMin &&
            result.scope === testCase.expected.scope) {
            console.log(`  ✅ [PASS]: "${testCase.input}"`);
            passed++;
        } else {
            console.log(`  ❌ [FAIL]: "${testCase.input}"`);
            console.log(`      Expected: ${JSON.stringify(testCase.expected)}`);
            console.log(`      Got: ${JSON.stringify(result)}`);
            failed++;
        }
    }
    
    return { passed, failed, total: testCases.length };
}

/**
 * Test calorie estimation
 */
function testCalorieEstimation() {
    console.log('🧪 Testing calorie estimation...');
    
    const testCases = [
        {
            input: { item: "chicken breast", quantity: "200g" },
            expected: { calories: 330, protein: 62, carbs: 0, fat: 7.2 }
        },
        {
            input: { item: "oatmeal", quantity: "1 cup" },
            expected: { calories: 154, protein: 6, carbs: 27, fat: 3 }
        },
        {
            input: { item: "banana" },
            expected: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 }
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const testCase of testCases) {
        const result = estimate(testCase.input);
        
        if (result && 
            Math.abs(result.calories - testCase.expected.calories) < 10 &&
            Math.abs(result.protein - testCase.expected.protein) < 2 &&
            Math.abs(result.carbs - testCase.expected.carbs) < 2 &&
            Math.abs(result.fat - testCase.expected.fat) < 2) {
            console.log(`  ✅ [PASS]: ${testCase.input.item}`);
            passed++;
        } else {
            console.log(`  ❌ [FAIL]: ${testCase.input.item}`);
            console.log(`      Expected: ${JSON.stringify(testCase.expected)}`);
            console.log(`      Got: ${JSON.stringify(result)}`);
            failed++;
        }
    }
    
    return { passed, failed, total: testCases.length };
}

/**
 * Test daily progress calculation
 */
function testDailyProgress() {
    console.log('🧪 Testing daily progress calculation...');
    
    const mockEntries = [
        { Calories: 300, Protein: 20, Carbs: 30, Fat: 10 },
        { Calories: 500, Protein: 25, Carbs: 50, Fat: 15 },
        { Calories: 200, Protein: 10, Carbs: 20, Fat: 5 }
    ];
    
    const totals = calculateDailyTotals(mockEntries);
    const expected = { calories: 1000, protein: 55, carbs: 100, fat: 30, entryCount: 3 };
    
    let passed = 0;
    let failed = 0;
    
    if (totals.calories === expected.calories &&
        totals.protein === expected.protein &&
        totals.carbs === expected.carbs &&
        totals.fat === expected.fat &&
        totals.entryCount === expected.entryCount) {
        console.log('  ✅ [PASS]: Daily totals calculation');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Daily totals calculation');
        console.log(`      Expected: ${JSON.stringify(expected)}`);
        console.log(`      Got: ${JSON.stringify(totals)}`);
        failed++;
    }
    
    // Test progress formatting
    const progress = formatDailyProgress(totals, 2000);
    const expectedProgress = 'Today: 1,000 / 2,000 kcal (-1,000 remaining)';
    
    if (progress === expectedProgress) {
        console.log('  ✅ [PASS]: Progress formatting');
        passed++;
    } else {
        console.log('  ❌ [FAIL]: Progress formatting');
        console.log(`      Expected: ${expectedProgress}`);
        console.log(`      Got: ${progress}`);
        failed++;
    }
    
    return { passed, failed, total: 2 };
}

/**
 * Test user authorization
 */
function testUserAuthorization() {
    console.log('🧪 Testing user authorization...');
    
    // Test with environment variable
    process.env.ALLOWED_CAL_USERS = '123456789,987654321';
    
    // Re-import the module to pick up the new environment variable
    delete require.cache[require.resolve('../src/auth/scope')];
    const { shouldEnableCalorieFeatures } = require('../src/auth/scope');
    
    const testCases = [
        { userId: '123456789', expected: true },
        { userId: '987654321', expected: true },
        { userId: '111111111', expected: false },
        { userId: '', expected: false }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const testCase of testCases) {
        const result = shouldEnableCalorieFeatures(testCase.userId);
        
        if (result === testCase.expected) {
            console.log(`  ✅ [PASS]: User ${testCase.userId} authorization`);
            passed++;
        } else {
            console.log(`  ❌ [FAIL]: User ${testCase.userId} authorization`);
            console.log(`      Expected: ${testCase.expected}`);
            console.log(`      Got: ${result}`);
            failed++;
        }
    }
    
    return { passed, failed, total: testCases.length };
}

/**
 * Run all calorie tests
 */
async function runCalorieTests() {
    console.log('🔬 Running Calorie System Tests...\n');
    
    const results = [
        testReminderParsing(),
        testCalorieEstimation(),
        testDailyProgress(),
        testUserAuthorization()
    ];
    
    const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
    const totalTests = results.reduce((sum, r) => sum + r.total, 0);
    
    console.log('\n--- Calorie Test Summary ---');
    console.log(`Total: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalFailed}`);
    
    if (totalFailed > 0) {
        console.error('\nCalorie tests failed. Exiting with error.');
        process.exit(1);
    } else {
        console.log('\nAll calorie tests passed successfully!');
    }
}

// Run tests if called directly
if (require.main === module) {
    runCalorieTests();
}

module.exports = { runCalorieTests };
