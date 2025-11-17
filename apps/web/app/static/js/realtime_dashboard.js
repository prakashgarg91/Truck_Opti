/**
 * Real-time Dashboard with WebSocket Integration
 * Provides live updates for TruckOpti dashboard
 */

class RealtimeDashboard {
    constructor(options = {}) {
        this.options = {
            reconnectAttempts: 5,
            reconnectInterval: 2000,
            pingInterval: 30000,
            debug: false,
            ...options
        };
        
        this.socket = null;
        this.reconnectCount = 0;
        this.isConnected = false;
        this.subscriptions = new Set();
        this.pingTimer = null;
        this.reconnectTimer = null;
        this.stats = {};
        this.chartInstances = {};
        
        this.init();
    }
    
    init() {
        this.loadSocketIO().then(() => {
            this.connect();
            this.bindEvents();
            this.startPingService();
        });
    }
    
    async loadSocketIO() {
        // Load Socket.IO if not already loaded
        if (typeof io === 'undefined') {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
    }
    
    connect() {
        try {
            this.socket = io('/', {
                transports: ['websocket', 'polling'],
                upgrade: true,
                rememberUpgrade: true,
                timeout: 20000
            });
            
            this.registerSocketEvents();
            this.log('Connecting to WebSocket...');
            
        } catch (error) {
            console.error('Failed to create socket connection:', error);
            this.scheduleReconnect();
        }
    }
    
    registerSocketEvents() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectCount = 0;
            this.log('Connected to server');
            
            this.updateConnectionStatus('connected');
            this.subscribeToDashboard();
            this.hideReconnectIndicator();
        });
        
        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.log('Disconnected from server');
            
            this.updateConnectionStatus('disconnected');
            this.scheduleReconnect();
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateConnectionStatus('error');
            this.scheduleReconnect();
        });
        
        this.socket.on('dashboard_stats', (stats) => {
            this.handleStatsUpdate(stats);
        });
        
        this.socket.on('packing_job_progress', (data) => {
            this.handlePackingJobProgress(data);
        });
        
        this.socket.on('new_job_notification', (data) => {
            this.handleNewJobNotification(data);
        });
        
        this.socket.on('job_completion_notification', (data) => {
            this.handleJobCompletionNotification(data);
        });
        
        this.socket.on('system_alert', (data) => {
            this.handleSystemAlert(data);
        });
        
        this.socket.on('pong', (data) => {
            this.log('Received pong:', data.timestamp);
        });
        
        this.socket.on('subscription_confirmed', (data) => {
            this.log('Subscription confirmed:', data.room);
        });
    }
    
    subscribeToDashboard() {
        if (this.isConnected) {
            this.socket.emit('subscribe_dashboard');
            this.subscriptions.add('dashboard_updates');
            this.log('Subscribed to dashboard updates');
        }
    }
    
    subscribeToPackingJob(jobId) {
        if (this.isConnected) {
            this.socket.emit('subscribe_packing_job', { job_id: jobId });
            this.subscriptions.add(`packing_job_${jobId}`);
            this.log(`Subscribed to packing job ${jobId}`);
        }
    }
    
    unsubscribe(room) {
        if (this.isConnected) {
            this.socket.emit('unsubscribe', { room });
            this.subscriptions.delete(room);
            this.log(`Unsubscribed from ${room}`);
        }
    }
    
    handleStatsUpdate(stats) {
        this.stats = stats;
        this.updateDashboardMetrics(stats);
        this.updateCharts(stats);
        this.updateRecentActivity(stats.recent_activity || []);
        this.updatePerformanceMetrics(stats.performance || {});
        this.log('Dashboard stats updated');
    }
    
    updateDashboardMetrics(stats) {
        const metrics = {\n            'total-trucks': stats.total_trucks,\n            'total-cartons': stats.total_cartons,\n            'total-jobs': stats.total_jobs,\n            'avg-utilization': `${(stats.avg_utilization * 100).toFixed(1)}%`,\n            'total-cost': this.formatCurrency(stats.total_cost),\n            'active-connections': stats.active_connections\n        };\n        \n        Object.entries(metrics).forEach(([id, value]) => {\n            const element = document.getElementById(id);\n            if (element) {\n                this.animateValue(element, value);\n            }\n        });\n        \n        // Update last updated timestamp\n        const lastUpdated = document.getElementById('last-updated');\n        if (lastUpdated) {\n            lastUpdated.textContent = `Last updated: ${new Date(stats.last_updated).toLocaleTimeString()}`;\n        }\n    }\n    \n    updateCharts(stats) {\n        // Update utilization chart\n        this.updateUtilizationChart(stats.avg_utilization || 0);\n        \n        // Update cost trend chart\n        this.updateCostTrendChart(stats.total_cost || 0);\n        \n        // Update system status chart\n        this.updateSystemStatusChart(stats.performance || {});\n    }\n    \n    updateUtilizationChart(utilization) {\n        const chartElement = document.getElementById('utilizationChart');\n        if (!chartElement) return;\n        \n        const percentage = Math.round(utilization * 100);\n        \n        // Create or update chart\n        if (!this.chartInstances.utilization) {\n            this.chartInstances.utilization = this.createGaugeChart(\n                chartElement, \n                percentage, \n                'Space Utilization',\n                '#007bff'\n            );\n        } else {\n            this.updateGaugeChart(this.chartInstances.utilization, percentage);\n        }\n    }\n    \n    updateCostTrendChart(totalCost) {\n        const chartElement = document.getElementById('costTrendChart');\n        if (!chartElement) return;\n        \n        // Add current cost to trend data\n        if (!this.costTrendData) {\n            this.costTrendData = { labels: [], data: [] };\n        }\n        \n        const now = new Date();\n        this.costTrendData.labels.push(now.toLocaleTimeString());\n        this.costTrendData.data.push(totalCost);\n        \n        // Keep only last 20 data points\n        if (this.costTrendData.labels.length > 20) {\n            this.costTrendData.labels.shift();\n            this.costTrendData.data.shift();\n        }\n        \n        if (!this.chartInstances.costTrend) {\n            this.chartInstances.costTrend = this.createLineChart(\n                chartElement,\n                this.costTrendData,\n                'Cost Trend',\n                '#28a745'\n            );\n        } else {\n            this.updateLineChart(this.chartInstances.costTrend, this.costTrendData);\n        }\n    }\n    \n    updateSystemStatusChart(performance) {\n        const chartElement = document.getElementById('systemStatusChart');\n        if (!chartElement) return;\n        \n        const statusData = {\n            'Response Time': performance.response_time_ms || 0,\n            'Success Rate': performance.success_rate || 0,\n            'Efficiency': performance.optimization_efficiency || 0\n        };\n        \n        if (!this.chartInstances.systemStatus) {\n            this.chartInstances.systemStatus = this.createBarChart(\n                chartElement,\n                statusData,\n                'System Performance'\n            );\n        } else {\n            this.updateBarChart(this.chartInstances.systemStatus, statusData);\n        }\n    }\n    \n    createGaugeChart(element, value, title, color) {\n        // Simple gauge chart implementation\n        element.innerHTML = `\n            <div class=\"gauge-chart\">\n                <div class=\"gauge-title\">${title}</div>\n                <div class=\"gauge-value\">${value}%</div>\n                <div class=\"gauge-bar\">\n                    <div class=\"gauge-fill\" style=\"width: ${value}%; background-color: ${color};\"></div>\n                </div>\n            </div>\n        `;\n        \n        return { element, value, title, color };\n    }\n    \n    updateGaugeChart(chart, newValue) {\n        const fillElement = chart.element.querySelector('.gauge-fill');\n        const valueElement = chart.element.querySelector('.gauge-value');\n        \n        if (fillElement && valueElement) {\n            fillElement.style.width = `${newValue}%`;\n            valueElement.textContent = `${newValue}%`;\n        }\n    }\n    \n    createLineChart(element, data, title, color) {\n        // Simple line chart implementation (you might want to use Chart.js here)\n        const canvas = document.createElement('canvas');\n        canvas.width = element.offsetWidth;\n        canvas.height = 200;\n        element.appendChild(canvas);\n        \n        return { element, canvas, data, title, color };\n    }\n    \n    updateLineChart(chart, newData) {\n        // Update line chart data\n        chart.data = newData;\n        // Redraw logic would go here\n    }\n    \n    createBarChart(element, data, title) {\n        // Simple bar chart implementation\n        const chartHtml = Object.entries(data).map(([label, value]) => `\n            <div class=\"bar-item\">\n                <div class=\"bar-label\">${label}</div>\n                <div class=\"bar-container\">\n                    <div class=\"bar-fill\" style=\"width: ${Math.min(value, 100)}%;\"></div>\n                    <div class=\"bar-value\">${value}</div>\n                </div>\n            </div>\n        `).join('');\n        \n        element.innerHTML = `\n            <div class=\"bar-chart\">\n                <div class=\"chart-title\">${title}</div>\n                ${chartHtml}\n            </div>\n        `;\n        \n        return { element, data, title };\n    }\n    \n    updateBarChart(chart, newData) {\n        chart.data = newData;\n        const chartElement = chart.element;\n        \n        Object.entries(newData).forEach(([label, value]) => {\n            const barItem = Array.from(chartElement.querySelectorAll('.bar-item'))\n                .find(item => item.querySelector('.bar-label').textContent === label);\n            \n            if (barItem) {\n                const fillElement = barItem.querySelector('.bar-fill');\n                const valueElement = barItem.querySelector('.bar-value');\n                \n                fillElement.style.width = `${Math.min(value, 100)}%`;\n                valueElement.textContent = value;\n            }\n        });\n    }\n    \n    updateRecentActivity(activities) {\n        const activityList = document.getElementById('recent-activity-list');\n        if (!activityList || !activities.length) return;\n        \n        const activityHtml = activities.map(activity => {\n            const statusClass = activity.status === 'completed' ? 'success' : \n                               activity.status === 'failed' ? 'danger' : 'primary';\n            \n            return `\n                <div class=\"activity-item\" data-job-id=\"${activity.id}\">\n                    <div class=\"activity-info\">\n                        <strong>${activity.name}</strong>\n                        <small class=\"text-muted d-block\">\n                            ${new Date(activity.created).toLocaleString()}\n                        </small>\n                    </div>\n                    <div class=\"activity-status\">\n                        <span class=\"badge bg-${statusClass}\">${activity.status}</span>\n                        <small class=\"text-muted d-block\">${activity.optimization_goal}</small>\n                    </div>\n                </div>\n            `;\n        }).join('');\n        \n        activityList.innerHTML = activityHtml;\n        \n        // Add click handlers for activity items\n        activityList.querySelectorAll('.activity-item').forEach(item => {\n            item.addEventListener('click', () => {\n                const jobId = item.dataset.jobId;\n                this.showJobDetails(jobId);\n            });\n        });\n    }\n    \n    updatePerformanceMetrics(performance) {\n        const metricsContainer = document.getElementById('performance-metrics');\n        if (!metricsContainer) return;\n        \n        metricsContainer.innerHTML = `\n            <div class=\"row\">\n                <div class=\"col-md-4\">\n                    <div class=\"metric-card\">\n                        <div class=\"metric-value\">${performance.response_time_ms || 0}ms</div>\n                        <div class=\"metric-label\">Response Time</div>\n                    </div>\n                </div>\n                <div class=\"col-md-4\">\n                    <div class=\"metric-card\">\n                        <div class=\"metric-value\">${performance.success_rate || 0}%</div>\n                        <div class=\"metric-label\">Success Rate</div>\n                    </div>\n                </div>\n                <div class=\"col-md-4\">\n                    <div class=\"metric-card\">\n                        <div class=\"metric-value\">${performance.optimization_efficiency || 0}%</div>\n                        <div class=\"metric-label\">Efficiency</div>\n                    </div>\n                </div>\n            </div>\n        `;\n    }\n    \n    handlePackingJobProgress(data) {\n        this.showNotification(`Job ${data.job_id} progress: ${JSON.stringify(data.progress)}`, 'info');\n        \n        // Update job-specific UI if on job details page\n        const jobProgressElement = document.getElementById(`job-progress-${data.job_id}`);\n        if (jobProgressElement) {\n            this.updateJobProgress(jobProgressElement, data.progress);\n        }\n    }\n    \n    handleNewJobNotification(data) {\n        this.showNotification(`New packing job created: ${data.job.name}`, 'success');\n        this.playNotificationSound();\n        \n        // Add to recent activity\n        this.addToRecentActivity(data.job);\n    }\n    \n    handleJobCompletionNotification(data) {\n        this.showNotification(`Job ${data.job_id} completed successfully!`, 'success');\n        this.playNotificationSound();\n    }\n    \n    handleSystemAlert(data) {\n        this.showNotification(data.message, data.level);\n        \n        if (data.level === 'error') {\n            this.playErrorSound();\n        }\n    }\n    \n    showNotification(message, type = 'info') {\n        // Create notification element\n        const notification = document.createElement('div');\n        notification.className = `alert alert-${type} notification fade-in`;\n        notification.style.cssText = `\n            position: fixed;\n            top: 20px;\n            right: 20px;\n            z-index: 9999;\n            min-width: 300px;\n            box-shadow: 0 4px 12px rgba(0,0,0,0.15);\n        `;\n        \n        notification.innerHTML = `\n            ${message}\n            <button type=\"button\" class=\"btn-close\" aria-label=\"Close\"></button>\n        `;\n        \n        document.body.appendChild(notification);\n        \n        // Auto-remove after 5 seconds\n        setTimeout(() => {\n            notification.classList.add('fade-out');\n            setTimeout(() => {\n                if (notification.parentNode) {\n                    notification.parentNode.removeChild(notification);\n                }\n            }, 300);\n        }, 5000);\n        \n        // Add close button functionality\n        notification.querySelector('.btn-close').addEventListener('click', () => {\n            notification.classList.add('fade-out');\n            setTimeout(() => {\n                if (notification.parentNode) {\n                    notification.parentNode.removeChild(notification);\n                }\n            }, 300);\n        });\n    }\n    \n    animateValue(element, newValue) {\n        const currentValue = element.textContent;\n        \n        if (currentValue !== newValue.toString()) {\n            element.style.transition = 'all 0.3s ease';\n            element.style.transform = 'scale(1.1)';\n            element.textContent = newValue;\n            \n            setTimeout(() => {\n                element.style.transform = 'scale(1)';\n            }, 300);\n        }\n    }\n    \n    formatCurrency(amount) {\n        return new Intl.NumberFormat('en-IN', {\n            style: 'currency',\n            currency: 'INR',\n            minimumFractionDigits: 0\n        }).format(amount || 0);\n    }\n    \n    updateConnectionStatus(status) {\n        const statusIndicator = document.getElementById('connection-status');\n        if (!statusIndicator) return;\n        \n        const statusConfig = {\n            connected: { text: 'Connected', class: 'success', icon: '🟢' },\n            disconnected: { text: 'Disconnected', class: 'warning', icon: '🟡' },\n            error: { text: 'Connection Error', class: 'danger', icon: '🔴' }\n        };\n        \n        const config = statusConfig[status] || statusConfig.error;\n        \n        statusIndicator.innerHTML = `\n            <span class=\"badge bg-${config.class}\">\n                ${config.icon} ${config.text}\n            </span>\n        `;\n    }\n    \n    scheduleReconnect() {\n        if (this.reconnectCount >= this.options.reconnectAttempts) {\n            this.log('Max reconnection attempts reached');\n            this.showReconnectIndicator();\n            return;\n        }\n        \n        this.reconnectCount++;\n        const delay = this.options.reconnectInterval * this.reconnectCount;\n        \n        this.log(`Scheduling reconnect attempt ${this.reconnectCount} in ${delay}ms`);\n        \n        this.reconnectTimer = setTimeout(() => {\n            this.connect();\n        }, delay);\n    }\n    \n    showReconnectIndicator() {\n        let indicator = document.getElementById('reconnect-indicator');\n        \n        if (!indicator) {\n            indicator = document.createElement('div');\n            indicator.id = 'reconnect-indicator';\n            indicator.style.cssText = `\n                position: fixed;\n                bottom: 20px;\n                right: 20px;\n                background: #dc3545;\n                color: white;\n                padding: 10px 15px;\n                border-radius: 5px;\n                z-index: 9999;\n                box-shadow: 0 2px 8px rgba(0,0,0,0.2);\n            `;\n            indicator.innerHTML = `\n                Connection lost. \n                <button class=\"btn btn-sm btn-outline-light ms-2\" onclick=\"window.dashboard.reconnect()\">Retry</button>\n            `;\n            document.body.appendChild(indicator);\n        }\n        \n        indicator.style.display = 'block';\n    }\n    \n    hideReconnectIndicator() {\n        const indicator = document.getElementById('reconnect-indicator');\n        if (indicator) {\n            indicator.style.display = 'none';\n        }\n    }\n    \n    reconnect() {\n        this.reconnectCount = 0;\n        this.connect();\n        this.hideReconnectIndicator();\n    }\n    \n    startPingService() {\n        this.pingTimer = setInterval(() => {\n            if (this.isConnected) {\n                this.socket.emit('ping');\n            }\n        }, this.options.pingInterval);\n    }\n    \n    playNotificationSound() {\n        // Play a subtle notification sound\n        try {\n            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQdBSuBzvLZiTcIGGq+7+OZVA0NUajh8LRjHgQy');\n            audio.volume = 0.3;\n            audio.play().catch(() => {}); // Ignore errors\n        } catch (e) {\n            // Notification sound failed, ignore\n        }\n    }\n    \n    playErrorSound() {\n        // Play error sound\n        try {\n            const audio = new Audio('data:audio/wav;base64,UklGRr4DAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YZoDAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjqP2O+2YiAELIHO8tiJNwgZaLvt559NEAxGn+DyvmQdBSuBzvLZiTcIGWq+7+OZVA0NUajh8LRjHgQ=');\n            audio.volume = 0.5;\n            audio.play().catch(() => {}); // Ignore errors\n        } catch (e) {\n            // Error sound failed, ignore\n        }\n    }\n    \n    bindEvents() {\n        // Manual refresh button\n        const refreshButton = document.getElementById('refresh-dashboard');\n        if (refreshButton) {\n            refreshButton.addEventListener('click', () => {\n                this.requestStats();\n            });\n        }\n        \n        // Connection toggle button\n        const toggleButton = document.getElementById('toggle-realtime');\n        if (toggleButton) {\n            toggleButton.addEventListener('click', () => {\n                this.toggleConnection();\n            });\n        }\n    }\n    \n    requestStats() {\n        if (this.isConnected) {\n            this.socket.emit('request_stats');\n        }\n    }\n    \n    toggleConnection() {\n        if (this.isConnected) {\n            this.disconnect();\n        } else {\n            this.connect();\n        }\n    }\n    \n    disconnect() {\n        if (this.socket) {\n            this.socket.disconnect();\n        }\n        \n        if (this.pingTimer) {\n            clearInterval(this.pingTimer);\n        }\n        \n        if (this.reconnectTimer) {\n            clearTimeout(this.reconnectTimer);\n        }\n    }\n    \n    log(message) {\n        if (this.options.debug) {\n            console.log('[RealtimeDashboard]', message);\n        }\n    }\n    \n    // Public API methods\n    getStats() {\n        return this.stats;\n    }\n    \n    isConnected() {\n        return this.isConnected;\n    }\n    \n    getConnectionStats() {\n        return {\n            connected: this.isConnected,\n            reconnectCount: this.reconnectCount,\n            subscriptions: Array.from(this.subscriptions)\n        };\n    }\n}\n\n// Add required CSS\nconst style = document.createElement('style');\nstyle.textContent = `\n    .notification {\n        border-left: 4px solid;\n        animation: slideIn 0.3s ease;\n    }\n    \n    .notification.fade-in {\n        animation: slideIn 0.3s ease;\n    }\n    \n    .notification.fade-out {\n        animation: slideOut 0.3s ease;\n    }\n    \n    @keyframes slideIn {\n        from { transform: translateX(100%); opacity: 0; }\n        to { transform: translateX(0); opacity: 1; }\n    }\n    \n    @keyframes slideOut {\n        from { transform: translateX(0); opacity: 1; }\n        to { transform: translateX(100%); opacity: 0; }\n    }\n    \n    .gauge-chart {\n        text-align: center;\n        padding: 20px;\n    }\n    \n    .gauge-title {\n        font-weight: bold;\n        margin-bottom: 10px;\n    }\n    \n    .gauge-value {\n        font-size: 2em;\n        font-weight: bold;\n        margin: 10px 0;\n    }\n    \n    .gauge-bar {\n        height: 20px;\n        background: #e9ecef;\n        border-radius: 10px;\n        overflow: hidden;\n        position: relative;\n    }\n    \n    .gauge-fill {\n        height: 100%;\n        border-radius: 10px;\n        transition: width 0.5s ease;\n    }\n    \n    .bar-chart {\n        padding: 15px;\n    }\n    \n    .chart-title {\n        font-weight: bold;\n        margin-bottom: 15px;\n        text-align: center;\n    }\n    \n    .bar-item {\n        margin-bottom: 10px;\n    }\n    \n    .bar-label {\n        font-size: 0.9em;\n        margin-bottom: 5px;\n    }\n    \n    .bar-container {\n        display: flex;\n        align-items: center;\n        background: #f8f9fa;\n        border-radius: 4px;\n        overflow: hidden;\n        height: 30px;\n    }\n    \n    .bar-fill {\n        background: linear-gradient(90deg, #007bff, #0056b3);\n        height: 100%;\n        transition: width 0.5s ease;\n        min-width: 2px;\n    }\n    \n    .bar-value {\n        position: absolute;\n        right: 10px;\n        font-size: 0.8em;\n        font-weight: bold;\n    }\n    \n    .activity-item {\n        display: flex;\n        justify-content: space-between;\n        align-items: center;\n        padding: 10px;\n        border-bottom: 1px solid #e9ecef;\n        cursor: pointer;\n        transition: background-color 0.2s;\n    }\n    \n    .activity-item:hover {\n        background-color: #f8f9fa;\n    }\n    \n    .activity-item:last-child {\n        border-bottom: none;\n    }\n    \n    .metric-card {\n        text-align: center;\n        padding: 15px;\n        background: #f8f9fa;\n        border-radius: 8px;\n        margin-bottom: 10px;\n    }\n    \n    .metric-value {\n        font-size: 1.5em;\n        font-weight: bold;\n        color: #007bff;\n    }\n    \n    .metric-label {\n        font-size: 0.9em;\n        color: #6c757d;\n    }\n`;\ndocument.head.appendChild(style);\n\n// Export for global use\nwindow.RealtimeDashboard = RealtimeDashboard;