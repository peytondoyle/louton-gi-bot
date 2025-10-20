// src/insights/AIAnalyst.js
const { OpenAI } = require('openai');

// Initialize OpenAI client (lazy)
let client = null;
function getClient() {
    if (!client && process.env.OPENAI_API_KEY) {
        client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 5000 // 5 second timeout for query generation
        });
    }
    return client;
}

const SYSTEM_PROMPT_QUERY_GENERATOR = `You are an expert data analyst that converts natural language questions into a structured JSON query.
The user is querying their personal GI health data, which is stored in a table with the following columns:
- Timestamp (ISO 8601 string)
- User (string)
- Type (string, one of: 'food', 'drink', 'symptom', 'reflux', 'bm')
- Details (string, e.g., "chicken salad", "stomach pain")
- Severity (string, one of: 'mild', 'moderate', 'severe')
- Notes (string, e.g., "linked_to=chicken salad")
- Date (string, format: 'YYYY-MM-DD')
- Calories (number)

Your task is to return ONLY a JSON object with the following schema:
{
  "filters": [
    {"column": "ColumnName", "operator": "eq|neq|gt|lt|gte|lte|contains|not_contains", "value": "value"}
  ],
  "aggregation": {
    "type": "count|sum|avg",
    "column": "ColumnName"
  },
  "select": ["ColumnName1", "ColumnName2"],
  "limit": 10
}

Rules:
- Today is ${new Date().toISOString().split('T')[0]}.
- 'this week' means since the last Monday.
- If the user asks for "top" or "most common", use a 'count' aggregation and order the results.
- If the user asks a "how many" question, use a 'count' aggregation.
- If the user asks for a total, use a 'sum' aggregation.
- Be smart about date ranges. "last 3 days" should translate to a "gte" filter on the 'Date' column.
- For vague terms like "bad stomach," filter for Type 'symptom' and Details containing 'pain' or 'ache'.
- If the query is too complex or not answerable from the schema, return {"error": "Query is too complex or irrelevant."}.
- Do NOT include the "User" column in filters; it will be applied automatically.
- Do NOT use prose or markdown. Return only the JSON object.`;


/**
 * Converts a natural language question into a structured JSON query using an LLM.
 * @param {string} question The user's natural language question.
 * @returns {Promise<Object>} The structured JSON query or an error object.
 */
async function generateQuery(question) {
    const openai = getClient();
    if (!openai) {
        return { error: "AI Analyst is not configured. Missing OpenAI API key." };
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT_QUERY_GENERATOR },
                { role: 'user', content: question }
            ],
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            return { error: "AI Analyst returned an empty response." };
        }

        return JSON.parse(content);

    } catch (error) {
        console.error("[AIAnalyst] Error generating query:", error);
        return { error: "I had trouble understanding that question. Could you try rephrasing it?" };
    }
}

const SYSTEM_PROMPT_ANSWER_SYNTHESIZER = `You are a friendly and helpful GI health assistant.
The user asked a question, and you have retrieved the following data from their logs.
Your task is to answer the user's question in a clear, conversational, and encouraging tone based ONLY on the provided data.

Rules:
- Today is ${new Date().toISOString().split('T')[0]}.
- Be concise and direct.
- If the data is an aggregation (a single number), present it clearly.
- If the data is a list of items, format it as a clean, easy-to-read list.
- If the data is empty, say that you couldn't find any matching entries.
- Do not make up information or offer medical advice. Stick strictly to the data provided.
- Frame the answer in a positive and supportive way.`;

/**
 * Synthesizes a natural language answer from a query result using an LLM.
 * @param {string} originalQuestion The user's original question.
 * @param {Object} queryResult The data returned from the executeQuery function.
 * @returns {Promise<string>} The synthesized natural language answer.
 */
async function synthesizeAnswer(originalQuestion, queryResult) {
    const openai = getClient();
    if (!openai) {
        return "I can't seem to access my analysis brain right now. Please try again later.";
    }

    const dataString = JSON.stringify(queryResult.data, null, 2);
    const userMessage = `The user asked: "${originalQuestion}"

Here is the data I found:
\`\`\`json
${dataString}
\`\`\`

Please answer the user's question based on this data.`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2, // A little creative for friendlier tone
            messages: [
                { role: 'system', content: SYSTEM_PROMPT_ANSWER_SYNTHESIZER },
                { role: 'user', content: userMessage }
            ]
        });

        const answer = response.choices[0]?.message?.content;
        return answer || "I found the data, but I'm having trouble putting it into words. Please try asking in a different way.";

    } catch (error) {
        console.error("[AIAnalyst] Error synthesizing answer:", error);
        return "I ran into an issue while analyzing your data. Sorry about that!";
    }
}


module.exports = {
    generateQuery,
    synthesizeAnswer
};
