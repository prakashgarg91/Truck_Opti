// Bulk Upload Functionality for Truck Recommendations

// Global variable to track row count - only if not already defined
if (typeof window.rowCount === 'undefined') {
    window.rowCount = 1;
}

// Progress loading system
function showProgressWithSteps(title, steps, description = '') {
    // Create progress modal if it doesn't exist
    let progressModal = document.getElementById('progressModal');
    if (!progressModal) {
        progressModal = document.createElement('div');
        progressModal.className = 'modal fade';
        progressModal.id = 'progressModal';
        progressModal.setAttribute('data-bs-backdrop', 'static');
        progressModal.setAttribute('data-bs-keyboard', 'false');
        progressModal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title" id="progressTitle">
                            <i class="bi bi-gear-fill spin"></i> Processing...
                        </h5>
                    </div>
                    <div class="modal-body">
                        <div id="algorithmInfo" class="alert alert-info mb-3" style="display: none;">
                            <div class="d-flex align-items-center">
                                <i class="bi bi-cpu me-2"></i>
                                <div>
                                    <strong>Algorithm:</strong> <span id="algorithmName"></span><br>
                                    <small id="algorithmDescription"></small>
                                </div>
                            </div>
                        </div>
                        <div class="progress mb-3" style="height: 25px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" 
                                 role="progressbar" id="progressBar" style="width: 0%">
                                0%
                            </div>
                        </div>
                        <div id="progressSteps">
                            <!-- Steps will be populated here -->
                        </div>
                        <div class="text-center mt-3">
                            <small class="text-muted" id="progressMessage">Initializing...</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(progressModal);
        
        // Add CSS for spinning icon
        if (!document.getElementById('progressSpinCSS')) {
            const style = document.createElement('style');
            style.id = 'progressSpinCSS';
            style.textContent = `
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Set title
    document.getElementById('progressTitle').innerHTML = `<i class="bi bi-gear-fill spin"></i> ${title}`;
    
    // Show algorithm information if description provided
    if (description) {
        const algorithmInfo = document.getElementById('algorithmInfo');
        const algorithmName = document.getElementById('algorithmName');
        const algorithmDescription = document.getElementById('algorithmDescription');
        
        algorithmName.textContent = title.replace('🔬 ', '');
        algorithmDescription.textContent = description;
        algorithmInfo.style.display = 'block';
    }
    
    // Clear and populate steps
    const stepsContainer = document.getElementById('progressSteps');
    stepsContainer.innerHTML = '';
    
    steps.forEach((step, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step-item d-flex align-items-center mb-2';
        stepDiv.innerHTML = `
            <div class="step-icon me-3">
                <i class="bi bi-hourglass-split text-muted" id="step-icon-${index}"></i>
            </div>
            <div class="step-text">
                <small class="text-muted" id="step-text-${index}">${step}</small>
            </div>
        `;
        stepsContainer.appendChild(stepDiv);
    });
    
    // Show modal
    const modal = new bootstrap.Modal(progressModal);
    modal.show();
    
    // Simulate progress
    simulateProgress(steps);
    
    return modal;
}

function simulateProgress(steps) {
    const progressBar = document.getElementById('progressBar');
    const progressMessage = document.getElementById('progressMessage');
    
    let currentStep = 0;
    const totalSteps = steps.length;
    const stepDuration = 300; // milliseconds per step (faster for 7 steps)
    
    function updateStep() {
        if (currentStep < totalSteps) {
            // Update previous step to completed
            if (currentStep > 0) {
                const prevIcon = document.getElementById(`step-icon-${currentStep - 1}`);
                const prevText = document.getElementById(`step-text-${currentStep - 1}`);
                if (prevIcon) prevIcon.className = 'bi bi-check-circle-fill text-success';
                if (prevText) prevText.className = 'text-success';
            }
            
            // Update current step to in progress
            const currentIcon = document.getElementById(`step-icon-${currentStep}`);
            const currentText = document.getElementById(`step-text-${currentStep}`);
            if (currentIcon) currentIcon.className = 'bi bi-hourglass-split text-primary';
            if (currentText) currentText.className = 'text-primary';
            
            // Update progress bar
            const progress = ((currentStep + 1) / totalSteps) * 100;
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            progressBar.textContent = `${Math.round(progress)}%`;
            
            // Update message
            progressMessage.textContent = steps[currentStep];
            
            currentStep++;
            
            // Continue to next step
            setTimeout(updateStep, stepDuration);
        } else {
            // Complete final step
            const lastIcon = document.getElementById(`step-icon-${totalSteps - 1}`);
            const lastText = document.getElementById(`step-text-${totalSteps - 1}`);
            if (lastIcon) lastIcon.className = 'bi bi-check-circle-fill text-success';
            if (lastText) lastText.className = 'text-success';
            
            // Finalize progress
            progressBar.style.width = '100%';
            progressBar.setAttribute('aria-valuenow', 100);
            progressBar.textContent = '100%';
            progressMessage.textContent = 'Processing complete!';
            
            // Close modal after a short delay
            setTimeout(() => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('progressModal'));
                if (modal) modal.hide();
            }, 1000);
        }
    }
    
    // Start the progress simulation
    setTimeout(updateStep, 300);
}

// Show Bulk Upload Modal
function showBulkUpload() {
    const modal = new bootstrap.Modal(document.getElementById('bulkUploadModal'));
    modal.show();
}

// Download Sample CSV
function downloadSampleCSV() {
    const sampleData = `carton_name,quantity,value
Small Box,10,500
Medium Box,5,800
Large Box,3,1200
Heavy Box,2,2000`;
    
    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'bulk_cartons_sample.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Preview CSV File
function previewCSV() {
    const fileInput = document.getElementById('bulkFileInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
        alert('Please select a valid CSV file.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const csv = e.target.result;
        const lines = csv.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
            alert('CSV file must contain at least a header row and one data row.');
            return;
        }
        
        // Parse CSV headers
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const headerRow = document.getElementById('previewHeaders');
        headerRow.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
        
        // Parse CSV data (show max 10 rows for preview)
        const tbody = document.getElementById('previewBody');
        tbody.innerHTML = '';
        
        for (let i = 1; i < Math.min(lines.length, 11); i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const row = document.createElement('tr');
            row.innerHTML = values.map(v => `<td>${v}</td>`).join('');
            tbody.appendChild(row);
        }
        
        if (lines.length > 11) {
            const moreRow = document.createElement('tr');
            moreRow.innerHTML = `<td colspan="${headers.length}" class="text-center text-muted"><em>... and ${lines.length - 11} more rows</em></td>`;
            tbody.appendChild(moreRow);
        }
        
        // Validate required columns
        const requiredColumns = ['carton_name', 'quantity'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));
        
        if (missingColumns.length > 0) {
            const alert = document.createElement('div');
            alert.className = 'alert alert-danger mt-2';
            alert.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Missing required columns: ${missingColumns.join(', ')}`;
            document.getElementById('csvPreview').appendChild(alert);
        }
        
        document.getElementById('csvPreview').style.display = 'block';
    };
    
    reader.readAsText(file);
}

