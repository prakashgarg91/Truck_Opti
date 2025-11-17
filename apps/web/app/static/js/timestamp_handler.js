/**
 * Advanced Timestamp and Professional UI Handler
 * Manages system time, professional UI updates, and consistent date formatting
 */
class TimestampHandler {
    constructor() {
        this.init();
    }

    init() {
        // Update global datetime display
        this.setupDateTimeDisplay();
        
        // Prevent duplicate entries
        this.setupDuplicatePreventionListeners();
        
        // Professional view details handling
        this.setupViewDetailsModals();
        
        // Remove button UI enhancements
        this.enhanceRemoveButtons();
    }

    setupDateTimeDisplay() {
        // Update timestamp in real-time
        const updateDateTime = () => {
            const now = new Date();
            const formattedDateTime = this.formatDateTime(now);
            
            // Update all timestamp elements
            document.querySelectorAll('.system-timestamp').forEach(el => {
                el.textContent = formattedDateTime;
            });
        };

        // Initial update
        updateDateTime();

        // Update every second
        setInterval(updateDateTime, 1000);
    }

    formatDateTime(date) {
        return date.toLocaleString('en-IN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }

    setupDuplicatePreventionListeners() {
        const trackEntries = new Set();

        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (!form || !form.elements) return;

            const entryKey = this.generateEntryKey(form);
            
            if (trackEntries.has(entryKey)) {
                event.preventDefault();
                this.showDuplicateWarning(form);
                return;
            }

            trackEntries.add(entryKey);
            
            // Remove entry after a timeout to allow re-entry
            setTimeout(() => {
                trackEntries.delete(entryKey);
            }, 5000);
        });
    }

    generateEntryKey(form) {
        const inputs = form.querySelectorAll('input, select, textarea');
        const keyParts = Array.from(inputs)
            .filter(input => input.name && input.value)
            .map(input => `${input.name}:${input.value}`);
        
        return keyParts.join('|');
    }

    showDuplicateWarning(form) {
        const existingWarning = form.querySelector('.duplicate-warning');
        if (existingWarning) existingWarning.remove();

        const warning = document.createElement('div');
        warning.className = 'alert alert-warning duplicate-warning';
        warning.textContent = 'Duplicate entry detected. Please wait before submitting again.';
        
        form.insertBefore(warning, form.firstChild);
        
        setTimeout(() => {
            warning.remove();
        }, 3000);
    }

    setupViewDetailsModals() {
        document.addEventListener('click', (event) => {
            const viewButton = event.target.closest('[data-view-details]');
            if (viewButton) {
                event.preventDefault();
                const targetId = viewButton.dataset.viewDetails;
                const modal = document.getElementById(targetId);
                
                if (modal) {
                    // Animate modal entry
                    modal.classList.add('show');
                    modal.style.display = 'block';
                    document.body.classList.add('modal-open');
                    
                    // Add backdrop
                    const backdrop = document.createElement('div');
                    backdrop.className = 'modal-backdrop fade show';
                    document.body.appendChild(backdrop);
                    
                    // Close button handler
                    const closeButtons = modal.querySelectorAll('[data-bs-dismiss="modal"]');
                    closeButtons.forEach(btn => {
                        btn.addEventListener('click', () => {
                            modal.classList.remove('show');
                            modal.style.display = 'none';
                            document.body.classList.remove('modal-open');
                            backdrop.remove();
                        });
                    });
                }
            }
        });
    }

    enhanceRemoveButtons() {
        document.addEventListener('click', (event) => {
            const removeButton = event.target.closest('.btn-remove');
            if (removeButton) {
                event.preventDefault();
                
                // Create confirmation modal
                const confirmModal = document.createElement('div');
                confirmModal.className = 'modal fade show';
                confirmModal.innerHTML = `
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Confirm Removal</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                Are you sure you want to remove this item?
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-danger confirm-remove">Remove</button>
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(confirmModal);
                
                // Bootstrap modal show
                confirmModal.classList.add('show');
                confirmModal.style.display = 'block';
                document.body.classList.add('modal-open');
                
                // Add backdrop
                const backdrop = document.createElement('div');
                backdrop.className = 'modal-backdrop fade show';
                document.body.appendChild(backdrop);
                
                // Close and confirm buttons
                const closeButtons = confirmModal.querySelectorAll('[data-bs-dismiss="modal"]');
                const confirmButton = confirmModal.querySelector('.confirm-remove');
                
                const cleanupModal = () => {
                    confirmModal.classList.remove('show');
                    confirmModal.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    backdrop.remove();
                    confirmModal.remove();
                };
                
                closeButtons.forEach(btn => btn.addEventListener('click', cleanupModal));
                
                confirmButton.addEventListener('click', () => {
                    // Actual removal logic
                    const targetId = removeButton.dataset.targetId;
                    const targetElement = document.getElementById(targetId);
                    
                    if (targetElement) {
                        // Optional: Add smooth removal animation
                        targetElement.style.transition = 'opacity 0.3s, transform 0.3s';
                        targetElement.style.opacity = '0';
                        targetElement.style.transform = 'scale(0.9)';
                        
                        setTimeout(() => {
                            targetElement.remove();
                        }, 300);
                    }
                    
                    cleanupModal();
                });
            }
        });
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    window.timestampHandler = new TimestampHandler();
});