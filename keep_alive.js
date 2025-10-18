const express = require('express');

const server = express();

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

function keepAlive() {
    server.listen(3000, () => {
        console.log('✅ Keep-alive server is ready on port 3000');
        console.log('🔗 Server URL: http://localhost:3000');
    });
}

module.exports = keepAlive;