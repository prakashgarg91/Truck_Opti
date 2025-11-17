/**
 * Frontend Timing System - Measures complete user experience timeline
 * Tracks: Click → Network → Server Processing → Content Display
 */

class FrontendTimingAnalyzer {
    constructor() {
        this.timings = {};
        this.startTime = performance.now();
        this.initializeTimingCapture();
        console.log('[TIMING] Frontend timing analyzer initialized');
    }

    initializeTimingCapture() {
        // Override fetch to measure network requests
        this.interceptFetch();
        
        // Monitor DOM changes for content display
        this.monitorDOMChanges();
        
        // Track page load events
        this.trackPageEvents();
        
        // Monitor all clicks
        this.trackClicks();
        
        // Track form submissions
        this.trackFormSubmissions();
    }

    logTiming(event, description, data = {}) {
        const timestamp = performance.now();
        const elapsed = timestamp - this.startTime;
        
        const timing = {
            event,
            description,
            timestamp,
            elapsed,
            data,
            url: window.location.href,
            userAgent: navigator.userAgent
        };
        
        console.log(`[TIMING-${elapsed.toFixed(3)}ms] ${event}: ${description}`, data);
        
        // Store timing
        if (!this.timings[event]) {
            this.timings[event] = [];
        }
        this.timings[event].push(timing);
        
        // Send to backend for analysis
        this.sendTimingToBackend(timing);
    }

    trackClicks() {
        document.addEventListener('click', (event) => {
            const target = event.target;
            const clickData = {
                tagName: target.tagName,
                id: target.id,
                className: target.className,
                text: target.textContent?.substring(0, 50),
                href: target.href,
                coordinates: { x: event.clientX, y: event.clientY }
            };
            
            this.logTiming('CLICK', `Clicked ${target.tagName}`, clickData);
            
            // If it's a navigation click, start tracking the journey
            if (target.tagName === 'A' || target.onclick) {
                this.startNavigationTracking(clickData);
            }
        }, true);
    }

    startNavigationTracking(clickData) {
        this.navigationStart = performance.now();
        this.logTiming('NAVIGATION_START', 'Navigation initiated', clickData);
        
        // Track when new content appears
        setTimeout(() => {
            this.checkContentLoaded();
        }, 100);
    }

    checkContentLoaded() {
        const checkInterval = setInterval(() => {
            const isLoading = document.querySelector('.loading') || 
                            document.querySelector('[data-loading]') ||
                            document.body.classList.contains('loading');
            
            if (!isLoading) {
                const navigationTime = performance.now() - this.navigationStart;
                this.logTiming('CONTENT_LOADED', 'Content fully loaded', {
                    navigationTime: navigationTime,
                    contentReady: true
                });
                clearInterval(checkInterval);
            }
        }, 50);
        
        // Maximum wait time
        setTimeout(() => {
            clearInterval(checkInterval);
            const navigationTime = performance.now() - this.navigationStart;
            this.logTiming('CONTENT_TIMEOUT', 'Content load timeout', {
                navigationTime: navigationTime,
                forcedStop: true
            });
        }, 10000);
    }

