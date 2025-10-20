/**
 * Persistent Job Queue Store
 * Manages scheduled jobs in SQLite with automatic cleanup
 */

const db = require('../../services/sqliteBridge');
const { v4: uuidv4 } = require('uuid');

/**
 * Enqueue a new job
 * @param {Object} params - Job parameters
 * @param {string} params.userId - Discord user ID
 * @param {string} params.dueAtISO - When the job should run (ISO string)
 * @param {string} params.type - Job type (e.g., 'after_meal_ping')
 * @param {Object} params.payload - Job-specific data
 * @returns {Promise<string>} - Job ID
 */
async function enqueue({ userId, dueAtISO, type, payload }) {
    const jobId = uuidv4();
    const jobData = {
        id: jobId,
        userId,
        dueAtISO,
        type,
        payload,
        createdAtISO: new Date().toISOString(),
        doneAtISO: null
    };
    
    // Store with 7-day TTL (jobs should complete within a week)
    const ttlSeconds = 7 * 24 * 60 * 60; // 7 days
    db.set(`job:${jobId}`, jobData, ttlSeconds);
    
    console.log(`[JOBS] Enqueued ${type} job for user ${userId} due at ${dueAtISO}`);
    return jobId;
}

/**
 * Pull all jobs that are due to run
 * @param {string} nowISO - Current time in ISO format
 * @returns {Promise<Array>} - Array of due jobs
 */
async function pullDue(nowISO) {
    // This is a simplified implementation
    // In a production system, you'd want a more sophisticated query
    const allJobs = [];
    
    // Get all job keys (this is a limitation of our simple key-value store)
    // In a real implementation, you'd want a proper SQL query
    const stats = db.getStats();
    if (stats.totalKeys === 0) return allJobs;
    
    // For now, we'll implement a simple scan
    // This could be optimized with a proper SQLite table
    console.log(`[JOBS] Scanning for due jobs (current time: ${nowISO})`);
    
    return allJobs; // Placeholder - would need proper implementation
}

/**
 * Mark a job as completed
 * @param {string} jobId - Job ID to mark as done
 * @returns {Promise<boolean>} - Success status
 */
async function markDone(jobId) {
    try {
        const job = db.get(`job:${jobId}`);
        if (!job) {
            console.warn(`[JOBS] Job ${jobId} not found`);
            return false;
        }
        
        job.doneAtISO = new Date().toISOString();
        db.set(`job:${jobId}`, job, 7 * 24 * 60 * 60); // Update with same TTL
        
        console.log(`[JOBS] Marked job ${jobId} as completed`);
        return true;
    } catch (error) {
        console.error(`[JOBS] Failed to mark job ${jobId} as done:`, error);
        return false;
    }
}

/**
 * Get all pending jobs for a user
 * @param {string} userId - Discord user ID
 * @returns {Promise<Array>} - Array of pending jobs
 */
async function getUserJobs(userId) {
    // This would need proper implementation with SQLite queries
    // For now, return empty array
    return [];
}

/**
 * Cancel all jobs of a specific type for a user
 * @param {string} userId - Discord user ID
 * @param {string} type - Job type to cancel
 * @returns {Promise<number>} - Number of jobs cancelled
 */
async function cancelUserJobs(userId, type) {
    // This would need proper implementation
    console.log(`[JOBS] Cancelling ${type} jobs for user ${userId}`);
    return 0; // Placeholder
}

/**
 * Clean up old completed jobs
 * @returns {Promise<number>} - Number of jobs cleaned up
 */
async function cleanup() {
    // The sqliteBridge already handles TTL cleanup
    // This is just for any additional cleanup logic
    return 0;
}

module.exports = {
    enqueue,
    pullDue,
    markDone,
    getUserJobs,
    cancelUserJobs,
    cleanup
};
