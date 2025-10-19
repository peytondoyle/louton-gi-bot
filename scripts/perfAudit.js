/**
 * Performance Audit Script
 * CLI tool to measure Sheets read latency and cache effectiveness
 */

require('dotenv').config();

const googleSheets = require('../services/googleSheets');
const { getStats, getCached } = require('../services/sheetsCache');

/**
 * Run performance audit
 */
async function runAudit() {
    console.log('🔬 Running Performance Audit...\n');

    // Test 1: Sheets read latency (uncached)
    console.log('📊 Test 1: Sheets Read Latency (uncached)');
    const start1 = Date.now();
    try {
        const sample = await googleSheets.getRows({}, 'Peyton');
        const readLatency = Date.now() - start1;
        console.log(`   ✅ Read ${sample.rows?.length || 0} rows in ${readLatency}ms`);
        console.log(`   ${readLatency < 1000 ? '✅' : '⚠️'} Target: <1000ms\n`);
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}\n`);
    }

    // Test 2: Cache hit latency
    console.log('📊 Test 2: Cache Hit Latency');
    const cacheKey = 'perf-test';
    const mockData = { rows: Array(100).fill({ test: 'data' }) };

    const start2a = Date.now();
    await getCached(cacheKey, async () => mockData, 60);
    const firstFetch = Date.now() - start2a;
    console.log(`   First fetch (cache miss): ${firstFetch}ms`);

    const start2b = Date.now();
    await getCached(cacheKey, async () => mockData, 60);
    const cachedFetch = Date.now() - start2b;
    console.log(`   Second fetch (cache hit): ${cachedFetch}ms`);
    console.log(`   ${cachedFetch < 10 ? '✅' : '⚠️'} Target: <10ms (speedup: ${(firstFetch / cachedFetch).toFixed(1)}x)\n`);

    // Test 3: Cache statistics
    console.log('📊 Test 3: Cache Statistics');
    const cacheStats = getStats();
    console.log(`   Keys: ${cacheStats.keys}`);
    console.log(`   Hits: ${cacheStats.hits}`);
    console.log(`   Misses: ${cacheStats.misses}`);
    console.log(`   Hit rate: ${cacheStats.hits + cacheStats.misses > 0 ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1) : 0}%`);
    console.log(`   Size: ~${Math.round(cacheStats.vsize / 1024)}KB`);
    console.log(`   ${cacheStats.vsize < 30 * 1024 * 1024 ? '✅' : '⚠️'} Target: <30MB\n`);

    // Test 4: SQLite cache (if available)
    console.log('📊 Test 4: SQLite Persistent Cache');
    try {
        const sqlite = require('../services/sqliteBridge');
        const sqliteStats = sqlite.getStats();
        console.log(`   Keys: ${sqliteStats.totalKeys}`);
        console.log(`   Size: ${sqliteStats.size}KB`);
        console.log(`   ✅ SQLite bridge operational\n`);
    } catch (error) {
        console.log(`   ⚠️ SQLite not available: ${error.message}\n`);
    }

    // Summary
    console.log('────────────────────────────');
    console.log('🎯 Summary:');
    console.log(`   Sheets latency: ${readLatency < 1000 ? '✅ Good' : '⚠️ Slow'}`);
    console.log(`   Cache speedup: ✅ ${(firstFetch / cachedFetch).toFixed(1)}x`);
    console.log(`   Memory usage: ${cacheStats.vsize < 30 * 1024 * 1024 ? '✅ Under limit' : '⚠️ High'}`);
    console.log('────────────────────────────\n');

    process.exit(0);
}

// Run if called directly
if (require.main === module) {
    runAudit().catch(error => {
        console.error('❌ Audit failed:', error);
        process.exit(1);
    });
}

module.exports = runAudit;
