/**
 * Heartbeat Monitor
 * Periodic uptime logging for monitoring bot health
 */

// Heartbeat interval: 1 hour
const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

// Track bot start time
const startTime = Date.now();

/**
 * Start heartbeat monitoring
 */
function startHeartbeat() {
    setInterval(() => {
        const uptime = Date.now() - startTime;
        const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(2);
        const memoryUsage = process.memoryUsage();
        const memoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);

        console.log(
            `[HEARTBEAT] ❤️ Bot alive | ` +
            `Uptime: ${uptimeHours}h | ` +
            `Memory: ${memoryMB}MB | ` +
            `Time: ${new Date().toISOString()}`
        );

        // Warn if memory usage is high
        if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // >500MB
            console.warn(`[HEARTBEAT] ⚠️ High memory usage: ${memoryMB}MB`);
        }
    }, HEARTBEAT_INTERVAL_MS);

    // Heartbeat started silently
}

/**
 * Get uptime in hours
 * @returns {number} - Uptime in hours
 */
function getUptimeHours() {
    return (Date.now() - startTime) / (1000 * 60 * 60);
}

/**
 * Get memory usage stats
 * @returns {Object} - Memory usage in MB
 */
function getMemoryStats() {
    const usage = process.memoryUsage();
    return {
        heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2),
        rss: (usage.rss / 1024 / 1024).toFixed(2),
        external: (usage.external / 1024 / 1024).toFixed(2)
    };
}

module.exports = {
    startHeartbeat,
    getUptimeHours,
    getMemoryStats
};