    interceptFetch() {
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            const url = args[0];
            const requestStart = performance.now();
            
            this.logTiming('REQUEST_START', `Fetch request started`, {
                url: url,
                method: args[1]?.method || 'GET'
            });
            
            try {
                const response = await originalFetch(...args);
                const requestTime = performance.now() - requestStart;
                
                this.logTiming('REQUEST_COMPLETE', `Fetch request completed`, {
                    url: url,
                    status: response.status,
                    requestTime: requestTime,
                    success: response.ok
                });
                
                return response;
            } catch (error) {
                const requestTime = performance.now() - requestStart;
                
                this.logTiming('REQUEST_ERROR', `Fetch request failed`, {
                    url: url,
                    requestTime: requestTime,
                    error: error.message
                });
                
                throw error;
            }
        };
    }

    monitorDOMChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const addedContent = Array.from(mutation.addedNodes)
                        .filter(node => node.nodeType === Node.ELEMENT_NODE)
                        .map(node => ({
                            tagName: node.tagName,
                            id: node.id,
                            className: node.className,
                            textLength: node.textContent?.length || 0
                        }));
                    
                    if (addedContent.length > 0) {
                        this.logTiming('DOM_CONTENT_ADDED', 'New content added to DOM', {
                            addedElements: addedContent.length,
                            elements: addedContent
                        });
                    }
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    trackPageEvents() {
        // Track when page becomes interactive
        document.addEventListener('DOMContentLoaded', () => {
            this.logTiming('DOM_READY', 'DOM content loaded');
        });
        
        window.addEventListener('load', () => {
            this.logTiming('WINDOW_LOADED', 'Window fully loaded');
        });
        
        // Track when images finish loading
        const images = document.querySelectorAll('img');
        images.forEach((img, index) => {
            if (!img.complete) {
                img.addEventListener('load', () => {
                    this.logTiming('IMAGE_LOADED', `Image ${index + 1} loaded`, {
                        src: img.src,
                        width: img.naturalWidth,
                        height: img.naturalHeight
                    });
                });
            }
        });
    }

    trackFormSubmissions() {
        document.addEventListener('submit', (event) => {
            const form = event.target;
            const formData = new FormData(form);
            const formFields = {};
            
            for (let [key, value] of formData.entries()) {
                formFields[key] = typeof value === 'string' ? value.substring(0, 50) : '[File]';
            }
            
            this.logTiming('FORM_SUBMIT', 'Form submitted', {
                action: form.action,
                method: form.method,
                fields: Object.keys(formFields),
                fieldCount: Object.keys(formFields).length
            });
        });
    }

    sendTimingToBackend(timing) {
        // Send timing data to backend for server-side analysis
        fetch('/api/frontend-timing', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(timing)
        }).catch(error => {
            console.warn('[TIMING] Failed to send timing to backend:', error);
        });
    }

    generateReport() {
        const report = {
            sessionStart: this.startTime,
            currentTime: performance.now(),
            totalSessionTime: performance.now() - this.startTime,
            timings: this.timings,
            performance: {
                navigation: performance.getEntriesByType('navigation')[0],
                resources: performance.getEntriesByType('resource')
            },
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
        
        console.log('[TIMING] Complete timing report:', report);
        return report;
    }

    getSlowOperations(threshold = 1000) {
        const slowOps = [];
        
        Object.entries(this.timings).forEach(([event, timings]) => {
            timings.forEach(timing => {
                if (timing.data.requestTime > threshold || timing.data.navigationTime > threshold) {
                    slowOps.push({
                        event: timing.event,
                        description: timing.description,
                        slowTime: timing.data.requestTime || timing.data.navigationTime,
                        data: timing.data
                    });
                }
            });
        });
        
        return slowOps.sort((a, b) => b.slowTime - a.slowTime);
    }

    printSummary() {
        console.log('\n=== FRONTEND TIMING SUMMARY ===');
        console.log(`Session Duration: ${(performance.now() - this.startTime).toFixed(3)}ms`);
        
        Object.entries(this.timings).forEach(([event, timings]) => {
            console.log(`${event}: ${timings.length} occurrences`);
            if (timings.length > 0) {
                const avgTime = timings.reduce((sum, t) => sum + (t.data.requestTime || t.data.navigationTime || 0), 0) / timings.length;
                if (avgTime > 0) {
                    console.log(`  Average time: ${avgTime.toFixed(3)}ms`);
                }
            }
        });
        
        const slowOps = this.getSlowOperations(500);
        if (slowOps.length > 0) {
            console.log('\nSLOW OPERATIONS (>500ms):');
            slowOps.forEach(op => {
                console.log(`  ${op.event}: ${op.slowTime.toFixed(3)}ms - ${op.description}`);
            });
        }
        
        console.log('=== END TIMING SUMMARY ===\n');
    }
}

// Initialize timing analyzer
const timingAnalyzer = new FrontendTimingAnalyzer();

// Add keyboard shortcut to generate report (Ctrl+Shift+T)
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'T') {
        timingAnalyzer.printSummary();
        timingAnalyzer.generateReport();
    }
});

// Auto-generate report every 30 seconds for debugging
setInterval(() => {
    if (Object.keys(timingAnalyzer.timings).length > 0) {
        timingAnalyzer.printSummary();
    }
}, 30000);

// Export for global access
window.timingAnalyzer = timingAnalyzer;