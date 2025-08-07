/**
 * Advanced Form Validation with Real-time Feedback
 * Provides comprehensive validation for TruckOpti forms
 */

class FormValidator {
    constructor(formId, options = {}) {
        this.form = document.getElementById(formId);
        this.options = {
            realTime: true,
            showTooltips: true,
            highlightErrors: true,
            autoSave: false,
            debounceMs: 500,
            ...options
        };
        
        this.validationRules = {};
        this.validationMessages = {};
        this.debounceTimers = {};
        this.isValid = false;
        
        if (this.form) {
            this.init();
        }
    }
    
    init() {
        this.addValidationStyles();
        this.bindEvents();
        this.createProgressIndicator();
        
        if (this.options.autoSave) {
            this.enableAutoSave();
        }
    }
    
    addValidationStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .form-field-container {
                position: relative;
                margin-bottom: 1.5rem;
            }
            
            .validation-feedback {
                display: none;
                width: 100%;
                margin-top: 0.25rem;
                font-size: 0.875em;
                border-radius: 0.25rem;
                padding: 0.5rem;
            }
            
            .validation-feedback.valid {
                display: block;
                color: #155724;
                background-color: #d4edda;
                border: 1px solid #c3e6cb;
            }
            
            .validation-feedback.invalid {
                display: block;
                color: #721c24;
                background-color: #f8d7da;
                border: 1px solid #f5c6cb;
            }
            
            .form-control.is-valid {
                border-color: #28a745;
                padding-right: calc(1.5em + 0.75rem);
                background-image: url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><path fill="#28a745" d="m2.3 6.73.5-.49.5.5L6.23 3.8l-.5-.49L3.8 5.24 2.3 3.77l-.5.5z"/></svg>')}");
                background-repeat: no-repeat;
                background-position: right calc(0.375em + 0.1875rem) center;
                background-size: calc(0.75em + 0.375rem) calc(0.75em + 0.375rem);
            }
            
