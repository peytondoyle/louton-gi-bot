/**
 * Chart Rendering Service
 * Server-side PNG generation using QuickChart API (zero native dependencies)
 * Retina-ready with premium styling
 */

const axios = require('axios');

// Chart dimensions (2x for retina)
const WIDTH = 1200;
const HEIGHT = 700;

// Premium color palette (accessible, contrast-tested)
const PALETTE = {
    ink: '#0f172a',           // Primary text
    subInk: '#334155',        // Secondary text
    intakeFill: 'rgba(37, 99, 235, 0.14)',  // Blue fill (14% alpha)
    intakeStroke: '#1d4ed8',  // Blue stroke
    burnLine: '#ef4444',      // Red line
    severityLine: '#7c3aed',  // Purple line
    countBars: 'rgba(14, 165, 233, 0.3)',   // Cyan bars (faint)
    liftBars: '#10b981',      // Green bars
    goalLine: '#f59e0b',      // Amber goal line
    grid: 'rgba(0, 0, 0, 0.06)',  // Subtle grid
    background: '#ffffff'     // White background
};

// Typography
const FONTS = {
    title: { size: 24, weight: 'bold', family: 'sans-serif' },
    axis: { size: 14, weight: 'normal', family: 'sans-serif' },
    tick: { size: 14, weight: 'normal', family: 'sans-serif' },
    value: { size: 13, weight: 'normal', family: 'sans-serif' }
};

// QuickChart API endpoint (free tier, no auth needed)
const QUICKCHART_URL = 'https://quickchart.io/chart';

console.log('[CHARTS] ✅ ChartService initialized (QuickChart API, 1200x700)');

/**
 * Common chart options (theme)
 */
const COMMON_OPTIONS = {
    responsive: true,
    maintainAspectRatio: true,
    devicePixelRatio: 2, // Retina
    layout: {
        padding: {
            top: 24,
            right: 28,
            bottom: 28,
            left: 24
        }
    },
    plugins: {
        legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: {
                font: FONTS.axis,
                color: PALETTE.ink,
                padding: 12,
                boxWidth: 12,
                boxHeight: 12,
                usePointStyle: true
            }
        },
        title: {
            display: true,
            align: 'start',
            font: FONTS.title,
            color: PALETTE.ink,
            padding: { top: 0, bottom: 20 }
        },
        tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFont: { size: 14 },
            bodyFont: { size: 13 },
            padding: 10,
            cornerRadius: 6
        }
    },
    scales: {}
};

/**
 * Apply common options with overrides
 * @param {Object} baseOptions - Base options to merge
 * @param {Object} overrides - Specific overrides
 * @returns {Object} - Merged options
 */
function applyCommonOptions(baseOptions = {}, overrides = {}) {
    return {
        ...COMMON_OPTIONS,
        ...baseOptions,
        plugins: {
            ...COMMON_OPTIONS.plugins,
            ...(baseOptions.plugins || {}),
            ...(overrides.plugins || {})
        },
        layout: {
            ...COMMON_OPTIONS.layout,
            ...(baseOptions.layout || {}),
            ...(overrides.layout || {})
        },
        scales: {
            ...COMMON_OPTIONS.scales,
            ...(baseOptions.scales || {}),
            ...(overrides.scales || {})
        }
    };
}

/**
 * Render chart to PNG buffer using QuickChart API
 * @param {Object} config - { type, data, options }
 * @returns {Promise<Buffer>} - PNG buffer
 */
async function renderToBuffer(config) {
    const startTime = Date.now();

    try {
        // Apply common theme
        const enhancedConfig = {
            type: config.type,
            data: config.data,
            options: applyCommonOptions(config.options || {})
        };

        // Build QuickChart request
        const quickChartConfig = {
            width: WIDTH,
            height: HEIGHT,
            devicePixelRatio: 2, // Retina
            backgroundColor: PALETTE.background,
            format: 'png',
            chart: enhancedConfig
        };

        // Call QuickChart API
        const response = await axios.post(QUICKCHART_URL, quickChartConfig, {
            responseType: 'arraybuffer',
            timeout: 10000, // 10s timeout
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const buffer = Buffer.from(response.data);

        const renderTime = Date.now() - startTime;
        console.log(`[CHARTS] ✅ Rendered ${config.type} in ${renderTime}ms (${(buffer.length / 1024).toFixed(0)}KB)`);

        return buffer;
    } catch (error) {
        console.error('[CHARTS] ❌ Render failed:', error);
        throw error;
    }
}

/**
 * Get chart dimensions
 */
function getDimensions() {
    return { width: WIDTH, height: HEIGHT, dpr: 2 };
}

module.exports = {
    renderToBuffer,
    applyCommonOptions,
    getDimensions,
    PALETTE,
    FONTS,
    theme: {
        palette: PALETTE,
        fonts: FONTS,
        commonOptions: COMMON_OPTIONS
    }
};