// Process Bulk Upload
function processBulkUpload() {
    const fileInput = document.getElementById('bulkFileInput');
    const file = fileInput.files[0];
    const progressBar = document.getElementById('fileUploadProgress');
    const progressContainer = document.getElementById('uploadProgressContainer');
    
    // Reset progress
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
    progressBar.textContent = '0%';
    
    if (!file) {
        showUploadError('Please select a file first.');
        return;
    }
    
    // Support multiple file types
    const supportedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!supportedTypes.includes(file.type) && 
        !file.name.toLowerCase().match(/\.(csv|xlsx?)$/)) {
        showUploadError('Invalid file type. Please upload CSV or Excel files.');
        return;
    }
    
    const reader = new FileReader();
    reader.onloadstart = function() {
        progressBar.style.width = '10%';
        progressBar.setAttribute('aria-valuenow', '10');
        progressBar.textContent = '10%';
    };
    
    reader.onprogress = function(event) {
        if (event.lengthComputable) {
            const percentLoaded = Math.round((event.loaded / event.total) * 90) + 10;
            progressBar.style.width = `${percentLoaded}%`;
            progressBar.setAttribute('aria-valuenow', percentLoaded);
            progressBar.textContent = `${percentLoaded}%`;
        }
    };
    
    reader.onload = function(e) {
        // Simulate processing time
        setTimeout(() => processCSV(e.target.result), 500);
    };
    
    reader.onerror = function() {
        showUploadError('Error reading file. Please try again.');
    };
    
    reader.readAsText(file);
}

function processCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
        showUploadError('CSV must contain at least a header and one data row.');
        return;
    }
    
    // Parse headers and find column indices
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const cartonNameIndex = headers.indexOf('carton_name');
    const quantityIndex = headers.indexOf('quantity');
    const valueIndex = headers.indexOf('value');
    
    if (cartonNameIndex === -1 || quantityIndex === -1) {
        showUploadError('CSV must contain carton_name and quantity columns.');
        return;
    }
    
    // Clear existing rows (keep first row)
    const cartonRows = document.getElementById('cartonRows');
    const firstRow = cartonRows.querySelector('.carton-row');
    cartonRows.innerHTML = '';
    cartonRows.appendChild(firstRow);
    rowCount = 1;
    
    // Get available carton options from the first select
    const firstSelect = firstRow.querySelector('select');
    const availableCartons = Array.from(firstSelect.options).map(option => ({
        value: option.value,
        text: option.textContent,
        name: option.textContent.split('(')[0].trim()
    }));
    
    // Process CSV data
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        
        if (values.length < Math.max(cartonNameIndex, quantityIndex) + 1) continue;
        
        const cartonName = values[cartonNameIndex];
        const quantity = parseInt(values[quantityIndex]);
        const value = valueIndex >= 0 && values[valueIndex] ? parseFloat(values[valueIndex]) : '';
        
        // Find matching carton in available options
        const matchingCarton = availableCartons.find(c => 
            c.name.toLowerCase() === cartonName.toLowerCase() || 
            c.text.toLowerCase().includes(cartonName.toLowerCase())
        );
        
        if (!matchingCarton || !matchingCarton.value) {
            errorCount++;
            errors.push(`Row ${i + 1}: Carton "${cartonName}" not found in system`);
            continue;
        }
        
        if (isNaN(quantity) || quantity <= 0) {
            errorCount++;
            errors.push(`Row ${i + 1}: Invalid quantity "${values[quantityIndex]}"`);
            continue;
        }
        
        // Create new row or use first row
        let targetRow;
        if (successCount === 0) {
            targetRow = firstRow;
        } else {
            rowCount++;
            targetRow = document.createElement('div');
            targetRow.className = 'row mb-2 carton-row align-items-end';
            targetRow.innerHTML = firstRow.innerHTML
                .replace(/carton_type_1/g, `carton_type_${rowCount}`)
                .replace(/carton_qty_1/g, `carton_qty_${rowCount}`)
                .replace(/carton_value_1/g, `carton_value_${rowCount}`);
            cartonRows.appendChild(targetRow);
        }
        
        // Set values
        const selectElement = targetRow.querySelector('select');
        const qtyInput = targetRow.querySelector('input[type="number"]:first-of-type');
        const valueInput = targetRow.querySelector('input[type="number"]:last-of-type');
        
        selectElement.value = matchingCarton.value;
        qtyInput.value = quantity;
        if (valueInput && value) {
            valueInput.value = value;
        }
        
        successCount++;
    }
    
    // Update remove buttons
    updateRemoveButtons();
    
    // Show detailed upload results with professional modal
    showUploadResults(successCount, errorCount, errors);
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('bulkUploadModal'));
    modal.hide();
}

function showUploadError(message) {
    const errorModal = new bootstrap.Modal(document.getElementById('uploadErrorModal'));
    document.getElementById('uploadErrorMessage').textContent = message;
    errorModal.show();
}

function showUploadResults(successCount, errorCount, errors) {
    const resultsModal = new bootstrap.Modal(document.getElementById('uploadResultsModal'));
    const successSpan = document.getElementById('successCount');
    const errorSpan = document.getElementById('errorCount');
    const errorList = document.getElementById('errorList');
    
    successSpan.textContent = successCount;
    errorSpan.textContent = errorCount;
    
    errorList.innerHTML = '';
    if (errors.length > 0) {
        errors.slice(0, 10).forEach(error => {
            const li = document.createElement('li');
            li.textContent = error;
            errorList.appendChild(li);
        });
        
        if (errors.length > 10) {
            const moreSpan = document.createElement('span');
            moreSpan.textContent = `... and ${errors.length - 10} more errors`;
            moreSpan.className = 'text-muted';
            errorList.appendChild(moreSpan);
        }
    }
    
    resultsModal.show();
}

// Clear CSV Preview
function clearCSVPreview() {
    document.getElementById('csvPreview').style.display = 'none';
    document.getElementById('bulkFileInput').value = '';
    // Remove any error alerts
    const alerts = document.getElementById('csvPreview').querySelectorAll('.alert-danger');
    alerts.forEach(alert => alert.remove());
}

