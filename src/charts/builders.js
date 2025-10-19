/**
 * Chart Configuration Builders
 * Returns Chart.js configs for each chart type
 */

const { PALETTE, FONTS } = require('./ChartService');

/**
 * Build budget bar chart (Intake vs Burn vs Goal)
 * @param {Object} data - { labels, intake, burn, target }
 * @returns {Object} - Chart.js config
 */
function buildBudgetBar({ labels, intake, burn, target = null }) {
    const datasets = [
        {
            label: 'Intake',
            data: intake,
            backgroundColor: PALETTE.intakeFill,
            borderColor: PALETTE.intakeStroke,
            borderWidth: 2,
            borderRadius: 6
        }
    ];

    if (burn && burn.some(b => b !== null)) {
        datasets.push({
            label: 'Burn',
            data: burn,
            backgroundColor: 'transparent',
            borderColor: PALETTE.burnLine,
            borderWidth: 3,
            type: 'line',
            pointRadius: 4,
            pointBackgroundColor: PALETTE.burnLine
        });
    }

    const config = {
        type: 'bar',
        data: {
            labels,
            datasets
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: labels.length === 1 ? 'Daily Budget' : `Budget (${labels.length} days)`
                },
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Calories (kcal)',
                        font: FONTS.axis,
                        color: PALETTE.subInk
                    },
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk,
                        precision: 0
                    },
                    grid: {
                        color: PALETTE.grid
                    }
                },
                x: {
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    };

    // Add target line if provided
    if (target) {
        config.options.plugins.annotation = {
            annotations: {
                goalLine: {
                    type: 'line',
                    yMin: target,
                    yMax: target,
                    borderColor: PALETTE.goalLine,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                        display: true,
                        content: `Goal: ${target}`,
                        position: 'end',
                        backgroundColor: PALETTE.goalLine,
                        color: '#fff',
                        font: { size: 12 }
                    }
                }
            }
        };
    }

    return config;
}

/**
 * Build intake vs burn area chart
 * @param {Object} data - { labels, intake, burn }
 * @returns {Object} - Chart.js config
 */
function buildIntakeBurnArea({ labels, intake, burn }) {
    const datasets = [
        {
            label: 'Intake',
            data: intake,
            fill: true,
            backgroundColor: PALETTE.intakeFill,
            borderColor: PALETTE.intakeStroke,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: PALETTE.intakeStroke
        }
    ];

    if (burn && burn.some(b => b !== null)) {
        datasets.push({
            label: 'Burn',
            data: burn,
            fill: false,
            backgroundColor: 'transparent',
            borderColor: PALETTE.burnLine,
            borderWidth: 3,
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: PALETTE.burnLine
        });
    }

    return {
        type: 'line',
        data: {
            labels,
            datasets
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Intake vs Burn (${labels.length} days)`
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Calories (kcal)',
                        font: FONTS.axis,
                        color: PALETTE.subInk
                    },
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk,
                        precision: 0
                    },
                    grid: {
                        color: PALETTE.grid
                    }
                },
                x: {
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    };
}

/**
 * Build reflux trend chart (count + severity + MA7)
 * @param {Object} data - { labels, count, avgSeverity, ma7 }
 * @returns {Object} - Chart.js config
 */
function buildRefluxTrend({ labels, count, avgSeverity, ma7 }) {
    return {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Count',
                    data: count,
                    backgroundColor: PALETTE.countBars,
                    borderColor: 'rgba(14, 165, 233, 0.6)',
                    borderWidth: 1,
                    yAxisID: 'y',
                    order: 2
                },
                {
                    label: 'Avg Severity',
                    data: avgSeverity,
                    type: 'line',
                    borderColor: PALETTE.severityLine,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: PALETTE.severityLine,
                    yAxisID: 'y1',
                    order: 1
                },
                {
                    label: 'MA7 (count)',
                    data: ma7,
                    type: 'line',
                    borderColor: '#0ea5e9',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 0,
                    yAxisID: 'y',
                    order: 0
                }
            ]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Reflux Trend (${labels.length} days)`
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Count',
                        font: FONTS.axis,
                        color: PALETTE.subInk
                    },
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk,
                        precision: 0
                    },
                    grid: {
                        color: PALETTE.grid
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    max: 10,
                    title: {
                        display: true,
                        text: 'Severity (1-10)',
                        font: FONTS.axis,
                        color: PALETTE.subInk
                    },
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk,
                        precision: 0
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                },
                x: {
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    };
}

/**
 * Build latency distribution (histogram-style)
 * @param {Object} data - { samples }
 * @returns {Object} - Chart.js config
 */
function buildLatencyDistribution({ samples }) {
    // Bin samples into 15-minute buckets
    const bins = [];
    const binSize = 15; // minutes
    const maxBin = 360 / binSize; // 24 bins (0-360 min)

    for (let i = 0; i < maxBin; i++) {
        bins.push({ label: `${i * binSize}-${(i + 1) * binSize}`, count: 0 });
    }

    samples.forEach(lat => {
        const binIdx = Math.min(Math.floor(lat / binSize), maxBin - 1);
        if (binIdx >= 0 && binIdx < bins.length) {
            bins[binIdx].count++;
        }
    });

    return {
        type: 'bar',
        data: {
            labels: bins.map(b => b.label),
            datasets: [
                {
                    label: 'Frequency',
                    data: bins.map(b => b.count),
                    backgroundColor: PALETTE.countBars,
                    borderColor: 'rgba(14, 165, 233, 0.6)',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Meal → Symptom Latency (${samples.length} samples)`
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Frequency',
                        font: FONTS.axis,
                        color: PALETTE.subInk
                    },
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk,
                        precision: 0
                    },
                    grid: {
                        color: PALETTE.grid
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Latency (minutes)',
                        font: FONTS.axis,
                        color: PALETTE.subInk
                    },
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    };
}

/**
 * Build trigger lift bars
 * @param {Object} data - { labels, lift, counts }
 * @returns {Object} - Chart.js config
 */
function buildTriggerLiftBars({ labels, lift, counts }) {
    // Add sample counts to labels
    const labelsWithCounts = labels.map((label, idx) => [label, `(n=${counts[idx]})`]);

    return {
        type: 'bar',
        data: {
            labels: labelsWithCounts,
            datasets: [
                {
                    label: 'Lift (vs baseline)',
                    data: lift,
                    backgroundColor: PALETTE.liftBars,
                    borderColor: '#059669',
                    borderWidth: 2,
                    borderRadius: 6
                }
            ]
        },
        options: {
            indexAxis: 'y', // Horizontal bars
            plugins: {
                title: {
                    display: true,
                    text: 'Trigger Combinations (Lift > 1.3)'
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Lift Factor',
                        font: FONTS.axis,
                        color: PALETTE.subInk
                    },
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk
                    },
                    grid: {
                        color: PALETTE.grid
                    }
                },
                y: {
                    ticks: {
                        font: FONTS.tick,
                        color: PALETTE.subInk
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    };
}

module.exports = {
    buildBudgetBar,
    buildIntakeBurnArea,
    buildRefluxTrend,
    buildLatencyDistribution,
    buildTriggerLiftBars
};
