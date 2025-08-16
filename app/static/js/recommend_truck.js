// Bulk Upload Functionality for Truck Recommendations

// Global variable to track row count
let rowCount = 1;

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

// Ensure DOM is ready before attaching listeners
document.addEventListener('DOMContentLoaded', function() {
    // Attach event listeners
    const bulkUploadButton = document.querySelector('button[onclick="showBulkUpload()"]');
    if (bulkUploadButton) {
        bulkUploadButton.addEventListener('click', showBulkUpload);
    }
});