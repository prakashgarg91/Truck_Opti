/**
 * MULTI-AGENT INTEGRATION COORDINATOR
 * Orchestrates all agent improvements for seamless user experience
 */

class MultiAgentCoordinator {
    constructor() {
        this.agents = {
            algorithm: new AlgorithmAgent(),
            ui: new UIAgent(),
            analytics: new AnalyticsAgent(),
            backend: new BackendAgent(),
            validation: new ValidationAgent()
        };
        
        this.initialize();
    }

    initialize() {
        console.log('🤖 MULTI-AGENT SYSTEM INITIALIZING...');
        
        // Initialize all agents
        Object.entries(this.agents).forEach(([name, agent]) => {
            try {
                agent.initialize();
                console.log(`✅ ${name.toUpperCase()} AGENT: Ready`);
            } catch (error) {
                console.error(`❌ ${name.toUpperCase()} AGENT: Failed to initialize`, error);
            }
        });
        
        // Setup cross-agent communication
        this.setupCommunication();
        
        // Apply global improvements
        this.applyGlobalImprovements();
        
        console.log('🚀 MULTI-AGENT SYSTEM: Fully operational');
    }

    setupCommunication() {
        // Event bus for inter-agent communication
        this.eventBus = new EventTarget();
        
        // Register agent listeners
        this.eventBus.addEventListener('calculation-update', (e) => {
            this.agents.validation.validateCalculation(e.detail);
            this.agents.ui.updateDisplays(e.detail);
        });
        
        this.eventBus.addEventListener('recommendation-generated', (e) => {
            this.agents.validation.validateRecommendation(e.detail);
            this.agents.analytics.explainRecommendation(e.detail);
        });
    }

    applyGlobalImprovements() {
        // Apply professional styling globally
        this.enhanceTables();
        this.enhanceCharts();
        this.addExplanationButtons();
        this.fixDimensionDisplays();
    }

    enhanceTables() {
        // AGENT 2 + 4: Professional table styling with dimension data
        document.querySelectorAll('table').forEach(table => {
            if (!table.classList.contains('table-professional')) {
                table.classList.add('table-professional');
                
                // Add dimension tooltips
                table.querySelectorAll('td').forEach(cell => {
                    if (cell.textContent.includes('N/A') && cell.closest('tr').querySelector('[data-truck-type]')) {
                        const truckType = cell.closest('tr').querySelector('[data-truck-type]').textContent;
                        this.agents.backend.loadTruckDimensions(truckType).then(dims => {
                            cell.textContent = dims.display_text;
                            cell.title = `Volume: ${dims.volume_m3} m³, Max Weight: ${dims.max_weight_kg} kg`;
                        });
                    }
                });
            }
        });
    }

    enhanceCharts() {
        // AGENT 2 + 3: Professional chart styling with explanations
        document.querySelectorAll('.chart-container, [id*="chart"]').forEach(chart => {
            if (!chart.classList.contains('chart-container')) {
                chart.classList.add('chart-container');
            }
            
            // Add explanation button to charts
            if (!chart.querySelector('.explanation-btn')) {
                const explainBtn = document.createElement('button');
                explainBtn.className = 'btn btn-sm btn-outline-primary explanation-btn';
                explainBtn.innerHTML = '<i class="fas fa-question-circle"></i> Explain';
                explainBtn.style.position = 'absolute';
                explainBtn.style.top = '10px';
                explainBtn.style.right = '10px';
                
                const chartType = this.detectChartType(chart);
                explainBtn.onclick = () => {
                    this.agents.analytics.explainChart(chartType, chart);
                };
                
                chart.style.position = 'relative';
                chart.appendChild(explainBtn);
            }
        });
    }

    addExplanationButtons() {
        // AGENT 3: Add explanation buttons to performance metrics
        document.querySelectorAll('[data-metric]').forEach(element => {
            if (!element.querySelector('.explain-metric')) {
                const explainIcon = document.createElement('i');
                explainIcon.className = 'fas fa-info-circle explain-metric ms-2';
                explainIcon.style.cursor = 'pointer';
                explainIcon.style.color = '#6c757d';
                explainIcon.title = 'Click for detailed explanation';
                
                const metricType = element.dataset.metric;
                explainIcon.onclick = (e) => {
                    e.stopPropagation();
                    this.agents.analytics.explainMetric(metricType, element.textContent);
                };
                
                element.appendChild(explainIcon);
            }
        });
    }

    fixDimensionDisplays() {
        // AGENT 4: Fix missing dimension data
        document.querySelectorAll('[data-truck-id]').forEach(element => {
            const truckId = element.dataset.truckId;
            this.agents.backend.getTruckDimensions(truckId).then(dimensions => {
                if (dimensions) {
                    element.textContent = dimensions.display_text;
                    element.title = `${dimensions.volume_m3} m³ capacity, ${dimensions.max_weight_kg} kg max weight`;
                }
            });
        });
    }

    detectChartType(chartElement) {
        // Detect chart type for appropriate explanations
        const classes = chartElement.className.toLowerCase();
        const id = chartElement.id.toLowerCase();
        
        if (classes.includes('performance') || id.includes('performance')) {
            return 'performance_score';
        } else if (classes.includes('cost') || id.includes('cost')) {
            return 'roi_calculation';
        } else if (classes.includes('utilization') || id.includes('utilization')) {
            return 'space_utilization';
        }
        
        return 'general';
    }
}

