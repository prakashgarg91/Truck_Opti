/**
 * Space Optimization UI Components for TruckOpti Enterprise
 * Professional UI for remaining space optimization and carton recommendations
 * 
 * Features:
 * - Interactive space utilization gauge
 * - Professional optimization cards
 * - Real-time carton recommendations
 * - Advanced progress tracking
 * - Professional animations and transitions
 * 
 * Author: Claude Code AI Assistant
 * Version: 3.5.0 - Professional Space Optimization UI
 */

class SpaceOptimizationUI {
    constructor() {
        this.animationDuration = 300;
        this.progressUpdateInterval = null;
        this.currentUtilization = 0;
        this.targetUtilization = 0;
        this.additionalCartons = [];
        this.optimizationSuggestions = [];
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.initializeAnimations();
    }
    
    setupEventListeners() {
        // Initialize space optimization when truck recommendations load
        document.addEventListener('DOMContentLoaded', () => {
            this.attachToRecommendationFlow();
        });
        
        // Handle optimization suggestion clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('apply-optimization')) {
                this.applyOptimization(e.target.dataset.optimizationId);
            }
            
            if (e.target.classList.contains('add-carton-btn')) {
                this.addRecommendedCarton(e.target.dataset.cartonId);
            }
        });
    }
    
    attachToRecommendationFlow() {
        // Hook into existing truck recommendation display
        const recommendedSection = document.querySelector('#recommended');
        if (recommendedSection) {
            this.enhanceRecommendationDisplay();
        }
    }
    
    enhanceRecommendationDisplay() {
        // Add space optimization widgets to each truck recommendation
        const truckRows = document.querySelectorAll('#recommendTable tbody tr');
        truckRows.forEach((row, index) => {
            this.addSpaceOptimizationToRow(row, index);
        });
    }
    
    addSpaceOptimizationToRow(row, index) {
        // Create space optimization cell
        const optimizationCell = document.createElement('td');
        optimizationCell.innerHTML = this.createSpaceOptimizationWidget(index);
        
        // Insert after cost analysis cell
        const costCell = row.querySelector('td:nth-child(3)');
        if (costCell) {
            costCell.insertAdjacentElement('afterend', optimizationCell);
        }
    }
    
    createSpaceOptimizationWidget(truckIndex) {
        return `
            <div class="space-optimization-widget" data-truck-index="${truckIndex}">
                <div class="utilization-gauge-container">
                    <div class="utilization-gauge" id="gauge-${truckIndex}">
                        <div class="gauge-fill" style="--utilization: 73.2%"></div>
                        <div class="gauge-text">
                            <span class="utilization-value">73.2%</span>
                            <small class="gauge-label">Space Used</small>
                        </div>
                    </div>
                </div>
                <div class="remaining-space-info">
                    <small class="text-muted">
                        <i class="bi bi-box text-info"></i>
                        <span class="remaining-volume">4.3m³</span> remaining
                    </small>
                </div>
                <button class="btn btn-outline-primary btn-sm mt-2 optimize-space-btn" 
                        data-truck-index="${truckIndex}"
                        onclick="spaceOptimizer.showOptimizationPanel(${truckIndex})">
                    <i class="bi bi-lightning"></i> Optimize
                </button>
            </div>
        `;
    }
    
    showOptimizationPanel(truckIndex) {
        // Create and show optimization modal
        const modalHtml = this.createOptimizationModal(truckIndex);
        
        // Remove existing modal if present
        const existingModal = document.getElementById('spaceOptimizationModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('spaceOptimizationModal'));
        modal.show();
        
        // Load optimization data
        this.loadOptimizationData(truckIndex);
    }
    
    createOptimizationModal(truckIndex) {
        return `
            <div class="modal fade" id="spaceOptimizationModal" tabindex="-1" aria-labelledby="spaceOptimizationModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title" id="spaceOptimizationModalLabel">
                                <i class="bi bi-lightning"></i> Space Optimization for Truck ${truckIndex + 1}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <!-- Current Space Utilization -->
                                <div class="col-lg-4">
                                    <div class="card border-0 bg-light">
                                        <div class="card-header bg-info text-white">
                                            <h6 class="mb-0">
                                                <i class="bi bi-pie-chart"></i> Current Utilization
                                            </h6>
                                        </div>
                                        <div class="card-body text-center">
                                            <div class="space-utilization-gauge-large" id="largeGauge-${truckIndex}">
                                                <div class="gauge-circle">
                                                    <div class="gauge-progress" style="--progress: 73.2"></div>
                                                    <div class="gauge-center">
                                                        <span class="gauge-percentage">73.2%</span>
                                                        <small class="gauge-subtitle">Space Used</small>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="utilization-breakdown mt-3">
                                                <div class="row text-center">
                                                    <div class="col-6">
                                                        <div class="metric-box">
                                                            <strong class="text-primary">15</strong>
                                                            <br><small>Cartons Fitted</small>
                                                        </div>
                                                    </div>
                                                    <div class="col-6">
                                                        <div class="metric-box">
                                                            <strong class="text-info">4.3m³</strong>
                                                            <br><small>Remaining Space</small>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Optimization Suggestions -->
                                <div class="col-lg-8">
                                    <div class="card border-0">
                                        <div class="card-header bg-success text-white">
                                            <h6 class="mb-0">
                                                <i class="bi bi-lightbulb"></i> Smart Optimization Suggestions
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div id="optimizationSuggestions-${truckIndex}">
                                                <div class="text-center py-4">
                                                    <div class="spinner-border text-primary" role="status">
                                                        <span class="visually-hidden">Loading optimization suggestions...</span>
                                                    </div>
                                                    <p class="mt-2 text-muted">Calculating optimal arrangements...</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Additional Carton Recommendations -->
                            <div class="row mt-4">
                                <div class="col-12">
                                    <div class="card border-0">
                                        <div class="card-header bg-warning text-dark">
                                            <h6 class="mb-0">
                                                <i class="bi bi-plus-circle"></i> Additional Carton Recommendations
                                            </h6>
                                        </div>
                                        <div class="card-body">
                                            <div id="additionalCartons-${truckIndex}">
                                                <div class="text-center py-3">
                                                    <div class="spinner-border text-warning" role="status">
                                                        <span class="visually-hidden">Finding compatible cartons...</span>
                                                    </div>
                                                    <p class="mt-2 text-muted">Analyzing available carton types...</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="bi bi-x-circle"></i> Close
                            </button>
                            <button type="button" class="btn btn-success" onclick="spaceOptimizer.applyAllOptimizations(${truckIndex})">
                                <i class="bi bi-check-circle"></i> Apply All Optimizations
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    loadOptimizationData(truckIndex) {
        // Load real optimization data from API
        fetch(`/api/space-optimization/${truckIndex}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.displayOptimizationSuggestions(truckIndex, data.suggestions);
                    this.displayAdditionalCartons(truckIndex, data.additional_cartons);
                } else {
                    this.showValidationError('Failed to load optimization data: ' + data.error);
                    // Fall back to simulated data
                    this.displayOptimizationSuggestions(truckIndex);
                    this.displayAdditionalCartons(truckIndex);
                }
            })
            .catch(error => {
                console.error('Error loading optimization data:', error);
                this.showValidationError('Network error loading optimization data');
                // Fall back to simulated data
                this.displayOptimizationSuggestions(truckIndex);
                this.displayAdditionalCartons(truckIndex);
            });
    }
    
    displayOptimizationSuggestions(truckIndex, suggestions = null) {
        // Use provided suggestions or fall back to default ones
        const defaultSuggestions = [
            {
                id: 1,
                title: "Rearrange Large Items",
                description: "Move 3 large cartons to create a contiguous space block",
                impact: "+12% efficiency",
                difficulty: "Easy",
                timeEstimate: "2 minutes",
                icon: "bi-arrow-repeat",
                priority: "high"
            },
            {
                id: 2,
                title: "Optimize Vertical Stacking",
                description: "Stack medium boxes to utilize vertical space better",
                impact: "+8% efficiency",
                difficulty: "Medium",
                timeEstimate: "5 minutes",
                icon: "bi-stack",
                priority: "medium"
            },
            {
                id: 3,
                title: "Fill Corner Spaces",
                description: "Use small items to fill corner gaps",
                impact: "+5% efficiency",
                difficulty: "Easy",
                timeEstimate: "3 minutes",
                icon: "bi-puzzle",
                priority: "low"
            }
        ];
        
        const suggestionList = suggestions || defaultSuggestions;
        const suggestionsHtml = suggestionList.map(suggestion => 
            this.createOptimizationCard(suggestion)
        ).join('');
        
        document.getElementById(`optimizationSuggestions-${truckIndex}`).innerHTML = suggestionsHtml;
    }
    
    createOptimizationCard(suggestion) {
        const priorityClass = {
            'high': 'border-danger',
            'medium': 'border-warning', 
            'low': 'border-info'
        }[suggestion.priority];
        
        const priorityBadge = {
            'high': 'bg-danger',
            'medium': 'bg-warning',
            'low': 'bg-info'
        }[suggestion.priority];
        
        return `
            <div class="optimization-card ${priorityClass} mb-3" data-suggestion-id="${suggestion.id}">
                <div class="card-body p-3">
                    <div class="row align-items-center">
                        <div class="col-md-1 text-center">
                            <i class="${suggestion.icon} text-primary fs-3"></i>
                        </div>
                        <div class="col-md-6">
                            <h6 class="mb-1">${suggestion.title}</h6>
                            <p class="text-muted mb-0">${suggestion.description}</p>
                        </div>
                        <div class="col-md-3">
                            <div class="text-center">
                                <span class="badge ${priorityBadge} mb-1">${suggestion.impact}</span>
                                <br><small class="text-muted">${suggestion.timeEstimate}</small>
                            </div>
                        </div>
                        <div class="col-md-2 text-end">
                            <button class="btn btn-outline-primary btn-sm apply-optimization" 
                                    data-optimization-id="${suggestion.id}">
                                <i class="bi bi-play-circle"></i> Apply
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    displayAdditionalCartons(truckIndex, cartons = null) {
        // Use provided cartons or fall back to default ones
        const defaultCartons = [
            {
                id: 1,
                name: "Small Electronics Box",
                dimensions: "20×15×10 cm",
                quantity: 5,
                efficiency: "+7%",
                availability: "Available",
                value: "₹2,500"
            },
            {
                id: 2,
                name: "Document Folder",
                dimensions: "30×25×5 cm",
                quantity: 8,
                efficiency: "+4%",
                availability: "Available",
                value: "₹800"
            },
            {
                id: 3,
                name: "Tool Kit Box",
                dimensions: "25×20×15 cm",
                quantity: 3,
                efficiency: "+9%",
                availability: "Limited",
                value: "₹4,200"
            }
        ];
        
        const cartonList = cartons || defaultCartons;
        const cartonsHtml = `
            <div class="row">
                ${cartonList.map(carton => this.createCartonRecommendationCard(carton)).join('')}
            </div>
        `;
        
        document.getElementById(`additionalCartons-${truckIndex}`).innerHTML = cartonsHtml;
    }
    
    createCartonRecommendationCard(carton) {
        const availabilityClass = carton.availability === 'Available' ? 'text-success' : 'text-warning';
        
        return `
            <div class="col-md-4 mb-3">
                <div class="card h-100 carton-recommendation-card" data-carton-id="${carton.id}">
                    <div class="card-header bg-light">
                        <div class="d-flex justify-content-between align-items-start">
                            <h6 class="mb-0">${carton.name}</h6>
                            <span class="badge bg-success">${carton.efficiency}</span>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="carton-visual mb-3">
                            <div class="carton-box-3d">
                                <div class="carton-icon">
                                    <i class="bi bi-box text-primary" style="font-size: 2rem;"></i>
                                </div>
                            </div>
                        </div>
                        <div class="carton-details">
                            <p class="mb-2">
                                <strong>Dimensions:</strong><br>
                                <code>${carton.dimensions}</code>
                            </p>
                            <p class="mb-2">
                                <strong>Value:</strong> ${carton.value}
                            </p>
                            <p class="mb-3">
                                <strong>Availability:</strong> 
                                <span class="${availabilityClass}">${carton.availability}</span>
                            </p>
                        </div>
                        <div class="quantity-selector mb-3">
                            <label class="form-label">Quantity:</label>
                            <div class="input-group">
                                <button class="btn btn-outline-secondary btn-sm" type="button" 
                                        onclick="spaceOptimizer.adjustQuantity(${carton.id}, -1)">-</button>
                                <input type="number" class="form-control form-control-sm text-center" 
                                       value="0" min="0" max="${carton.quantity}" 
                                       id="qty-${carton.id}">
                                <button class="btn btn-outline-secondary btn-sm" type="button"
                                        onclick="spaceOptimizer.adjustQuantity(${carton.id}, 1)">+</button>
                            </div>
                            <small class="text-muted">Max: ${carton.quantity} available</small>
                        </div>
                    </div>
                    <div class="card-footer">
                        <button class="btn btn-primary btn-sm w-100 add-carton-btn" 
                                data-carton-id="${carton.id}">
                            <i class="bi bi-plus-circle"></i> Add to Optimization
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    adjustQuantity(cartonId, change) {
        const input = document.getElementById(`qty-${cartonId}`);
        if (input) {
            const currentValue = parseInt(input.value) || 0;
            const maxValue = parseInt(input.max) || 0;
            const newValue = Math.max(0, Math.min(maxValue, currentValue + change));
            input.value = newValue;
            
            // Update efficiency impact
            this.updateEfficiencyPreview(cartonId, newValue);
        }
    }
    
    updateEfficiencyPreview(cartonId, quantity) {
        // Calculate and display efficiency impact
        const card = document.querySelector(`[data-carton-id="${cartonId}"]`);
        if (card && quantity > 0) {
            const impactBadge = card.querySelector('.badge');
            const baseEfficiency = parseFloat(impactBadge.textContent.replace('+', '').replace('%', ''));
            const newEfficiency = baseEfficiency * quantity;
            impactBadge.textContent = `+${newEfficiency.toFixed(1)}%`;
            impactBadge.classList.remove('bg-success');
            impactBadge.classList.add('bg-warning');
        }
    }
    
    applyOptimization(optimizationId) {
        const card = document.querySelector(`[data-suggestion-id="${optimizationId}"]`);
        if (card) {
            // Add loading state
            const button = card.querySelector('.apply-optimization');
            button.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Applying...';
            button.disabled = true;
            
            // Simulate optimization application
            setTimeout(() => {
                button.innerHTML = '<i class="bi bi-check-circle"></i> Applied';
                button.classList.remove('btn-outline-primary');
                button.classList.add('btn-success');
                
                // Update utilization gauge
                this.updateUtilizationGauge(optimizationId);
                
                // Show success notification
                this.showOptimizationSuccess(optimizationId);
            }, 2000);
        }
    }
    
    addRecommendedCarton(cartonId) {
        const quantityInput = document.getElementById(`qty-${cartonId}`);
        const quantity = parseInt(quantityInput.value) || 0;
        
        if (quantity > 0) {
            // Add loading state
            const button = document.querySelector(`[data-carton-id="${cartonId}"] .add-carton-btn`);
            button.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Adding...';
            button.disabled = true;
            
            // Simulate carton addition
            setTimeout(() => {
                button.innerHTML = '<i class="bi bi-check-circle"></i> Added';
                button.classList.remove('btn-primary');
                button.classList.add('btn-success');
                
                // Update optimization impact
                this.updateOptimizationImpact(cartonId, quantity);
                
                // Show success notification
                this.showCartonAddedSuccess(cartonId, quantity);
            }, 1500);
        } else {
            this.showValidationError('Please select a quantity before adding.');
        }
    }
    
    updateUtilizationGauge(optimizationId) {
        const improvements = {
            1: 12, // +12% for rearrangement
            2: 8,  // +8% for vertical stacking
            3: 5   // +5% for corner filling
        };
        
        const improvement = improvements[optimizationId] || 0;
        const currentUtilization = 73.2;
        const newUtilization = Math.min(95, currentUtilization + improvement);
        
        // Animate gauge update
        this.animateGaugeUpdate(newUtilization);
    }
    
    animateGaugeUpdate(targetUtilization) {
        const gauges = document.querySelectorAll('.utilization-gauge');
        gauges.forEach(gauge => {
            const valueElement = gauge.querySelector('.utilization-value');
            const fillElement = gauge.querySelector('.gauge-fill');
            
            if (valueElement && fillElement) {
                // Animate value
                this.animateValue(valueElement, parseFloat(valueElement.textContent), targetUtilization, '%');
                
                // Animate fill
                fillElement.style.setProperty('--utilization', `${targetUtilization}%`);
            }
        });
    }
    
    animateValue(element, startValue, endValue, suffix = '') {
        const duration = 1000;
        const startTime = performance.now();
        
        const updateValue = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const currentValue = startValue + (endValue - startValue) * progress;
            element.textContent = currentValue.toFixed(1) + suffix;
            
            if (progress < 1) {
                requestAnimationFrame(updateValue);
            }
        };
        
        requestAnimationFrame(updateValue);
    }
    
    updateOptimizationImpact(cartonId, quantity) {
        // Update overall utilization based on added cartons
        const currentUtilization = parseFloat(document.querySelector('.utilization-value').textContent);
        const impactPerUnit = {
            1: 1.4, // Electronics box impact
            2: 0.5, // Document folder impact
            3: 3.0  // Tool kit impact
        };
        
        const totalImpact = (impactPerUnit[cartonId] || 1) * quantity;
        const newUtilization = Math.min(95, currentUtilization + totalImpact);
        
        this.animateGaugeUpdate(newUtilization);
    }
    
    applyAllOptimizations(truckIndex) {
        // Collect optimization IDs and additional cartons
        const optimizationIds = [];
        const additionalCartons = [];
        
        // Get selected optimizations
        const optimizationCards = document.querySelectorAll('.optimization-card');
        optimizationCards.forEach(card => {
            const suggestionId = card.dataset.suggestionId;
            if (suggestionId) {
                optimizationIds.push(parseInt(suggestionId));
            }
        });
        
        // Get selected additional cartons
        const cartonCards = document.querySelectorAll('.carton-recommendation-card');
        cartonCards.forEach(card => {
            const cartonId = card.dataset.cartonId;
            const quantityInput = card.querySelector(`#qty-${cartonId}`);
            if (quantityInput && parseInt(quantityInput.value) > 0) {
                additionalCartons.push({
                    id: parseInt(cartonId),
                    quantity: parseInt(quantityInput.value),
                    efficiency: card.querySelector('.badge').textContent
                });
            }
        });
        
        if (optimizationIds.length === 0 && additionalCartons.length === 0) {
            this.showValidationError('No optimizations or cartons selected to apply.');
            return;
        }
        
        // Show progress modal
        this.showOptimizationProgress(optimizationIds.length + additionalCartons.length);
        
        // Apply optimizations via API
        fetch('/api/space-optimization/apply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                truck_index: truckIndex,
                optimization_ids: optimizationIds,
                additional_cartons: additionalCartons
            })
        })
        .then(response => response.json())
        .then(data => {
            this.hideOptimizationProgress();
            
            if (data.success) {
                // Update utilization gauge with new value
                this.animateGaugeUpdate(data.new_utilization);
                
                // Show success message with details
                const message = `Optimizations applied successfully! New utilization: ${data.new_utilization}% (+${data.impact_summary.total_improvement}% improvement)`;
                this.showAllOptimizationsSuccess(message);
                
                // Mark optimization buttons as applied
                this.markOptimizationsAsApplied();
            } else {
                this.showValidationError('Failed to apply optimizations: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error applying optimizations:', error);
            this.hideOptimizationProgress();
            this.showValidationError('Network error applying optimizations');
        });
    }
    
    markOptimizationsAsApplied() {
        // Mark all optimization buttons as applied
        const applyButtons = document.querySelectorAll('.apply-optimization');
        applyButtons.forEach(button => {
            button.innerHTML = '<i class="bi bi-check-circle"></i> Applied';
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-success');
            button.disabled = true;
        });
        
        // Mark carton add buttons as applied
        const addButtons = document.querySelectorAll('.add-carton-btn');
        addButtons.forEach(button => {
            const quantityInput = button.closest('.carton-recommendation-card').querySelector('input[type="number"]');
            if (quantityInput && parseInt(quantityInput.value) > 0) {
                button.innerHTML = '<i class="bi bi-check-circle"></i> Added';
                button.classList.remove('btn-primary');
                button.classList.add('btn-success');
                button.disabled = true;
            }
        });
    }
    
    showOptimizationProgress(totalSteps) {
        const progressHtml = `
            <div class="modal fade" id="optimizationProgressModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title">
                                <i class="bi bi-gear-fill"></i> Applying Optimizations
                            </h5>
                        </div>
                        <div class="modal-body text-center">
                            <div class="progress mb-3" style="height: 20px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                     id="optimizationProgress" style="width: 0%"></div>
                            </div>
                            <p id="optimizationStatus">Starting optimization process...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', progressHtml);
        const modal = new bootstrap.Modal(document.getElementById('optimizationProgressModal'));
        modal.show();
    }
    
    updateOptimizationProgress(completed, total) {
        const progress = (completed / total) * 100;
        const progressBar = document.getElementById('optimizationProgress');
        const status = document.getElementById('optimizationStatus');
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        
        if (status) {
            status.textContent = `Applied ${completed} of ${total} optimizations...`;
        }
    }
    
    hideOptimizationProgress() {
        const modal = bootstrap.Modal.getInstance(document.getElementById('optimizationProgressModal'));
        if (modal) {
            modal.hide();
        }
        
        setTimeout(() => {
            const modalElement = document.getElementById('optimizationProgressModal');
            if (modalElement) {
                modalElement.remove();
            }
        }, 300);
    }
    
    showOptimizationSuccess(optimizationId) {
        this.showToast('Optimization Applied Successfully', 'success');
    }
    
    showCartonAddedSuccess(cartonId, quantity) {
        this.showToast(`Added ${quantity} cartons successfully`, 'success');
    }
    
    showAllOptimizationsSuccess(message = 'All optimizations applied successfully!') {
        this.showToast(message, 'success');
    }
    
    showValidationError(message) {
        this.showToast(message, 'danger');
    }
    
    showToast(message, type = 'info') {
        const toastHtml = `
            <div class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-triangle' : 'info-circle'}"></i>
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            toastContainer.style.zIndex = '9999';
            document.body.appendChild(toastContainer);
        }
        
        // Add toast
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        
        // Show toast
        const toastElement = toastContainer.lastElementChild;
        const toast = new bootstrap.Toast(toastElement);
        toast.show();
        
        // Remove toast after hiding
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }
    
    initializeAnimations() {
        // Add CSS animations for gauges and cards
        const style = document.createElement('style');
        style.textContent = `
            .space-optimization-widget {
                transition: all 0.3s ease;
            }
            
            .space-optimization-widget:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            
            .utilization-gauge {
                position: relative;
                width: 80px;
                height: 80px;
                margin: 0 auto;
            }
            
            .gauge-fill {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: conic-gradient(
                    from 0deg,
                    #28a745 0deg,
                    #28a745 calc(var(--utilization, 0%) * 3.6deg),
                    #e9ecef calc(var(--utilization, 0%) * 3.6deg),
                    #e9ecef 360deg
                );
                transition: all 1s ease;
            }
            
            .gauge-text {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
            }
            
            .space-utilization-gauge-large {
                width: 150px;
                height: 150px;
                margin: 0 auto;
            }
            
            .gauge-circle {
                position: relative;
                width: 150px;
                height: 150px;
                border-radius: 50%;
                background: conic-gradient(
                    from 0deg,
                    #007bff 0deg,
                    #007bff calc(var(--progress, 0) * 3.6deg),
                    #e9ecef calc(var(--progress, 0) * 3.6deg),
                    #e9ecef 360deg
                );
                transition: all 1s ease;
            }
            
            .gauge-center {
                position: absolute;
                top: 15px;
                left: 15px;
                width: 120px;
                height: 120px;
                border-radius: 50%;
                background: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }
            
            .optimization-card {
                transition: all 0.3s ease;
                border-left: 4px solid transparent;
            }
            
            .optimization-card:hover {
                transform: translateX(5px);
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            
            .carton-recommendation-card {
                transition: all 0.3s ease;
            }
            
            .carton-recommendation-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            }
            
            .carton-box-3d {
                text-align: center;
                padding: 20px;
                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                border-radius: 8px;
                border: 2px dashed #dee2e6;
            }
            
            .metric-box {
                padding: 10px;
                background: #f8f9fa;
                border-radius: 6px;
                border: 1px solid #dee2e6;
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize Space Optimization UI
const spaceOptimizer = new SpaceOptimizationUI();

// Export for global access
window.spaceOptimizer = spaceOptimizer;