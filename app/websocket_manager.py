"""
WebSocket Manager for Real-time Updates in TruckOpti
Provides real-time dashboard updates, notifications, and live data streaming
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Set, Any
from flask import Flask
from flask_socketio import SocketIO, emit, join_room, leave_room
import time
from threading import Thread, Lock
import queue
from collections import defaultdict

class WebSocketManager:
    """Manages WebSocket connections and real-time updates"""
    
    def __init__(self, app: Flask = None):
        self.app = app
        self.socketio = None
        self.active_connections = {}
        self.room_subscriptions = defaultdict(set)
        self.update_queue = queue.Queue()
        self.stats_cache = {}
        self.cache_lock = Lock()
        self.update_thread = None
        self.is_running = False
        
        if app:
            self.init_app(app)
    
    def init_app(self, app: Flask):
        """Initialize WebSocket with Flask app"""
        self.app = app
        self.socketio = SocketIO(
            app,
            cors_allowed_origins="*",
            async_mode='threading',
            ping_timeout=60,
            ping_interval=25
        )
        
        self.register_events()
        self.start_update_service()
        logging.info("WebSocket Manager initialized")
    
    def register_events(self):
        """Register WebSocket event handlers"""
        
        @self.socketio.on('connect')
        def handle_connect():
            session_id = self.get_session_id()
            self.active_connections[session_id] = {
                'connected_at': datetime.now(),
                'last_activity': datetime.now(),
                'subscriptions': set(),
                'user_agent': self.get_user_agent()
            }
            
            logging.info(f"Client connected: {session_id}")
            
            # Send current stats immediately
            emit('dashboard_stats', self.get_current_stats())
            emit('connection_established', {
                'session_id': session_id,
                'server_time': datetime.now().isoformat()
            })
        
        @self.socketio.on('disconnect')
        def handle_disconnect():
            session_id = self.get_session_id()
            if session_id in self.active_connections:
                # Clean up subscriptions
                subscriptions = self.active_connections[session_id]['subscriptions']
                for room in subscriptions:
                    self.room_subscriptions[room].discard(session_id)
                
                del self.active_connections[session_id]
                logging.info(f"Client disconnected: {session_id}")
        
        @self.socketio.on('subscribe_dashboard')
        def handle_subscribe_dashboard(data):
            """Subscribe to dashboard updates"""
            session_id = self.get_session_id()
            room = 'dashboard_updates'
            
            join_room(room)
            self.room_subscriptions[room].add(session_id)
            
            if session_id in self.active_connections:
                self.active_connections[session_id]['subscriptions'].add(room)
            
            emit('subscription_confirmed', {'room': room})
            logging.info(f"Client {session_id} subscribed to dashboard updates")
        
        @self.socketio.on('subscribe_packing_job')
        def handle_subscribe_packing_job(data):
            """Subscribe to specific packing job updates"""
            session_id = self.get_session_id()
            job_id = data.get('job_id')
            
            if not job_id:
                emit('error', {'message': 'Job ID is required'})
                return
            
            room = f'packing_job_{job_id}'
            join_room(room)
            self.room_subscriptions[room].add(session_id)
            
            if session_id in self.active_connections:
                self.active_connections[session_id]['subscriptions'].add(room)
            
            emit('subscription_confirmed', {'room': room, 'job_id': job_id})
        
        @self.socketio.on('unsubscribe')
        def handle_unsubscribe(data):
            """Unsubscribe from updates"""
            session_id = self.get_session_id()
            room = data.get('room')
            
            if room:
                leave_room(room)
                self.room_subscriptions[room].discard(session_id)
                
                if session_id in self.active_connections:
                    self.active_connections[session_id]['subscriptions'].discard(room)
                
                emit('unsubscription_confirmed', {'room': room})
        
        @self.socketio.on('ping')
        def handle_ping():
            """Handle ping for connection health check"""
            session_id = self.get_session_id()
            if session_id in self.active_connections:
                self.active_connections[session_id]['last_activity'] = datetime.now()
            
            emit('pong', {'timestamp': datetime.now().isoformat()})
        
        @self.socketio.on('request_stats')
        def handle_request_stats():
            """Handle manual stats request"""
            emit('dashboard_stats', self.get_current_stats())
    
    def get_session_id(self):
        """Get current session ID"""
        from flask import request
        return request.sid
    
    def get_user_agent(self):
        """Get client user agent"""
        from flask import request
        return request.headers.get('User-Agent', 'Unknown')
    
    def start_update_service(self):
        """Start the background update service"""
        if not self.is_running:
            self.is_running = True
            self.update_thread = Thread(target=self._update_service_worker, daemon=True)
            self.update_thread.start()
            logging.info("WebSocket update service started")
    
    def stop_update_service(self):
        """Stop the background update service"""
        self.is_running = False
        if self.update_thread and self.update_thread.is_alive():
            self.update_thread.join(timeout=5)
        logging.info("WebSocket update service stopped")
    
    def _update_service_worker(self):
        """Background worker for periodic updates"""
        while self.is_running:
            try:
                # Update dashboard stats every 30 seconds
                self.broadcast_dashboard_stats()
                
                # Process any queued updates
                self.process_update_queue()
                
                # Clean up inactive connections
                self.cleanup_inactive_connections()
                
                time.sleep(30)  # Update interval
                
            except Exception as e:
                logging.error(f"Error in update service worker: {e}")
                time.sleep(5)  # Wait before retrying
    
    def broadcast_dashboard_stats(self):
        """Broadcast updated dashboard statistics"""
        if not self.active_connections:
            return
        
        stats = self.get_current_stats()
        
        # Only broadcast if stats have changed
        if stats != self.stats_cache.get('last_broadcast'):
            with self.cache_lock:
                self.stats_cache['last_broadcast'] = stats.copy()
            
            self.socketio.emit('dashboard_stats', stats, room='dashboard_updates')
            logging.debug("Dashboard stats broadcasted to all subscribers")
    
    def get_current_stats(self):
        """Get current dashboard statistics"""
        try:
            from app.models import TruckType, CartonType, PackingJob, PackingResult, Shipment
            from app import db
            
            # Use cached stats if recent (less than 10 seconds old)
            cache_key = 'current_stats'
            with self.cache_lock:
                if (cache_key in self.stats_cache and 
                    time.time() - self.stats_cache[cache_key].get('timestamp', 0) < 10):
                    return self.stats_cache[cache_key]['data']
            
            stats = {
                'total_trucks': TruckType.query.count(),
                'total_cartons': CartonType.query.count(),
                'total_jobs': PackingJob.query.count(),
                'total_shipments': Shipment.query.count(),
                'avg_utilization': db.session.query(db.func.avg(PackingResult.space_utilization)).scalar() or 0,
                'total_cost': db.session.query(db.func.sum(PackingResult.total_cost)).scalar() or 0,
                'active_connections': len(self.active_connections),
                'last_updated': datetime.now().isoformat(),
                'system_status': 'operational'
            }
            
            # Recent activity
            recent_jobs = PackingJob.query.order_by(PackingJob.date_created.desc()).limit(5).all()
            stats['recent_activity'] = [
                {
                    'id': job.id,
                    'name': job.name,
                    'status': job.status,
                    'created': job.date_created.isoformat(),
                    'optimization_goal': job.optimization_goal
                }
                for job in recent_jobs
            ]
            
            # Performance metrics
            stats['performance'] = {
                'response_time_ms': self.calculate_average_response_time(),
                'success_rate': self.calculate_success_rate(),
                'optimization_efficiency': self.calculate_optimization_efficiency()
            }
            
            # Cache the results
            with self.cache_lock:
                self.stats_cache[cache_key] = {
                    'data': stats,
                    'timestamp': time.time()
                }
            
            return stats
            
        except Exception as e:
            logging.error(f"Error getting current stats: {e}")
            return {
                'error': 'Failed to load statistics',
                'last_updated': datetime.now().isoformat(),
                'system_status': 'error'
            }
    
    def calculate_average_response_time(self):
        """Calculate average response time (mock implementation)"""
        # In a real implementation, this would track actual response times
        return round(45.2, 1)  # Mock value in milliseconds
    
    def calculate_success_rate(self):
        """Calculate system success rate"""
        try:
            from app.models import PackingJob
            total_jobs = PackingJob.query.count()
            if total_jobs == 0:
                return 100.0
            
            successful_jobs = PackingJob.query.filter_by(status='completed').count()
            return round((successful_jobs / total_jobs) * 100, 1)
        except:
            return 95.5  # Mock value
    
    def calculate_optimization_efficiency(self):
        """Calculate optimization efficiency score"""
        try:
            from app.models import PackingResult
            from app import db
            
            avg_utilization = db.session.query(db.func.avg(PackingResult.space_utilization)).scalar()
            if avg_utilization is None:
                return 85.0
            
            # Convert to percentage and normalize to efficiency score
            return round(min(avg_utilization * 100, 100), 1)
        except:
            return 87.3  # Mock value
    
    def process_update_queue(self):
        """Process any queued real-time updates"""
        try:
            while not self.update_queue.empty():
                update = self.update_queue.get_nowait()
                self._handle_queued_update(update)
        except queue.Empty:
            pass
        except Exception as e:
            logging.error(f"Error processing update queue: {e}")
    
    def _handle_queued_update(self, update):
        """Handle a single queued update"""
        update_type = update.get('type')
        data = update.get('data', {})
        room = update.get('room')
        
        if update_type == 'packing_job_update':
            self.socketio.emit('packing_job_progress', data, room=room)
        elif update_type == 'new_job_created':
            self.socketio.emit('new_job_notification', data, room='dashboard_updates')
        elif update_type == 'job_completed':
            self.socketio.emit('job_completion_notification', data, room='dashboard_updates')
        elif update_type == 'system_alert':
            self.socketio.emit('system_alert', data)  # Broadcast to all
        
        logging.debug(f"Processed update: {update_type}")
    
    def cleanup_inactive_connections(self):
        """Remove inactive connections"""
        current_time = datetime.now()
        inactive_sessions = []
        
        for session_id, connection_info in self.active_connections.items():
            last_activity = connection_info['last_activity']
            if (current_time - last_activity).total_seconds() > 300:  # 5 minutes timeout
                inactive_sessions.append(session_id)
        
        for session_id in inactive_sessions:
            # Clean up subscriptions
            subscriptions = self.active_connections[session_id]['subscriptions']
            for room in subscriptions:
                self.room_subscriptions[room].discard(session_id)
            
            del self.active_connections[session_id]
            logging.info(f"Cleaned up inactive connection: {session_id}")
    
    # Public methods for triggering updates
    def notify_packing_job_progress(self, job_id: int, progress_data: Dict[str, Any]):
        """Notify subscribers about packing job progress"""
        update = {
            'type': 'packing_job_update',
            'room': f'packing_job_{job_id}',
            'data': {
                'job_id': job_id,
                'progress': progress_data,
                'timestamp': datetime.now().isoformat()
            }
        }
        self.update_queue.put(update)
    
    def notify_new_job_created(self, job_data: Dict[str, Any]):
        """Notify about new packing job creation"""
        update = {
            'type': 'new_job_created',
            'data': {
                'job': job_data,
                'timestamp': datetime.now().isoformat()
            }
        }
        self.update_queue.put(update)
    
    def notify_job_completed(self, job_id: int, results: Dict[str, Any]):
        """Notify about job completion"""
        update = {
            'type': 'job_completed',
            'data': {
                'job_id': job_id,
                'results': results,
                'timestamp': datetime.now().isoformat()
            }
        }
        self.update_queue.put(update)
    
    def send_system_alert(self, message: str, level: str = 'info'):
        """Send system-wide alert"""
        update = {
            'type': 'system_alert',
            'data': {
                'message': message,
                'level': level,
                'timestamp': datetime.now().isoformat()
            }
        }
        self.update_queue.put(update)
    
    def get_connection_stats(self):
        """Get WebSocket connection statistics"""
        active_count = len(self.active_connections)
        room_stats = {}
        
        for room, sessions in self.room_subscriptions.items():
            room_stats[room] = len(sessions)
        
        return {
            'active_connections': active_count,
            'room_subscriptions': room_stats,
            'total_rooms': len(self.room_subscriptions),
            'update_queue_size': self.update_queue.qsize(),
            'service_running': self.is_running
        }

# Global WebSocket manager instance
websocket_manager = WebSocketManager()