// Individual Agent Classes
class AlgorithmAgent {
    initialize() {
        this.setupCalculationValidation();
    }

    setupCalculationValidation() {
        // Monitor calculation results and validate them
        window.addEventListener('calculation-complete', (e) => {
            this.validateCalculation(e.detail);
        });
    }

    validateCalculation(data) {
        // Validate calculation accuracy
        if (data.spaceUtilization > 100) {
            console.error('ALGORITHM AGENT: Invalid space utilization > 100%');
            this.showValidationError('Space utilization cannot exceed 100%');
        }
    }

    showValidationError(message) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-warning alert-dismissible fade show';
        alert.innerHTML = `
            <strong>Calculation Warning:</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.insertBefore(alert, document.body.firstChild);
    }
}

class UIAgent {
    initialize() {
        this.applyProfessionalStyling();
        this.setupHoverEffects();
    }

    applyProfessionalStyling() {
        // Apply professional color scheme
        document.documentElement.style.setProperty('--bs-primary', '#2563eb');
        document.documentElement.style.setProperty('--bs-success', '#10b981');
        document.documentElement.style.setProperty('--bs-warning', '#f59e0b');
        document.documentElement.style.setProperty('--bs-danger', '#ef4444');
    }

    setupHoverEffects() {
        // Add professional hover effects to cards and tables
        document.querySelectorAll('.card, .table tr').forEach(element => {
            element.addEventListener('mouseenter', (e) => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            });
            
            element.addEventListener('mouseleave', (e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '';
            });
        });
    }

    updateDisplays(data) {
        // Update UI based on calculation changes
        document.querySelectorAll('[data-auto-update]').forEach(element => {
            const field = element.dataset.autoUpdate;
            if (data[field] !== undefined) {
                element.textContent = data[field];
            }
        });
    }
}

class AnalyticsAgent {
    initialize() {
        // Initialize performance explainer
        if (window.performanceExplainer) {
            window.performanceExplainer.addExplanationTooltips();
        }
    }

    explainChart(chartType, chartElement) {
        const value = this.extractChartValue(chartElement);
        const context = this.getChartContext(chartElement);
        
        if (window.performanceExplainer) {
            window.performanceExplainer.showExplanation(chartType, value, context);
        }
    }

    explainMetric(metricType, value) {
        const context = { timestamp: new Date().toISOString() };
        
        if (window.performanceExplainer) {
            window.performanceExplainer.showExplanation(metricType, value, context);
        }
    }

    extractChartValue(chartElement) {
        // Extract primary value from chart
        const valueElement = chartElement.querySelector('[data-value]') || 
                           chartElement.querySelector('.metric-value') ||
                           chartElement;
        return valueElement.textContent.trim();
    }

    getChartContext(chartElement) {
        // Extract context data from chart
        return {
            chartId: chartElement.id,
            timestamp: new Date().toISOString(),
            location: window.location.pathname
        };
    }
}

class BackendAgent {
    initialize() {
        this.apiCache = new Map();
    }

    async getTruckDimensions(truckId) {
        if (this.apiCache.has(truckId)) {
            return this.apiCache.get(truckId);
        }

        try {
            const response = await fetch(`/api/truck/${truckId}/dimensions`);
            const dimensions = await response.json();
            this.apiCache.set(truckId, dimensions);
            return dimensions;
        } catch (error) {
            console.error('BACKEND AGENT: Failed to load truck dimensions', error);
            return null;
        }
    }

    async loadTruckDimensions(truckName) {
        try {
            const response = await fetch(`/api/truck-by-name/${encodeURIComponent(truckName)}/dimensions`);
            return await response.json();
        } catch (error) {
            console.error('BACKEND AGENT: Failed to load truck dimensions by name', error);
            return { display_text: 'Dimensions unavailable', volume_m3: 0, max_weight_kg: 0 };
        }
    }
}

class ValidationAgent {
    initialize() {
        this.validationRules = {
            maxUtilization: 95,
            minUtilization: 10,
            maxWeight: 100
        };
    }

    validateCalculation(data) {
        const issues = [];
        
        if (data.spaceUtilization > this.validationRules.maxUtilization) {
            issues.push(`Space utilization ${data.spaceUtilization}% exceeds maximum ${this.validationRules.maxUtilization}%`);
        }
        
        if (data.weightUtilization > this.validationRules.maxWeight) {
            issues.push(`Weight utilization ${data.weightUtilization}% exceeds safety limit`);
        }
        
        if (issues.length > 0) {
            this.showValidationIssues(issues);
        }
    }

    validateRecommendation(recommendation) {
        // Validate recommendation logic
        if (!recommendation.dimensions || !recommendation.cost_analysis) {
            console.warn('VALIDATION AGENT: Incomplete recommendation data');
        }
    }

    showValidationIssues(issues) {
        issues.forEach(issue => {
            console.warn('VALIDATION AGENT:', issue);
        });
    }
}

// Initialize multi-agent system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.multiAgentCoordinator = new MultiAgentCoordinator();
});

// Export for global access
window.MultiAgentCoordinator = MultiAgentCoordinator;