            .form-control.is-invalid {
                border-color: #dc3545;
                padding-right: calc(1.5em + 0.75rem);
                background-image: url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="#dc3545" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5"/><path d="m5.5 5.5 1 1m0 0 1 1m-1-1 1-1m-1 1-1 1"/></svg>')}");
                background-repeat: no-repeat;
                background-position: right calc(0.375em + 0.1875rem) center;
                background-size: calc(0.75em + 0.375rem) calc(0.75em + 0.375rem);
            }
            
            .form-progress {
                width: 100%;
                height: 4px;
                background-color: #e9ecef;
                border-radius: 2px;
                overflow: hidden;
                margin-bottom: 1rem;
            }
            
            .form-progress-bar {
                height: 100%;
                background-color: #007bff;
                transition: width 0.3s ease;
                border-radius: 2px;
            }
            
            .validation-tooltip {
                position: absolute;
                top: 100%;
                left: 0;
                z-index: 1000;
                max-width: 200px;
                padding: 0.5rem;
                margin-top: 0.25rem;
                font-size: 0.75rem;
                background-color: #333;
                color: white;
                border-radius: 0.25rem;
                opacity: 0;
                transform: translateY(-10px);
                transition: opacity 0.3s, transform 0.3s;
                pointer-events: none;
            }
            
            .validation-tooltip.show {
                opacity: 1;
                transform: translateY(0);
            }
            
            .validation-tooltip::before {
                content: '';
                position: absolute;
                top: -5px;
                left: 10px;
                width: 0;
                height: 0;
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-bottom: 5px solid #333;
            }
            
            .field-requirements {
                font-size: 0.75rem;
                color: #6c757d;
                margin-top: 0.25rem;
            }
            
            .strength-meter {
                height: 5px;
                background-color: #e9ecef;
                border-radius: 2px;
                margin-top: 0.25rem;
                overflow: hidden;
            }
            
            .strength-meter-fill {
                height: 100%;
                border-radius: 2px;
                transition: width 0.3s ease, background-color 0.3s ease;
            }
            
            .auto-save-indicator {
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: #28a745;
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 0.25rem;
                font-size: 0.875rem;
                opacity: 0;
                transform: translateX(100%);
                transition: opacity 0.3s, transform 0.3s;
                z-index: 1000;
            }
            
            .auto-save-indicator.show {
                opacity: 1;
                transform: translateX(0);
            }
        `;
        document.head.appendChild(style);
    }
    
    bindEvents() {
        const inputs = this.form.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            // Wrap input in container if not already wrapped
            if (!input.closest('.form-field-container')) {
                this.wrapInput(input);
            }
            
            if (this.options.realTime) {
                input.addEventListener('input', (e) => {
                    this.debounceValidation(e.target);
                });
                
                input.addEventListener('blur', (e) => {
                    this.validateField(e.target);
                });
            }
            
            input.addEventListener('focus', (e) => {
                this.showFieldHelp(e.target);
            });
        });
        
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.validateForm();
        });
    }
    
    wrapInput(input) {
        const wrapper = document.createElement('div');
        wrapper.className = 'form-field-container';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        
        // Create feedback element
        const feedback = document.createElement('div');
        feedback.className = 'validation-feedback';
        wrapper.appendChild(feedback);
        
        // Create tooltip if enabled
        if (this.options.showTooltips) {
            const tooltip = document.createElement('div');
            tooltip.className = 'validation-tooltip';
            wrapper.appendChild(tooltip);
        }
    }
    
    debounceValidation(field) {
        const fieldName = field.name || field.id;
        
        if (this.debounceTimers[fieldName]) {
            clearTimeout(this.debounceTimers[fieldName]);
        }
        
        this.debounceTimers[fieldName] = setTimeout(() => {
            this.validateField(field);
        }, this.options.debounceMs);
    }
    
    addRule(fieldName, rule, message) {
        if (!this.validationRules[fieldName]) {
            this.validationRules[fieldName] = [];
        }
        
        this.validationRules[fieldName].push(rule);
        
        if (!this.validationMessages[fieldName]) {
            this.validationMessages[fieldName] = [];
        }
        
        this.validationMessages[fieldName].push(message);
        
        return this; // For chaining
    }
    
    validateField(field) {
        const fieldName = field.name || field.id;
        const rules = this.validationRules[fieldName] || [];
        const messages = this.validationMessages[fieldName] || [];
        const value = field.value.trim();
        
        let isValid = true;
        let errorMessages = [];
        
        // Check each rule
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            const message = messages[i] || 'Validation failed';
            
            if (typeof rule === 'function') {
                const result = rule(value, field);
                if (result !== true) {
                    isValid = false;
                    errorMessages.push(typeof result === 'string' ? result : message);
                }
            } else if (rule instanceof RegExp) {
                if (!rule.test(value)) {
                    isValid = false;
                    errorMessages.push(message);
                }
            }
        }
        
        this.updateFieldUI(field, isValid, errorMessages);
        this.updateProgress();
        
        return isValid;
    }
    
    updateFieldUI(field, isValid, errorMessages) {
        const container = field.closest('.form-field-container');
        const feedback = container.querySelector('.validation-feedback');
        const tooltip = container.querySelector('.validation-tooltip');
        
        // Remove previous classes
        field.classList.remove('is-valid', 'is-invalid');
        feedback.classList.remove('valid', 'invalid');
        
        if (field.value.trim() === '') {
            // Empty field - neutral state
            feedback.style.display = 'none';
            if (tooltip) tooltip.classList.remove('show');
            return;
        }
        
        if (isValid) {
            field.classList.add('is-valid');
            feedback.classList.add('valid');
            feedback.textContent = '✓ Valid';
            feedback.style.display = 'block';
            
            if (tooltip) {
                tooltip.classList.remove('show');
            }
        } else {
            field.classList.add('is-invalid');
            feedback.classList.add('invalid');
            feedback.innerHTML = errorMessages.map(msg => `• ${msg}`).join('<br>');
            feedback.style.display = 'block';
            
            if (tooltip && this.options.showTooltips) {
                tooltip.textContent = errorMessages[0];
                tooltip.classList.add('show');
            }
        }
        
        // Special handling for specific field types
        this.handleSpecialFields(field, isValid);
    }
    
    handleSpecialFields(field, isValid) {
        // Password strength meter
        if (field.type === 'password' && field.name === 'password') {
            this.updatePasswordStrength(field);
        }
        
        // Numeric field validation with min/max
        if (field.type === 'number' || field.dataset.type === 'numeric') {
            this.validateNumericField(field, isValid);
        }
        
        // Email field suggestions
        if (field.type === 'email') {
            this.suggestEmailDomain(field);
        }
    }
    
    updatePasswordStrength(field) {
        const password = field.value;
        let strength = 0;
        let strengthText = '';
        let strengthColor = '';
        
        // Calculate strength
        if (password.length >= 8) strength += 25;
        if (/[a-z]/.test(password)) strength += 25;
        if (/[A-Z]/.test(password)) strength += 25;
        if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) strength += 25;
        
        // Determine color and text
        if (strength < 50) {
            strengthColor = '#dc3545';
            strengthText = 'Weak';
        } else if (strength < 75) {
            strengthColor = '#ffc107';
            strengthText = 'Medium';
        } else {
            strengthColor = '#28a745';
            strengthText = 'Strong';
        }
        
        // Create or update strength meter
        const container = field.closest('.form-field-container');
        let strengthMeter = container.querySelector('.strength-meter');
        
        if (!strengthMeter && password.length > 0) {
            strengthMeter = document.createElement('div');
            strengthMeter.className = 'strength-meter';
            strengthMeter.innerHTML = `
                <div class="strength-meter-fill"></div>
                <small class="strength-text">${strengthText}</small>
            `;
            container.appendChild(strengthMeter);
        }
        
        if (strengthMeter) {
            const fill = strengthMeter.querySelector('.strength-meter-fill');
            const text = strengthMeter.querySelector('.strength-text');
            
            if (password.length === 0) {
                strengthMeter.style.display = 'none';
            } else {
                strengthMeter.style.display = 'block';
                fill.style.width = `${strength}%`;
                fill.style.backgroundColor = strengthColor;
                text.textContent = strengthText;
                text.style.color = strengthColor;
            }
        }
    }
    
    validateNumericField(field, isValid) {
        const value = parseFloat(field.value);
        const min = parseFloat(field.min);
        const max = parseFloat(field.max);
        
        if (!isNaN(min) && value < min) {
            this.updateFieldUI(field, false, [`Value must be at least ${min}`]);
        } else if (!isNaN(max) && value > max) {
            this.updateFieldUI(field, false, [`Value must be at most ${max}`]);
        }
    }
    
    suggestEmailDomain(field) {
        const email = field.value.trim();
        const commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
        
        if (email.includes('@') && !email.endsWith('.com')) {
            const domain = email.split('@')[1];
            const suggestion = commonDomains.find(d => d.startsWith(domain.charAt(0)));
            
            if (suggestion && domain !== suggestion) {
                const container = field.closest('.form-field-container');
                const tooltip = container.querySelector('.validation-tooltip');
                
                if (tooltip) {
                    tooltip.textContent = `Did you mean ${email.split('@')[0]}@${suggestion}?`;
                    tooltip.classList.add('show');
                    tooltip.style.cursor = 'pointer';
                    
                    tooltip.onclick = () => {
                        field.value = `${email.split('@')[0]}@${suggestion}`;
                        this.validateField(field);
                        tooltip.classList.remove('show');
                    };
                }
            }
        }
    }
    
    showFieldHelp(field) {
        const fieldName = field.name || field.id;
        const helpTexts = {
            'name': 'Enter a descriptive name (3-50 characters)',
            'length': 'Enter length in centimeters (1-1000)',
            'width': 'Enter width in centimeters (1-1000)',
            'height': 'Enter height in centimeters (1-1000)',
            'weight': 'Enter weight in kilograms (0.1-10000)',
            'max_weight': 'Maximum weight capacity in kilograms',
            'fuel_efficiency': 'Fuel efficiency in kilometers per liter',
            'cost_per_km': 'Operating cost per kilometer in currency',
            'email': 'Enter a valid email address',
            'phone': 'Enter phone number with country code'
        };
        
        const helpText = helpTexts[fieldName];
        if (helpText && this.options.showTooltips) {
            const container = field.closest('.form-field-container');
            const tooltip = container.querySelector('.validation-tooltip');
            
            if (tooltip) {
                tooltip.textContent = helpText;
                tooltip.classList.add('show');
                
                setTimeout(() => {
                    tooltip.classList.remove('show');
                }, 3000);
            }
        }
    }
    
    createProgressIndicator() {
        const progress = document.createElement('div');
        progress.className = 'form-progress';
        progress.innerHTML = '<div class="form-progress-bar"></div>';
        
        this.form.insertBefore(progress, this.form.firstChild);
        this.progressBar = progress.querySelector('.form-progress-bar');
    }
    
    updateProgress() {
        const inputs = this.form.querySelectorAll('input[required], select[required], textarea[required]');
        const validInputs = this.form.querySelectorAll('.is-valid[required]');
        
        const progress = (validInputs.length / inputs.length) * 100;
        this.progressBar.style.width = `${progress}%`;
        
        // Change color based on progress
        if (progress < 50) {
            this.progressBar.style.backgroundColor = '#dc3545';
        } else if (progress < 80) {
            this.progressBar.style.backgroundColor = '#ffc107';
        } else {
            this.progressBar.style.backgroundColor = '#28a745';
        }
    }
    
    validateForm() {
        const inputs = this.form.querySelectorAll('input, select, textarea');
        let allValid = true;
        
        inputs.forEach(input => {
            if (!this.validateField(input)) {
                allValid = false;
            }
        });
        
        this.isValid = allValid;
        
        if (allValid) {
            this.onValidSubmit();
        } else {
            this.onInvalidSubmit();
        }
        
        return allValid;
    }
    
    onValidSubmit() {
        // Override in implementation
        console.log('Form is valid - submitting...');
        this.form.submit();
    }
    
    onInvalidSubmit() {
        // Focus on first invalid field
        const firstInvalid = this.form.querySelector('.is-invalid');
        if (firstInvalid) {
            firstInvalid.focus();
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Show error summary
        this.showErrorSummary();
    }
    
    showErrorSummary() {
        const invalidFields = this.form.querySelectorAll('.is-invalid');
        const errors = Array.from(invalidFields).map(field => {
            const label = this.form.querySelector(`label[for="${field.id}"]`);
            const fieldName = label ? label.textContent : field.name || field.id;
            return `• ${fieldName}`;
        });
        
        if (errors.length > 0) {
            const alert = document.createElement('div');
            alert.className = 'alert alert-danger';
            alert.innerHTML = `
                <strong>Please fix the following errors:</strong><br>
                ${errors.join('<br>')}
            `;
            
            this.form.insertBefore(alert, this.form.firstChild);
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                alert.remove();
            }, 5000);
        }
    }
    
    enableAutoSave() {
        let autoSaveTimer;
        const indicator = document.createElement('div');
        indicator.className = 'auto-save-indicator';
        indicator.textContent = '✓ Auto-saved';
        document.body.appendChild(indicator);
        
        const inputs = this.form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                clearTimeout(autoSaveTimer);
                
                autoSaveTimer = setTimeout(() => {
                    this.autoSave();
                    this.showAutoSaveIndicator(indicator);
                }, 2000);
            });
        });
    }
    
    autoSave() {
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData.entries());
        
        // Save to localStorage
        localStorage.setItem(`autosave_${this.form.id}`, JSON.stringify({
            data: data,
            timestamp: new Date().toISOString()
        }));
        
        console.log('Form auto-saved', data);
    }
    
    showAutoSaveIndicator(indicator) {
        indicator.classList.add('show');
        
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    }
    
    loadAutoSavedData() {
        const saved = localStorage.getItem(`autosave_${this.form.id}`);
        if (saved) {
            const { data, timestamp } = JSON.parse(saved);
            const saveDate = new Date(timestamp);
            const now = new Date();
            
            // Only restore if saved within last 24 hours
            if ((now - saveDate) < 24 * 60 * 60 * 1000) {
                Object.keys(data).forEach(key => {
                    const field = this.form.querySelector(`[name="${key}"]`);
                    if (field) {
                        field.value = data[key];
                    }
                });
                
                console.log('Auto-saved data restored from', timestamp);
            }
        }
    }
}

// Validation rule helpers
const ValidationRules = {
    required: (value) => value.length > 0 || 'This field is required',
    
    minLength: (min) => (value) => 
        value.length >= min || `Minimum length is ${min} characters`,
    
    maxLength: (max) => (value) => 
        value.length <= max || `Maximum length is ${max} characters`,
    
    email: (value) => 
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || 'Please enter a valid email address',
    
    numeric: (value) => 
        !isNaN(value) && !isNaN(parseFloat(value)) || 'Please enter a valid number',
    
    positive: (value) => 
        parseFloat(value) > 0 || 'Value must be positive',
    
    range: (min, max) => (value) => {
        const num = parseFloat(value);
        return (num >= min && num <= max) || `Value must be between ${min} and ${max}`;
    },
    
    phone: (value) => 
        /^[\+]?[1-9][\d]{0,15}$/.test(value.replace(/[\s\-\(\)]/g, '')) || 'Please enter a valid phone number',
    
    url: (value) => 
        /^https?:\/\/.+/.test(value) || 'Please enter a valid URL',
    
    strongPassword: (value) => {
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (!/[a-z]/.test(value)) return 'Password must contain lowercase letters';
        if (!/[A-Z]/.test(value)) return 'Password must contain uppercase letters';
        if (!/[0-9]/.test(value)) return 'Password must contain numbers';
        return true;
    }
};

// Export for global use
window.FormValidator = FormValidator;
window.ValidationRules = ValidationRules;