// Update algorithm preview function
function updateAlgorithmPreview(e) {
    const algorithmPreview = document.getElementById('algorithmPreview');
    if (!algorithmPreview) return;
    
    const selectedValue = e.target.value;
    let previewHtml = '';
    
    switch(selectedValue) {
        case 'space_utilization':
            previewHtml = `
                <div class="algorithm-preview bg-light p-2 rounded">
                    <i class="bi bi-boxes text-primary"></i> <strong>LAFF Algorithm (Largest Area/Volume First)</strong><br>
                    <small class="text-muted">• 3D bin packing without carton reshaping<br>
                    • Prioritizes largest items first for optimal fit<br>
                    • Minimizes unused truck space and air gaps</small>
                </div>`;
            break;
        case 'cost_saving':
            previewHtml = `
                <div class="algorithm-preview bg-light p-2 rounded">
                    <i class="bi bi-calculator text-success"></i> <strong>Cost-Optimized Multi-Constraint Algorithm</strong><br>
                    <small class="text-muted">• 3D fitting with fuel efficiency optimization<br>
                    • Balances truck utilization vs transportation costs<br>
                    • Route distance and load factor optimization</small>
                </div>`;
            break;
        case 'value_protected':
            previewHtml = `
                <div class="algorithm-preview bg-light p-2 rounded">
                    <i class="bi bi-shield-check text-warning"></i> <strong>Value-Protected 3D Packing Algorithm</strong><br>
                    <small class="text-muted">• Secure 3D placement for high-value items<br>
                    • Optimal 70-85% utilization for cargo protection<br>
                    • Minimizes handling and movement risk</small>
                </div>`;
            break;
        default:
            previewHtml = `
                <div class="algorithm-preview bg-light p-2 rounded">
                    <i class="bi bi-gear text-info"></i> <strong>Balanced MCDA (Multi-Criteria Decision Analysis)</strong><br>
                    <small class="text-muted">• 3D fitting with weighted criteria optimization<br>
                    • Balances space efficiency, cost, and operations<br>
                    • Considers loading ease and truck suitability</small>
                </div>`;
    }
    
    algorithmPreview.innerHTML = previewHtml;
}

// Handle form submission with loading screen - FIXED FOR STACK OVERFLOW
function handleFormSubmission(e) {
    // Prevent default submission
    e.preventDefault();
    
    console.log('Form submission intercepted - showing loading screen');
    
    // CRITICAL FIX: Check if we're already processing to prevent infinite recursion
    if (window.isFormSubmitting) {
        console.log('Form already being processed, ignoring duplicate submission');
        return false;
    }
    
    // Set flag to prevent duplicate submissions
    window.isFormSubmitting = true;
    
    // Get selected optimization goal
    const optimizationGoal = document.querySelector('select[name="optimization_goal"]').value;
    
    let algorithmName = '';
    let algorithmDescription = '';
    
    switch(optimizationGoal) {
        case 'space_utilization':
            algorithmName = 'LAFF (Largest Area Fit First) Algorithm';
            algorithmDescription = 'Advanced 3D packing with space optimization priority';
            break;
        case 'cost_saving':
            algorithmName = 'Cost-Optimized Multi-Truck Algorithm';
            algorithmDescription = 'Multi-objective optimization for cost efficiency';
            break;
        case 'value_protected':
            algorithmName = 'Value-Protected Packing Algorithm';
            algorithmDescription = 'High-value cargo protection with secure placement';
            break;
        default:
            algorithmName = 'Advanced Multi-Criteria Algorithm V2';
            algorithmDescription = 'State-of-the-art 3D optimization with stability validation';
    }
    
    const steps = [
        'Validating carton dimensions and constraints...',
        'Loading truck specifications from database...',
        `Initializing ${algorithmName}...`,
        'Running advanced 3D packing simulations...',
        'Calculating space utilization and stability metrics...',
        'Performing cost analysis and ranking...',
        'Generating final recommendations...'
    ];
    
    // Show progress modal
    console.log('Showing progress modal with algorithm:', algorithmName);
    showProgressWithSteps(`🔬 ${algorithmName}`, steps, algorithmDescription);
    
    // Submit form after showing progress - FIXED APPROACH
    setTimeout(() => {
        console.log('Submitting form after progress display');
        
        // Create a new form submission WITHOUT event handlers to prevent recursion
        const form = e.target;
        const formData = new FormData(form);
        
        // Submit via fetch to avoid event listener conflicts
        fetch(form.action, {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        })
        .then(html => {
            // Parse the response and redirect to results
            console.log('Form submission successful, redirecting to results');
            
            // Hide progress modal first
            const modal = bootstrap.Modal.getInstance(document.getElementById('progressModal'));
            if (modal) modal.hide();
            
            // Instead of replacing HTML, redirect to the results page
            // The server should return a redirect response or JSON with redirect URL
            if (html.includes('recommendations')) {
                // If HTML contains recommendations, we can update specific sections
                window.location.reload();
            } else {
                // Otherwise reload the page to show results
                window.location.reload();
            }
        })
        .catch(error => {
            console.error('Form submission failed:', error);
            alert('Recommendation generation failed. Please try again.');
        })
        .finally(() => {
            // Reset flag regardless of success/failure
            window.isFormSubmitting = false;
            
            // Hide progress modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('progressModal'));
            if (modal) modal.hide();
        });
        
    }, 3500); // Reduced time for better UX
}

