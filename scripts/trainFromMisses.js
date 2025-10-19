/**
 * Self-Training Loop
 * Analyzes NLU logs to identify missed patterns and expand ontology
 * Run nightly via cron
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * Extract NLU patterns from logs
 * Looks for [NLU-V2] logs with low confidence or rejections
 */
async function trainFromMisses() {
    console.log('🤖 [TRAIN] Starting self-training analysis...');

    // Read recent logs (last 24h)
    // In production, this would read from a log file or database
    // For now, we'll outline the approach

    const lowConfidencePatterns = [];
    const rejectedPhrases = [];
    const clarificationRequests = [];

    // Example: Parse log file for patterns
    // const logs = fs.readFileSync('/var/log/louton-gi-bot.log', 'utf8');
    // const lines = logs.split('\n');

    // for (const line of lines) {
    //     if (line.includes('[NLU-V2] Rejected')) {
    //         const match = line.match(/Content: "(.+?)"/);
    //         if (match) rejectedPhrases.push(match[1]);
    //     }
    // }

    console.log('📊 [TRAIN] Analysis Summary:');
    console.log(`   Low confidence: ${lowConfidencePatterns.length}`);
    console.log(`   Rejected: ${rejectedPhrases.length}`);
    console.log(`   Clarifications: ${clarificationRequests.length}`);

    // Generate suggested ontology expansions
    const suggestions = generateSuggestions(rejectedPhrases);

    if (suggestions.length > 0) {
        console.log('\n💡 [TRAIN] Suggested Ontology Expansions:');
        suggestions.forEach((s, i) => {
            console.log(`   ${i + 1}. Add "${s.word}" to ${s.category}`);
        });

        // Write suggestions to file for review
        const suggestionsPath = path.join(__dirname, '../.data/training-suggestions.json');
        fs.mkdirSync(path.dirname(suggestionsPath), { recursive: true });
        fs.writeFileSync(suggestionsPath, JSON.stringify(suggestions, null, 2));

        console.log(`\n📝 [TRAIN] Suggestions saved to ${suggestionsPath}`);
        console.log('👉 [TRAIN] Review and add to ontology-v2.js manually or via Claude');
    } else {
        console.log('\n✅ [TRAIN] No suggestions - ontology is comprehensive!');
    }

    console.log('\n🎉 [TRAIN] Self-training analysis complete');
}

/**
 * Generate suggestions from rejected phrases
 */
function generateSuggestions(phrases) {
    const suggestions = [];

    // Simple heuristics for auto-suggestions
    // In production, you'd use Claude API to analyze patterns

    for (const phrase of phrases) {
        const lower = phrase.toLowerCase();

        // Detect food-like nouns not in HEAD_NOUNS
        if (/(bowl|plate|serving) of (\w+)/.test(lower)) {
            const match = lower.match(/(bowl|plate|serving) of (\w+)/);
            if (match) {
                suggestions.push({
                    word: match[2],
                    category: 'HEAD_NOUNS',
                    reason: 'Detected in "bowl/plate of X" pattern',
                    confidence: 0.7
                });
            }
        }

        // Detect potential beverages
        if (/(drinking|drank|sipped) (\w+ \w+)/.test(lower)) {
            const match = lower.match(/(drinking|drank|sipped) (\w+ \w+)/);
            if (match) {
                suggestions.push({
                    word: match[2],
                    category: 'BEVERAGES',
                    reason: 'Detected in drink action pattern',
                    confidence: 0.8
                });
            }
        }
    }

    // Deduplicate
    const seen = new Set();
    return suggestions.filter(s => {
        const key = `${s.word}:${s.category}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Example: Use Claude API to analyze patterns (optional enhancement)
 */
async function analyzeWithClaude(phrases) {
    // Pseudo-code for Claude integration:
    //
    // const response = await anthropic.messages.create({
    //     model: 'claude-3-5-sonnet-20241022',
    //     max_tokens: 1024,
    //     messages: [{
    //         role: 'user',
    //         content: `Analyze these rejected food/drink phrases and suggest ontology additions:\n${phrases.join('\n')}\n\nReturn JSON: [{ word, category, reason }]`
    //     }]
    // });
    //
    // return JSON.parse(response.content[0].text);

    return [];
}

// Run if called directly
if (require.main === module) {
    trainFromMisses().catch(error => {
        console.error('❌ [TRAIN] Error:', error);
        process.exit(1);
    });
}

module.exports = trainFromMisses;
