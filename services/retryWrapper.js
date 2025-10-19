/**
 * Retry Wrapper with Exponential Backoff
 * Handles transient failures (429, 503, network errors)
 */

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - { retries: 3, delay: 1000 }
 * @returns {Promise<*>} - Result from fn
 * @throws {Error} - Last error if all retries fail
 */
async function retry(fn, { retries = 3, delay = 1000 } = {}) {
    let lastError;

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const result = await fn();
            if (attempt > 0) {
                console.log(`[RETRY] ✅ Succeeded on attempt ${attempt + 1}/${retries}`);
            }
            return result;
        } catch (error) {
            lastError = error;

            const isLastAttempt = attempt === retries - 1;
            const shouldRetry = isRetryableError(error);

            if (!shouldRetry || isLastAttempt) {
                console.error(`[RETRY] ❌ Failed on attempt ${attempt + 1}/${retries}: ${error.message}`);
                throw error;
            }

            // Exponential backoff: delay × (attempt + 1)
            const backoffMs = delay * (attempt + 1);
            console.warn(`[RETRY] ⚠️ Attempt ${attempt + 1}/${retries} failed: ${error.message} → retrying in ${backoffMs}ms`);

            await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
    }

    throw lastError;
}

/**
 * Check if error is retryable (transient failure)
 * @param {Error} error - Error object
 * @returns {boolean} - True if should retry
 */
function isRetryableError(error) {
    const message = error.message || '';
    const code = error.code || '';

    // Retryable HTTP codes
    const retryableCodes = [429, 500, 502, 503, 504];
    if (retryableCodes.some(c => message.includes(String(c)))) {
        return true;
    }

    // Network errors
    const networkErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
    if (networkErrors.includes(code)) {
        return true;
    }

    // Google Sheets specific errors
    if (message.includes('Rate Limit') || message.includes('quota')) {
        return true;
    }

    // Default: don't retry
    return false;
}

/**
 * Retry with custom error handler
 * @param {Function} fn - Async function to retry
 * @param {Object} options - { retries, delay, onRetry }
 * @returns {Promise<*>}
 */
async function retryWithCallback(fn, { retries = 3, delay = 1000, onRetry = null } = {}) {
    let lastError;

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            const isLastAttempt = attempt === retries - 1;
            if (isLastAttempt || !isRetryableError(error)) {
                throw error;
            }

            const backoffMs = delay * (attempt + 1);

            if (onRetry) {
                await onRetry(error, attempt, backoffMs);
            }

            await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
    }

    throw lastError;
}

module.exports = retry;
module.exports.retry = retry;
module.exports.retryWithCallback = retryWithCallback;
module.exports.isRetryableError = isRetryableError;
