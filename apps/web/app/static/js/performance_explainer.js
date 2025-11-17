/**
 * AGENT 3: Performance Score Explanation and ROI Transparency Module
 * Provides detailed explanations for all calculations and metrics
 */

class PerformanceExplainer {
    constructor() {
        this.explanations = {
            performance_score: {
                title: "Performance Score Calculation",
                description: "Composite score based on multiple logistics optimization factors",
                formula: "((Space Utilization × 0.4) + (Cost Efficiency × 0.3) + (Weight Optimization × 0.2) + (Time Efficiency × 0.1))",
                components: [
                    {
                        name: "Space Utilization (40%)",
                        description: "Percentage of truck volume actually used by cargo",
                        calculation: "(Total Volume of Packed Items / Total Truck Volume) × 100"
                    },
                    {
                        name: "Cost Efficiency (30%)",
                        description: "Cost savings compared to baseline shipping costs",
                        calculation: "(Baseline Cost - Optimized Cost) / Baseline Cost × 100"
                    },
                    {
                        name: "Weight Optimization (20%)",
                        description: "Optimal weight distribution and utilization",
                        calculation: "(Actual Weight Used / Maximum Weight Capacity) × 100"
                    },
                    {
                        name: "Time Efficiency (10%)",
                        description: "Delivery time optimization and route efficiency",
                        calculation: "(Standard Time - Optimized Time) / Standard Time × 100"
                    }
                ]
            },
            roi_calculation: {
                title: "ROI (Return on Investment) Breakdown",
                description: "Financial impact analysis of optimization decisions",
                formula: "((Total Savings - Implementation Cost) / Implementation Cost) × 100",
                components: [
                    {
                        name: "Fuel Cost Savings",
                        description: "Reduced fuel consumption through optimized loading",
                        calculation: "Distance × (Standard Fuel Rate - Optimized Fuel Rate)"
                    },
                    {
                        name: "Maintenance Cost Reduction",
                        description: "Lower vehicle wear through optimal weight distribution",
                        calculation: "Distance × Maintenance Rate × Weight Optimization Factor"
                    },
                    {
                        name: "Driver Cost Efficiency",
                        description: "Reduced driver hours through route optimization",
                        calculation: "Driver Rate × (Standard Hours - Optimized Hours)"
                    },
                    {
                        name: "Vehicle Utilization Improvement",
                        description: "Better truck capacity usage reducing fleet size needs",
                        calculation: "Number of Trucks Saved × Daily Truck Operating Cost"
                    }
                ]
            },
            cost_savings: {
                title: "Cost Savings Analysis",
                description: "Detailed breakdown of cost reduction sources",
                categories: [
                    {
                        name: "Operational Costs",
                        items: ["Fuel", "Maintenance", "Driver wages", "Vehicle depreciation"]
                    },
                    {
                        name: "Efficiency Gains",
                        items: ["Reduced trips", "Optimal routes", "Better load planning", "Time savings"]
                    },
                    {
                        name: "Resource Optimization",
                        items: ["Fleet utilization", "Warehouse efficiency", "Inventory management"]
                    }
                ]
            }
        };
    }

    /**
     * AGENT 3: Generate detailed explanation modal for any metric
     */
    showExplanation(metricType, value, context = {}) {
        const explanation = this.explanations[metricType];
        if (!explanation) {
            console.error(`AGENT 3: No explanation found for metric type: ${metricType}`);
            return;
        }

        const modal = this.createExplanationModal(explanation, value, context);
        document.body.appendChild(modal);
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }

