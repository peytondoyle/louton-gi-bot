const express = require('express');
const crypto = require('crypto');
const googleSheets = require('./services/googleSheets');

const server = express();

// Middleware to parse raw body as text (required for HMAC verification)
server.use(express.text({ type: '*/*' }));

// Health check endpoint for UptimeRobot
server.all('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Louton GI Bot Status</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .container {
                    text-align: center;
                    padding: 2rem;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    backdrop-filter: blur(10px);
                }
                h1 {
                    margin: 0 0 1rem 0;
                    font-size: 2rem;
                }
                .status {
                    font-size: 1.2rem;
                    color: #4ade80;
                }
                .info {
                    margin-top: 1rem;
                    opacity: 0.9;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Louton GI Bot</h1>
                <p class="status">✅ Bot is alive and running!</p>
                <p class="info">Timestamp: ${new Date().toLocaleString()}</p>
                <p class="info">Tracking GI symptoms via Discord DMs</p>
            </div>
        </body>
        </html>
    `);
});

// Health check endpoint for monitoring
server.get('/health', (req, res) => {
    res.json({
        status: 'online',
        bot: 'Louton GI Bot',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ========== HEALTH DATA INGESTION ENDPOINT ==========
// Receives Apple Health data from iOS Shortcuts via webhook
// Verifies HMAC-SHA256 signature for security

/**
 * Verify HMAC-SHA256 signature
 * @param {string} rawBody - Raw request body
 * @param {string} signature - X-Signature header value
 * @param {string} secret - Signing secret from env
 * @returns {boolean} - True if signature matches
 */
function verifyHmac(rawBody, signature, secret) {
    if (!signature || !secret) return false;

    const expectedMac = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

    return expectedMac === signature;
}

/**
 * POST /ingest/health
 * Receives health data (calories, steps, etc.) from iOS Shortcuts
 *
 * Expected payload:
 * {
 *   "date": "2025-10-19",
 *   "total_kcal": 2150,
 *   "active_kcal": 450,
 *   "basal_kcal": 1700,
 *   "steps": 8234
 * }
 *
 * Headers required:
 * - X-Signature: HMAC-SHA256 hex signature of raw body
 */
server.post('/ingest/health', async (req, res) => {
    console.log('📥 [HEALTH] Received ingest request');

    // Get signature and secret
    const signature = req.get('X-Signature');
    const secret = process.env.HEALTH_SIGNING_SECRET;
    const rawBody = req.body;

    // Verify signature
    if (!verifyHmac(rawBody, signature, secret)) {
        console.log('❌ [HEALTH] Invalid signature - request rejected');
        return res.status(401).json({
            ok: false,
            error: 'Invalid signature'
        });
    }

    // Parse payload
    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch (error) {
        console.log('❌ [HEALTH] Invalid JSON payload');
        return res.status(400).json({
            ok: false,
            error: 'Invalid JSON'
        });
    }

    // Extract fields
    const { date, total_kcal, active_kcal, basal_kcal, steps, exercise_min, weight, source } = payload;

    // Validate required fields
    if (!date || total_kcal === undefined) {
        console.log('❌ [HEALTH] Missing required fields (date, total_kcal)');
        return res.status(400).json({
            ok: false,
            error: 'Missing required fields'
        });
    }

    // Log received data
    console.log(`✅ [HEALTH] Received data for ${date}:`);
    console.log(`   Total: ${total_kcal} kcal`);
    console.log(`   Active: ${active_kcal || 'N/A'} kcal`);
    console.log(`   Basal: ${basal_kcal || 'N/A'} kcal`);
    console.log(`   Steps: ${steps || 'N/A'}`);

    try {
        // Build row object
        const rowObj = {
            'Date': date,
            'Active_kcal': active_kcal || '',
            'Basal_kcal': basal_kcal || '',
            'Total_kcal': total_kcal || '',
            'Steps': steps || '',
            'Exercise_min': exercise_min || '',
            'Weight': weight || '',
            'Source': source || 'api'
        };

        // Ensure sheet exists
        if (!googleSheets.initialized) {
            await googleSheets.initialize();
        }

        // Write to Health_Peyton tab only
        const result = await googleSheets.appendRowToSheet('Health_Peyton', rowObj);

        if (result.success) {
            console.log(`✅ [HEALTH] Data logged to Health_Peyton: ${date}`);

            // Success response
            return res.json({
                ok: true,
                date: date,
                received: {
                    total_kcal,
                    active_kcal: active_kcal || null,
                    basal_kcal: basal_kcal || null,
                    steps: steps || null
                }
            });
        } else {
            console.error('❌ [HEALTH] Failed to log data:', result.error);
            return res.status(500).json({
                ok: false,
                error: 'Failed to write to Sheets'
            });
        }
    } catch (error) {
        console.error('❌ [HEALTH] Error processing data:', error);
        return res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

// ========== END HEALTH INGESTION ==========

function keepAlive() {
    server.listen(3000, () => {
        console.log('✅ Keep-alive server is ready on port 3000');
        console.log('🔗 Server URL: http://localhost:3000');
        console.log('📥 Health ingestion endpoint: POST /ingest/health');
    });
}

module.exports = keepAlive;