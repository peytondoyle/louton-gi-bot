const { understand } = require('../src/nlu/understand-v2');
const testCases = require('./nlu-test-cases.json');
const assert = require('assert');

// A simple deep comparison function
function deepEqual(obj1, obj2) {
    try {
        assert.deepStrictEqual(obj1, obj2);
        return true;
    } catch (error) {
        return false;
    }
}

async function runTests() {
    console.log('🔬 Running NLU Acceptance Tests...');
    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        const { description, input, expected } = testCase;

        // We run the NLU with a consistent timezone for testing purposes
        const result = await understand(input, { tz: 'America/New_York' });

        // Check the intent
        const intentMatches = result.intent === expected.intent;

        // Check if all expected slots are present and have the correct value
        let slotsMatch = true;
        if (expected.slots) {
            for (const key in expected.slots) {
                if (!deepEqual(result.slots[key], expected.slots[key])) {
                    slotsMatch = false;
                    break;
                }
            }
        }
        
        if (intentMatches && slotsMatch) {
            console.log(`  ✅ [PASS]: ${description}`);
            passed++;
        } else {
            console.log(`  ❌ [FAIL]: ${description}`);
            console.log(`      Input: "${input}"`);
            console.log(`      Expected: ${JSON.stringify(expected)}`);
            console.log(`      Got:      ${JSON.stringify({ intent: result.intent, slots: result.slots })}`);
            failed++;
        }
    }

    console.log('\n--- Test Summary ---');
    console.log(`Total: ${testCases.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        console.error('\nNLU tests failed. Exiting with error.');
        process.exit(1); // Exit with a non-zero code to fail CI/CD pipelines
    } else {
        console.log('\nAll NLU tests passed successfully!');
    }
}

runTests();