// Add Carton functionality
function addCartonRow() {
    console.log('Adding new carton row');
    window.rowCount++;
    
    // Get the first row to clone structure
    const firstRow = document.querySelector('.carton-row');
    if (!firstRow) {
        console.error('No existing carton row found to clone');
        return;
    }
    
    const row = document.createElement('div');
    row.className = 'row mb-2 carton-row align-items-end';
    
    // Get carton options from first select
    const firstSelect = firstRow.querySelector('select');
    let cartonOptions = '';
    if (firstSelect) {
        cartonOptions = firstSelect.innerHTML;
    }
    
    row.innerHTML = `
        <div class="col-md-5">
            <select name="carton_type_${window.rowCount}" class="form-select carton-type-select" required>
                ${cartonOptions}
            </select>
        </div>
        <div class="col-md-2">
            <input type="number" name="carton_qty_${window.rowCount}" class="form-control" min="1" placeholder="Quantity" required>
        </div>
        <div class="col-md-3">
            <input type="number" name="carton_value_${window.rowCount}" class="form-control" min="0" step="0.01" placeholder="Per unit value">
        </div>
        <div class="col-md-2">
            <button type="button" class="btn btn-danger btn-sm remove-row">
                <i class="bi bi-trash"></i> Remove
            </button>
        </div>
    `;
    
    document.getElementById('cartonRows').appendChild(row);
    updateRemoveButtons();
    console.log('Carton row added successfully');
}

// Update remove buttons functionality
function updateRemoveButtons() {
    const rows = document.querySelectorAll('.carton-row');
    rows.forEach((row, idx) => {
        const btn = row.querySelector('.remove-row');
        if (btn) {
            btn.style.display = rows.length > 1 ? '' : 'none';
            btn.onclick = function() {
                row.remove();
                updateRemoveButtons();
                console.log('Carton row removed');
            };
        }
    });
}

// Auto-populate value field when carton type is selected
function handleCartonTypeChange(e) {
    if (e.target.classList.contains('carton-type-select')) {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const cartonValue = selectedOption.getAttribute('data-value') || '';
        
        // Find the corresponding value input field
        const rowIndex = e.target.name.split('_')[2] || '1';
        const valueInput = document.querySelector(`input[name="carton_value_${rowIndex}"]`);
        
        if (valueInput && cartonValue) {
            valueInput.value = cartonValue;
            console.log(`Auto-populated value ${cartonValue} for row ${rowIndex}`);
        }
    }
}

// Make functions globally available
window.showBulkUpload = showBulkUpload;
window.downloadSampleCSV = downloadSampleCSV;
window.previewCSV = previewCSV;
window.processBulkUpload = processBulkUpload;
window.clearCSVPreview = clearCSVPreview;

