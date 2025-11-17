/**
 * Chart Rendering Fixes for TruckOpti Dashboard
 * Addresses infinite scrolling and poor UI issues
 */

// Global chart configuration defaults
Chart.defaults.responsive = true;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.plugins.legend.display = true;

// Safe chart creation wrapper to prevent rendering issues
function createSafeChart(ctx, config) {
    try {
        // Ensure container has proper dimensions
        const container = ctx.canvas.parentElement;
        if (container) {
            container.style.position = 'relative';
            container.style.height = container.style.height || '350px';
            container.style.width = '100%';
            container.style.overflow = 'hidden';
        }

        // Sanitize chart data to prevent infinite values
        if (config.data && config.data.datasets) {
            config.data.datasets.forEach(dataset => {
                if (dataset.data) {
                    dataset.data = dataset.data.map(value => {
                        if (value === null || value === undefined || !isFinite(value)) {
                            return 0;
                        }
                        // Clamp extreme values
                        return Math.max(-1000000, Math.min(1000000, value));
                    });
                }
            });
        }

        // Ensure proper scale configuration
        if (config.options && config.options.scales) {
            Object.keys(config.options.scales).forEach(scaleKey => {
                const scale = config.options.scales[scaleKey];
                if (scale) {
                    // Prevent infinite scrolling by setting reasonable bounds
                    if (scale.type !== 'category') {
                        scale.beginAtZero = scale.beginAtZero !== false;
                        if (!scale.hasOwnProperty('min') && !scale.hasOwnProperty('max')) {
                            scale.min = scale.beginAtZero ? 0 : undefined;
                            scale.max = undefined; // Let Chart.js auto-calculate
                        }
                    }
                }
            });
        }

        // Set canvas dimensions before creating chart
        ctx.canvas.style.height = '100%';
        ctx.canvas.style.width = '100%';

        return new Chart(ctx, config);
    } catch (error) {
        console.error('Chart creation error:', error);
        
        // Create fallback message
        const container = ctx.canvas.parentElement;
        if (container) {
            container.innerHTML = `
                <div class="alert alert-warning d-flex align-items-center justify-content-center" style="height: 200px;">
                    <div class="text-center">
                        <i class="bi bi-exclamation-triangle fs-2 text-warning mb-2"></i>
                        <div>Chart temporarily unavailable</div>
                        <small class="text-muted">Please refresh the page</small>
                    </div>
                </div>
            `;
        }
        return null;
    }
}

// Fix existing charts on page load
document.addEventListener('DOMContentLoaded', function() {
    // Add proper container styling to all chart containers
    document.querySelectorAll('canvas[id$="Chart"]').forEach(canvas => {
        const container = canvas.parentElement;
        if (container) {
            // Ensure container has proper styling
            if (!container.style.height) {
                container.style.height = '350px';
            }
            container.style.position = 'relative';
            container.style.overflow = 'hidden';
            
            // Ensure canvas fills container properly
            canvas.style.width = '100% !important';
            canvas.style.height = '100% !important';
            canvas.style.maxHeight = '350px';
        }
    });

    // Add resize observer to handle container changes
    if (window.ResizeObserver) {
        const observer = new ResizeObserver(entries => {
            entries.forEach(entry => {
                const canvas = entry.target.querySelector('canvas');
                if (canvas && canvas._chart) {
                    canvas._chart.resize();
                }
            });
        });

        document.querySelectorAll('.chart-container').forEach(container => {
            observer.observe(container);
        });
    }
});

// Export for global use
window.createSafeChart = createSafeChart;