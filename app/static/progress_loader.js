/**
 * Enhanced Progress Loading System
 * Priority 2: Enhanced loading screens with progress percentage and stress testing capability
 */

class ProgressLoader {
    constructor() {
        this.currentProgress = 0;
        this.targetProgress = 0;
        this.progressStep = 2;
        this.intervalId = null;
        this.loadingMessages = [
            "Initializing optimization algorithms...",
            "Analyzing carton specifications...",
            "Calculating truck dimensions...",
            "Running 3D packing simulations...",
            "Optimizing space utilization...",
            "Computing cost analysis...",
            "Generating recommendations...",
            "Finalizing results...",
            "Preparing visualizations...",
            "Loading complete!"
        ];
        this.currentMessageIndex = 0;
        this.isStressTest = false;
        this.stressTestMessages = [
            "Loading massive dataset...",
            "Processing lakhs of cartons...",
            "Optimizing large-scale operations...",
            "Computing complex algorithms...",
            "Handling big data operations...",
            "Scaling optimization engine...",
            "Processing batch operations...",
            "Finalizing massive computations...",
            "Stress test complete!"
        ];
    }

    createProgressOverlay(title = "Processing", isStressTest = false) {
        this.isStressTest = isStressTest;
        const messages = isStressTest ? this.stressTestMessages : this.loadingMessages;
        
        const overlay = document.createElement('div');
        overlay.id = 'progress-loading-overlay';
        overlay.className = 'progress-loading-overlay';
        overlay.innerHTML = `
            <div class="progress-loading-container">
                <div class="progress-header">
                    <h3 class="progress-title">${title}</h3>
                    ${isStressTest ? '<div class="stress-test-badge">STRESS TEST MODE</div>' : ''}
                </div>
                
                <div class="progress-animation">
                    <div class="progress-circle">
                        <svg class="progress-ring" width="120" height="120">
                            <circle class="progress-ring-background" cx="60" cy="60" r="54"></circle>
                            <circle class="progress-ring-fill" cx="60" cy="60" r="54"></circle>
                        </svg>
                        <div class="progress-percentage">0%</div>
                    </div>
                </div>

                <div class="progress-bar-container">
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: 0%"></div>
                        <div class="progress-bar-glow"></div>
                    </div>
                </div>

                <div class="progress-details">
                    <div class="progress-message">Initializing...</div>
                    <div class="progress-stats">
                        <span class="progress-time">Elapsed: <span id="elapsed-time">0s</span></span>
                        <span class="progress-eta">ETA: <span id="eta-time">--</span></span>
                    </div>
                </div>

                <div class="progress-phases">
                    ${messages.map((msg, index) => `
                        <div class="progress-phase" id="phase-${index}">
                            <div class="phase-indicator"></div>
                            <span class="phase-text">${msg}</span>
                        </div>
                    `).join('')}
                </div>

                <div class="progress-spinner">
                    <div class="spinner-ring"></div>
                    <div class="spinner-ring"></div>
                    <div class="spinner-ring"></div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.startTimer();
        return overlay;
    }

    updateProgress(progress, message = null) {
        this.targetProgress = Math.min(100, Math.max(0, progress));
        
        if (message) {
            const messageEl = document.querySelector('.progress-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
        }

        // Update phase indicators
        const messages = this.isStressTest ? this.stressTestMessages : this.loadingMessages;
        const currentPhase = Math.floor((this.targetProgress / 100) * messages.length);
        
        for (let i = 0; i < messages.length; i++) {
            const phaseEl = document.getElementById(`phase-${i}`);
            if (phaseEl) {
                if (i < currentPhase) {
                    phaseEl.className = 'progress-phase completed';
                } else if (i === currentPhase) {
                    phaseEl.className = 'progress-phase active';
                } else {
                    phaseEl.className = 'progress-phase';
                }
            }
        }

        if (!this.intervalId) {
            this.animateProgress();
        }
    }

    animateProgress() {
        this.intervalId = setInterval(() => {
            if (this.currentProgress < this.targetProgress) {
                this.currentProgress += this.progressStep;
                if (this.currentProgress > this.targetProgress) {
                    this.currentProgress = this.targetProgress;
                }
            }

            this.renderProgress();

            if (this.currentProgress >= this.targetProgress) {
                clearInterval(this.intervalId);
                this.intervalId = null;
                
                if (this.currentProgress >= 100) {
                    setTimeout(() => this.hideProgress(), 500);
                }
            }
        }, 50);
    }

    renderProgress() {
        const percentage = Math.round(this.currentProgress);
        
        // Update percentage display
        const percentageEl = document.querySelector('.progress-percentage');
        if (percentageEl) {
            percentageEl.textContent = `${percentage}%`;
        }

        // Update circular progress
        const circle = document.querySelector('.progress-ring-fill');
        if (circle) {
            const circumference = 2 * Math.PI * 54;
            const strokeDashoffset = circumference - (percentage / 100) * circumference;
            circle.style.strokeDashoffset = strokeDashoffset;
        }

        // Update progress bar
        const progressFill = document.querySelector('.progress-bar-fill');
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        // Update ETA
        this.updateETA();
    }

    updateETA() {
        const elapsedTime = this.getElapsedTime();
        const elapsedEl = document.getElementById('elapsed-time');
        const etaEl = document.getElementById('eta-time');
        
        if (elapsedEl) {
            elapsedEl.textContent = `${Math.round(elapsedTime)}s`;
        }

        if (etaEl && this.currentProgress > 5) {
            const rate = this.currentProgress / elapsedTime;
            const remainingProgress = 100 - this.currentProgress;
            const eta = remainingProgress / rate;
            etaEl.textContent = `${Math.round(eta)}s`;
        }
    }

    simulateStressTestProgress(totalItems = 100000) {
        let currentItem = 0;
        const batchSize = Math.max(1000, totalItems / 100);
        
        const processNextBatch = () => {
            currentItem += batchSize;
            const progress = Math.min(100, (currentItem / totalItems) * 100);
            
            let message = `Processing ${currentItem.toLocaleString()} of ${totalItems.toLocaleString()} items`;
            if (progress < 20) {
                message = `Loading ${totalItems.toLocaleString()} cartons into memory...`;
            } else if (progress < 40) {
                message = `Running optimization algorithms...`;
            } else if (progress < 60) {
                message = `Computing space utilization matrix...`;
            } else if (progress < 80) {
                message = `Calculating cost optimizations...`;
            } else if (progress < 95) {
                message = `Finalizing recommendations...`;
            } else {
                message = `Stress test completed successfully!`;
            }
            
            this.updateProgress(progress, message);
            
            if (currentItem < totalItems) {
                // Variable delay for realistic simulation
                const delay = Math.random() * 100 + 50;
                setTimeout(processNextBatch, delay);
            }
        };
        
        processNextBatch();
    }

    simulateRealisticProgress(steps = 10) {
        const stepProgress = 100 / steps;
        let currentStep = 0;
        
        const processNextStep = () => {
            const messages = this.isStressTest ? this.stressTestMessages : this.loadingMessages;
            const progress = Math.min(100, (currentStep + 1) * stepProgress);
            const messageIndex = Math.floor((currentStep / steps) * messages.length);
            const message = messages[messageIndex] || messages[messages.length - 1];
            
            this.updateProgress(progress, message);
            currentStep++;
            
            if (currentStep < steps) {
                // Variable timing for realistic feel
                const delay = Math.random() * 1000 + 500;
                setTimeout(processNextStep, delay);
            }
        };
        
        processNextStep();
    }

    startTimer() {
        this.startTime = Date.now();
    }

    getElapsedTime() {
        return (Date.now() - this.startTime) / 1000;
    }

    hideProgress() {
        const overlay = document.getElementById('progress-loading-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    // Public API methods
    show(title = "Processing", isStressTest = false) {
        this.createProgressOverlay(title, isStressTest);
        this.updateProgress(0);
    }

    setProgress(progress, message = null) {
        this.updateProgress(progress, message);
    }

    startStressTest(totalItems = 100000, title = "Stress Testing") {
        this.show(title, true);
        this.simulateStressTestProgress(totalItems);
    }

    startRealisticSim(title = "Processing", steps = 10) {
        this.show(title);
        this.simulateRealisticProgress(steps);
    }

    complete(message = "Processing complete!") {
        this.updateProgress(100, message);
    }

    hide() {
        this.hideProgress();
    }
}

// Global instance
window.progressLoader = new ProgressLoader();

// Enhanced loading functions for backward compatibility
function showLoadingSpinner(message = "Loading...", isStressTest = false) {
    progressLoader.show(message, isStressTest);
}

function hideLoadingSpinner() {
    progressLoader.hide();
}

function updateLoadingProgress(progress, message = null) {
    progressLoader.setProgress(progress, message);
}

function startStressTest(totalItems = 100000) {
    progressLoader.startStressTest(totalItems, "Stress Testing Large Dataset");
}

// Auto-apply enhanced loading to form submissions
document.addEventListener('DOMContentLoaded', function() {
    // Intercept form submissions for progress tracking
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const submitBtn = form.querySelector('button[type="submit"]');
            const formData = new FormData(form);
            
            // Check if this might be a large operation
            const isLargeOperation = form.action.includes('sale-orders') || 
                                   form.action.includes('batch') ||
                                   submitBtn?.textContent.toLowerCase().includes('process');
            
            if (isLargeOperation) {
                // Prevent default submission
                e.preventDefault();
                
                // Show enhanced progress
                progressLoader.show("Processing Sale Orders");
                
                // Submit via fetch for progress tracking
                fetch(form.action, {
                    method: form.method || 'POST',
                    body: formData
                })
                .then(response => {
                    if (response.redirected) {
                        progressLoader.complete("Redirecting to results...");
                        setTimeout(() => {
                            window.location.href = response.url;
                        }, 1000);
                    } else {
                        return response.text().then(html => {
                            progressLoader.complete("Processing complete!");
                            setTimeout(() => {
                                document.body.innerHTML = html;
                            }, 1000);
                        });
                    }
                })
                .catch(error => {
                    console.error('Form submission error:', error);
                    progressLoader.hide();
                    alert('An error occurred during processing. Please try again.');
                });
                
                // Start realistic progress simulation
                progressLoader.simulateRealisticProgress(8);
            }
        });
    });
});