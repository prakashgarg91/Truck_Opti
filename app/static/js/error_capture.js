// TruckOpti Frontend Error Capture System
(function() {
    // Configuration
    const ERROR_CAPTURE_ENDPOINT = '/api/errors/capture';
    const ERROR_LEVELS = {
        'CRITICAL': 50,
        'HIGH': 40,
        'MEDIUM': 30,
        'LOW': 20
    };

    // Error capture function
    function captureError(error, context = {}) {
        const errorData = {
            message: error.message,
            name: error.name,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            context: {
                ...context,
                userAgent: navigator.userAgent,
                screenResolution: `${window.screen.width}x${window.screen.height}`,
                browserLanguage: navigator.language
            }
        };

        // Determine error level
        let errorLevel = 'MEDIUM';
        if (error.name === 'Error') errorLevel = 'HIGH';
        if (error.name === 'TypeError' || error.name === 'ReferenceError') errorLevel = 'CRITICAL';

        // Send to backend
        fetch(ERROR_CAPTURE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: errorData,
                level: errorLevel
            })
        }).catch(console.error);
    }

    // Global error handler
    window.addEventListener('error', function(event) {
        captureError(event.error || new Error(event.message), {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    });

    // Promise rejection handler
    window.addEventListener('unhandledrejection', function(event) {
        captureError(event.reason, {
            type: 'Promise Rejection'
        });
    });

    // Console error capture
    const originalConsoleError = console.error;
    console.error = function() {
        // Call original console.error
        originalConsoleError.apply(console, arguments);

        // Capture the error
        const error = arguments[0];
        if (error instanceof Error) {
            captureError(error, {
                type: 'Console Error'
            });
        } else if (typeof error === 'string') {
            captureError(new Error(error), {
                type: 'Console Error'
            });
        }
    };

    // Expose error capture for manual use
    window.TruckOptiErrorCapture = {
        captureError: captureError
    };
})();
