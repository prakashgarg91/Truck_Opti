/**
 * TruckOpti Frontend Debug Logger
 * Comprehensive user interaction and frontend event tracking
 */

class TruckOptiFrontendDebugLogger {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.debugEnabled = true;
        this.logBuffer = [];
        this.maxBufferSize = 1000;
        
        // Initialize logging
        this.initializeLogging();
        this.logEvent('FRONTEND_DEBUG_LOGGER_INITIALIZED', {
            sessionId: this.sessionId,
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: new Date().toISOString()
        });
    }
    
    generateSessionId() {
        return `FRONTEND_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    initializeLogging() {
        // Override console methods to capture all logs
        const originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
        };
        
        console.log = (...args) => {
            this.logEvent('CONSOLE_LOG', { message: args.join(' ') });
            originalConsole.log(...args);
        };
        
        console.error = (...args) => {
            this.logEvent('CONSOLE_ERROR', { message: args.join(' ') });
            originalConsole.error(...args);
        };
        
        console.warn = (...args) => {
            this.logEvent('CONSOLE_WARN', { message: args.join(' ') });
            originalConsole.warn(...args);
        };
        
        // Capture all user interactions
        this.setupEventListeners();
        
        // Capture AJAX requests
        this.setupAjaxLogging();
        
        // Capture errors
        this.setupErrorLogging();
    }
    
    setupEventListeners() {
        // Track all clicks
        document.addEventListener('click', (event) => {
            this.logUserAction('CLICK', {
                element: event.target.tagName,
                id: event.target.id,
                className: event.target.className,
                text: event.target.textContent?.substring(0, 50),
                coordinates: { x: event.clientX, y: event.clientY }
            });
        });
        
        // Track form submissions
        document.addEventListener('submit', (event) => {
            const formData = new FormData(event.target);
            const formDataObj = {};
            for (let [key, value] of formData.entries()) {
                formDataObj[key] = value;
            }
            
            this.logUserAction('FORM_SUBMIT', {
                formId: event.target.id,
                formClass: event.target.className,
                formData: formDataObj,
                action: event.target.action,
                method: event.target.method
            });
        });
        
        // Track input changes
        document.addEventListener('change', (event) => {
            if (event.target.type === 'select-one' || event.target.type === 'text' || event.target.type === 'number') {
                this.logUserAction('INPUT_CHANGE', {
                    element: event.target.tagName,
                    type: event.target.type,
                    name: event.target.name,
                    value: event.target.value,
                    id: event.target.id
                });
            }
        });
        
        // Track page navigation
        window.addEventListener('beforeunload', () => {
            this.logUserAction('PAGE_UNLOAD', {
                url: window.location.href,
                timeSpent: Date.now() - this.pageLoadTime
            });
        });
        
        this.pageLoadTime = Date.now();
    }
    
    setupAjaxLogging() {
        // Intercept fetch requests
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const startTime = Date.now();
            const url = args[0];
            const options = args[1] || {};
            
            this.logEvent('AJAX_REQUEST_START', {
                url: url,
                method: options.method || 'GET',
                headers: options.headers,
                body: options.body
            });
            
            try {
                const response = await originalFetch(...args);
                const duration = Date.now() - startTime;
                
                this.logEvent('AJAX_REQUEST_SUCCESS', {
                    url: url,
                    status: response.status,
                    statusText: response.statusText,
                    duration: duration
                });
                
                return response;
            } catch (error) {
                const duration = Date.now() - startTime;
                
                this.logEvent('AJAX_REQUEST_ERROR', {
                    url: url,
                    error: error.message,
                    duration: duration
                });
                
                throw error;
            }
        };
        
        // Intercept XMLHttpRequest
        const originalXMLHttpRequest = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
            const xhr = new originalXMLHttpRequest();
            const debugLogger = window.truckOptiDebugLogger;
            
            const originalOpen = xhr.open;
            const originalSend = xhr.send;
            
            xhr.open = function(method, url, ...args) {
                this._debugMethod = method;
                this._debugUrl = url;
                this._debugStartTime = Date.now();
                
                debugLogger.logEvent('XHR_REQUEST_START', {
                    method: method,
                    url: url
                });
                
                return originalOpen.apply(this, [method, url, ...args]);
            };
            
            xhr.send = function(data) {
                this.addEventListener('load', function() {
                    const duration = Date.now() - this._debugStartTime;
                    debugLogger.logEvent('XHR_REQUEST_SUCCESS', {
                        method: this._debugMethod,
                        url: this._debugUrl,
                        status: this.status,
                        duration: duration,
                        responseLength: this.responseText.length
                    });
                });
                
                this.addEventListener('error', function() {
                    const duration = Date.now() - this._debugStartTime;
                    debugLogger.logEvent('XHR_REQUEST_ERROR', {
                        method: this._debugMethod,
                        url: this._debugUrl,
                        duration: duration
                    });
                });
                
                return originalSend.apply(this, [data]);
            };
            
            return xhr;
        };
    }
    
    setupErrorLogging() {
        // Capture JavaScript errors
        window.addEventListener('error', (event) => {
            this.logEvent('JAVASCRIPT_ERROR', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.logEvent('UNHANDLED_PROMISE_REJECTION', {
                reason: event.reason,
                stack: event.reason?.stack
            });
        });
    }
    
    logEvent(eventType, data) {
        if (!this.debugEnabled) return;
        
        const logEntry = {
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            eventType: eventType,
            data: data,
            url: window.location.href,
            userAgent: navigator.userAgent
        };
        
        // Add to buffer
        this.logBuffer.push(logEntry);
        
        // Maintain buffer size
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }
        
        // Console output for development
        console.log(`[TruckOpti Debug] ${eventType}:`, data);
        
        // Send to server if critical
        if (this.isCriticalEvent(eventType)) {
            this.sendToServer(logEntry);
        }
    }
    
    logUserAction(action, details) {
        this.logEvent('USER_ACTION', {
            action: action,
            details: details
        });
    }
    
    isCriticalEvent(eventType) {
        const criticalEvents = [
            'JAVASCRIPT_ERROR',
            'UNHANDLED_PROMISE_REJECTION',
            'AJAX_REQUEST_ERROR',
            'XHR_REQUEST_ERROR',
            'FORM_SUBMIT'
        ];
        return criticalEvents.includes(eventType);
    }
    
    async sendToServer(logEntry) {
        try {
            await fetch('/api/debug-log', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logEntry)
            });
        } catch (error) {
            // Silently fail to avoid infinite loops
            console.warn('Failed to send debug log to server:', error);
        }
    }
    
    // Public methods for manual logging
    logTruckRecommendationStart(formData) {
        this.logEvent('TRUCK_RECOMMENDATION_START', {
            formData: formData,
            timestamp: new Date().toISOString()
        });
    }
    
    logTruckRecommendationResult(result) {
        this.logEvent('TRUCK_RECOMMENDATION_RESULT', {
            result: result,
            timestamp: new Date().toISOString()
        });
    }
    
    logFleetOptimizationStart(data) {
        this.logEvent('FLEET_OPTIMIZATION_START', {
            data: data,
            timestamp: new Date().toISOString()
        });
    }
    
    logFleetOptimizationResult(result) {
        this.logEvent('FLEET_OPTIMIZATION_RESULT', {
            result: result,
            timestamp: new Date().toISOString()
        });
    }
    
    // Export logs for debugging
    exportLogs() {
        const dataStr = JSON.stringify(this.logBuffer, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `truckopti_frontend_debug_${this.sessionId}.json`;
        link.click();
    }
    
    // Clear logs
    clearLogs() {
        this.logBuffer = [];
        this.logEvent('LOGS_CLEARED', {});
    }
    
    // Get current logs
    getLogs() {
        return this.logBuffer;
    }
}

// Initialize global debug logger
window.truckOptiDebugLogger = new TruckOptiFrontendDebugLogger();

// Add convenience functions to window
window.logTruckRecommendation = (action, data) => {
    window.truckOptiDebugLogger.logEvent(`TRUCK_RECOMMENDATION_${action.toUpperCase()}`, data);
};

window.logFleetOptimization = (action, data) => {
    window.truckOptiDebugLogger.logEvent(`FLEET_OPTIMIZATION_${action.toUpperCase()}`, data);
};

window.exportDebugLogs = () => {
    window.truckOptiDebugLogger.exportLogs();
};

// Log when debug script is loaded
console.log('[TruckOpti Debug] Frontend debug logging initialized');