// CRITICAL FIX: Clean event listener initialization to prevent conflicts
function initializePage() {
    console.log('Initializing page with clean event handlers');
    
    // Clear any existing flags
    window.isFormSubmitting = false;
    window.isInitialized = false;
    
    // Remove existing listeners to prevent stacking
    document.removeEventListener('change', handleCartonTypeChange);
    
    // Initialize Add Carton button with conflict prevention
    const addRowButton = document.getElementById('addRow');
    if (addRowButton) {
        console.log('Setting up Add Carton button');
        // Remove existing listeners
        const clonedButton = addRowButton.cloneNode(true);
        addRowButton.parentNode.replaceChild(clonedButton, addRowButton);
        // Add single listener
        clonedButton.addEventListener('click', addCartonRow);
    } else {
        console.warn('addRow button not found');
    }
    
    // Set up carton type change handler (single listener)
    document.addEventListener('change', handleCartonTypeChange);
    
    // Initialize remove buttons for existing rows
    updateRemoveButtons();
    
    // Bulk upload button with conflict prevention
    const bulkUploadButton = document.querySelector('button[onclick="showBulkUpload()"]');
    if (bulkUploadButton) {
        console.log('Setting up Bulk Upload button');
        // Remove existing onclick to prevent conflicts
        bulkUploadButton.removeAttribute('onclick');
        // Clone to remove all listeners
        const clonedBulkButton = bulkUploadButton.cloneNode(true);
        bulkUploadButton.parentNode.replaceChild(clonedBulkButton, bulkUploadButton);
        // Add single listener
        clonedBulkButton.addEventListener('click', showBulkUpload);
    }
    
    // Algorithm preview updater with conflict prevention
    const optimizationSelect = document.querySelector('select[name="optimization_goal"]');
    if (optimizationSelect) {
        console.log('Setting up algorithm preview updater');
        // Clone to remove existing listeners
        const clonedSelect = optimizationSelect.cloneNode(true);
        optimizationSelect.parentNode.replaceChild(clonedSelect, optimizationSelect);
        // Add single listener
        clonedSelect.addEventListener('change', updateAlgorithmPreview);
        // Trigger initial update
        updateAlgorithmPreview({ target: clonedSelect });
    } else {
        console.warn('optimization select element not found');
    }
    
    // Form submission handler with conflict prevention
    const cartonForm = document.getElementById('cartonForm');
    if (cartonForm) {
        console.log('Setting up form submission handler');
        // Remove existing listeners by cloning
        const clonedForm = cartonForm.cloneNode(true);
        cartonForm.parentNode.replaceChild(clonedForm, cartonForm);
        // Add single listener
        clonedForm.addEventListener('submit', handleFormSubmission);
    } else {
        console.warn('cartonForm element not found');
    }
    
    // Mark as initialized
    window.isInitialized = true;
    console.log('Page initialization completed successfully');
}

// Ensure DOM is ready before attaching listeners - FIXED APPROACH
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
} else {
    // DOM already loaded
    initializePage();
}

// ENHANCED: Professional progress modal with steps animation
function showProgressWithSteps(algorithmTitle, steps, description) {
    console.log('[DEBUG] Showing progress modal:', algorithmTitle);
    
    // Update modal content
    document.getElementById('progressTitle').textContent = algorithmTitle;
    document.getElementById('algorithmName').textContent = algorithmTitle;
    document.getElementById('algorithmDescription').textContent = description;
    
    // Reset progress
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    
    // Reset all steps
    for (let i = 1; i <= 6; i++) {
        const stepIcon = document.getElementById(`step${i}-icon`);
        if (stepIcon) {
            stepIcon.className = 'bi bi-circle text-secondary me-2';
        }
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('progressModal'), {
        backdrop: 'static',
        keyboard: false
    });
    modal.show();
    
    // Animate progress through steps
    animateProgressSteps(steps);
}

function animateProgressSteps(steps) {
    let currentStep = 0;
    const totalSteps = Math.min(steps.length, 6);
    const progressIncrement = 100 / totalSteps;
    
    function updateStep() {
        if (currentStep >= totalSteps) {
            return;
        }
        
        // Update current step text
        const stepText = steps[currentStep] || `Step ${currentStep + 1}`;
        document.getElementById('currentStep').textContent = stepText;
        document.getElementById('stepDescription').textContent = `Processing: ${stepText.toLowerCase()}`;
        
        // Update progress bar
        const progressPercent = Math.round((currentStep + 1) * progressIncrement);
        const progressBar = document.getElementById('progressBar');
        const progressPercentSpan = document.getElementById('progressPercent');
        
        progressBar.style.width = progressPercent + '%';
        progressPercentSpan.textContent = progressPercent + '%';
        
        // Update step icon
        const stepNumber = currentStep + 1;
        const stepIcon = document.getElementById(`step${stepNumber}-icon`);
        if (stepIcon) {
            stepIcon.className = 'bi bi-check-circle-fill text-success me-2';
        }
        
        currentStep++;
        
        // Continue to next step
        if (currentStep < totalSteps) {
            setTimeout(updateStep, 800); // 800ms between steps
        }
    }
    
    // Start the animation
    setTimeout(updateStep, 500); // Initial delay
}

// Show loading modal (legacy support)
function showLoadingModal() {
    const modal = new bootstrap.Modal(document.getElementById('loadingModal'));
    modal.show();
}