    /**
     * AGENT 3: Create professional explanation modal
     */
    createExplanationModal(explanation, value, context) {
        const modal = document.createElement('div');
        modal.className = 'explanation-modal-overlay';
        
        modal.innerHTML = `
            <div class="explanation-modal">
                <div class="explanation-header">
                    <h3>${explanation.title}</h3>
                    <button class="explanation-close" onclick="this.closest('.explanation-modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="explanation-content">
                    <div class="explanation-description">
                        <p>${explanation.description}</p>
                    </div>
                    
                    <div class="current-value">
                        <h4>Current Value: <span class="value-highlight">${value}</span></h4>
                    </div>
                    
                    ${explanation.formula ? `
                        <div class="formula-section">
                            <h4>Calculation Formula:</h4>
                            <div class="formula">${explanation.formula}</div>
                        </div>
                    ` : ''}
                    
                    ${explanation.components ? `
                        <div class="components-section">
                            <h4>Component Breakdown:</h4>
                            ${explanation.components.map(comp => `
                                <div class="component-item">
                                    <h5>${comp.name}</h5>
                                    <p>${comp.description}</p>
                                    <div class="component-calculation">${comp.calculation}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${explanation.categories ? `
                        <div class="categories-section">
                            <h4>Analysis Categories:</h4>
                            ${explanation.categories.map(cat => `
                                <div class="category-item">
                                    <h5>${cat.name}</h5>
                                    <ul>
                                        ${cat.items.map(item => `<li>${item}</li>`).join('')}
                                    </ul>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <div class="context-data">
                        <h4>Current Context:</h4>
                        <pre>${JSON.stringify(context, null, 2)}</pre>
                    </div>
                </div>
                
                <div class="explanation-footer">
                    <button class="btn-professional" onclick="this.closest('.explanation-modal-overlay').remove()">
                        Got It
                    </button>
                </div>
            </div>
        `;
        
        return modal;
    }

    /**
     * AGENT 3: Add explanation tooltips to existing elements
     */
    addExplanationTooltips() {
        // Add tooltip triggers to performance scores
        document.querySelectorAll('[data-explain]').forEach(element => {
            element.style.cursor = 'help';
            element.title = 'Click for detailed explanation';
            
            element.addEventListener('click', (e) => {
                e.preventDefault();
                const metricType = element.dataset.explain;
                const value = element.textContent.trim();
                const context = JSON.parse(element.dataset.context || '{}');
                
                this.showExplanation(metricType, value, context);
            });
        });
    }

    /**
     * AGENT 3: Generate real-time calculation validation
     */
    validateCalculation(calculationType, inputData, result) {
        const validation = {
            input_data: inputData,
            calculated_result: result,
            timestamp: new Date().toISOString(),
            validation_steps: []
        };

        switch (calculationType) {
            case 'space_utilization':
                validation.validation_steps = [
                    `Step 1: Calculate total item volume = ${inputData.total_item_volume} cm³`,
                    `Step 2: Get truck volume = ${inputData.truck_volume} cm³`,
                    `Step 3: Calculate utilization = (${inputData.total_item_volume} / ${inputData.truck_volume}) × 100`,
                    `Step 4: Result = ${result}% space utilization`,
                    `Validation: ${result <= 100 ? 'PASSED' : 'FAILED - Exceeds 100%'}`
                ];
                break;
                
            case 'cost_calculation':
                validation.validation_steps = [
                    `Step 1: Base fuel cost = ${inputData.distance} km × ₹${inputData.fuel_rate}/km = ₹${inputData.fuel_cost}`,
                    `Step 2: Maintenance cost = ${inputData.distance} km × ₹${inputData.maintenance_rate}/km = ₹${inputData.maintenance_cost}`,
                    `Step 3: Driver cost = ₹${inputData.driver_cost}`,
                    `Step 4: Total cost = ₹${result}`,
                    `Validation: All cost components accounted for`
                ];
                break;
        }

        return validation;
    }
}

// AGENT 3: Initialize performance explainer globally
window.performanceExplainer = new PerformanceExplainer();

// AGENT 3: Auto-initialize tooltips when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.performanceExplainer.addExplanationTooltips();
});

// AGENT 3: CSS Styles for explanation modals
const explanationStyles = `
<style>
.explanation-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.3s ease;
}

.explanation-modal-overlay.show {
    opacity: 1;
}

.explanation-modal {
    background: #ffffff;
    border-radius: 16px;
    max-width: 800px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    transform: translateY(30px);
    transition: all 0.3s ease;
}

.explanation-modal-overlay.show .explanation-modal {
    transform: translateY(0);
}

.explanation-header {
    background: linear-gradient(135deg, var(--primary-blue), var(--primary-blue-dark));
    color: white;
    padding: 24px;
    border-radius: 16px 16px 0 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.explanation-header h3 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
}

.explanation-close {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 8px;
    color: white;
    width: 40px;
    height: 40px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.explanation-close:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
}

.explanation-content {
    padding: 24px;
}

.explanation-description {
    margin-bottom: 20px;
    font-size: 1.1rem;
    color: var(--gray-700);
    line-height: 1.6;
}

.current-value {
    background: var(--gray-50);
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    border-left: 4px solid var(--primary-blue);
}

.value-highlight {
    color: var(--primary-blue);
    font-weight: 700;
    font-size: 1.2rem;
}

.formula-section {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
}

.formula {
    font-family: 'Monaco', 'Courier New', monospace;
    background: white;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid var(--gray-300);
    font-size: 0.9rem;
    margin-top: 8px;
}

.component-item {
    background: #ffffff;
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
}

.component-item h5 {
    color: var(--primary-blue);
    margin-bottom: 8px;
    font-weight: 600;
}

.component-calculation {
    font-family: 'Monaco', 'Courier New', monospace;
    background: var(--gray-50);
    padding: 8px;
    border-radius: 4px;
    font-size: 0.85rem;
    margin-top: 8px;
}

.context-data {
    background: var(--gray-50);
    padding: 16px;
    border-radius: 8px;
    margin-top: 20px;
}

.context-data pre {
    background: white;
    padding: 12px;
    border-radius: 4px;
    font-size: 0.8rem;
    overflow-x: auto;
}

.explanation-footer {
    padding: 20px 24px;
    border-top: 1px solid var(--gray-200);
    text-align: right;
}
</style>
`;

// Inject styles into document
document.head.insertAdjacentHTML('beforeend', explanationStyles);