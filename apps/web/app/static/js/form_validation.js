// Advanced Form Validation and Duplicate Prevention

document.addEventListener('DOMContentLoaded', () => {
    const preventDuplicates = (form, uniqueField) => {
        const seenValues = new Set();
        
        form.querySelectorAll(uniqueField).forEach(field => {
            field.addEventListener('input', function() {
                const currentValue = this.value.trim();
                
                if (seenValues.has(currentValue)) {
                    this.classList.add('is-duplicate');
                    const warningSpan = document.createElement('span');
                    warningSpan.classList.add('duplicate-warning');
                    warningSpan.textContent = 'This entry already exists';
                    this.parentNode.insertBefore(warningSpan, this.nextSibling);
                } else {
                    this.classList.remove('is-duplicate');
                    const warningSpan = this.nextSibling;
                    if (warningSpan && warningSpan.classList.contains('duplicate-warning')) {
                        warningSpan.remove();
                    }
                }
                
                seenValues.add(currentValue);
            });
        });
    };

    // Example Usage: Prevent Duplicate Cartons
    const cartonForm = document.querySelector('#carton-type-form');
    if (cartonForm) {
        preventDuplicates(cartonForm, '.carton-code-input');
    }

    // Example Usage: Prevent Duplicate Trucks
    const truckForm = document.querySelector('#truck-type-form');
    if (truckForm) {
        preventDuplicates(truckForm, '.truck-code-input');
    }

    // Enhanced Form Validation
    const validateForm = (form) => {
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            field.addEventListener('invalid', function() {
                this.classList.add('is-invalid');
                const feedbackElement = document.createElement('div');
                feedbackElement.classList.add('invalid-feedback');
                feedbackElement.textContent = this.validationMessage;
                this.parentNode.insertBefore(feedbackElement, this.nextSibling);
            });

            field.addEventListener('input', function() {
                if (this.validity.valid) {
                    this.classList.remove('is-invalid');
                    this.classList.add('is-valid');
                    const feedbackElement = this.nextSibling;
                    if (feedbackElement && feedbackElement.classList.contains('invalid-feedback')) {
                        feedbackElement.remove();
                    }
                } else {
                    this.classList.remove('is-valid');
                }
            });
        });
    };

    // Apply validation to all forms with class 'needs-validation'
    document.querySelectorAll('.needs-validation').forEach(validateForm);
});