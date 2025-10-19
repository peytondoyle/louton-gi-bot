const express = require('express');
const googleSheets = require('./services/googleSheets');

const server = express();

// Middleware to parse JSON bodies
server.use(express.json());

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

// Health data ingestion endpoint (Peyton only)
server.post('/ingest/health', async (req, res) => {
    try {
        console.log('📥 Received health data ingestion request');

        const {
            date,
            active_kcal,
            basal_kcal,
            total_kcal,
            steps,
            exercise_min,
            weight,
            source
        } = req.body;

        // Validate required fields
        if (!date || !total_kcal) {
            return res.status(400).json({
                error: 'Missing required fields: date and total_kcal are required'
            });
        }

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
            console.log(`✅ Health data logged to Health_Peyton: ${date}`);
            return res.json({
                success: true,
                message: 'Health data logged successfully',
                rowNumber: result.rowNumber
            });
        } else {
            console.error('❌ Failed to log health data:', result.error);
            return res.status(500).json({
                success: false,
                error: result.error.message
            });
        }
    } catch (error) {
        console.error('❌ Error in health ingestion:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

function keepAlive() {
    server.listen(3000, () => {
        console.log('✅ Keep-alive server is ready on port 3000');
        console.log('🔗 Server URL: http://localhost:3000');
        console.log('📥 Health ingestion endpoint: POST /ingest/health');
    });
}

module.exports = keepAlive;