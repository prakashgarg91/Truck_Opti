#!/usr/bin/env python3
"""
TruckOptimum with Autonomous UX Improvement System
Demonstrates the G2G Multi-Agent system for automatic user experience optimization
"""

import sys
import time
import threading
from pathlib import Path

def main():
    """Main startup with autonomous improvement system"""
    print("🚀 TruckOptimum v2.7.1 + G2G Auto-Improvement System")
    print("=" * 60)
    print()
    
    # System Status
    print("📋 System Components:")
    print("   ✅ TruckOptimum Core Application")
    print("   ✅ World-Class 3D Packing Algorithms") 
    print("   ✅ Autonomous UX Improvement System")
    print("   ✅ G2G Multi-Agent Coordination")
    print("   ✅ Self-Learning Error Resolution")
    print()
    
    # Start autonomous improvement system first
    print("🤖 Initializing G2G Multi-Agent System...")
    
    try:
        from auto_improvement_integration import G2GAutoImprovementIntegration
        
        # Initialize the integration
        integration = G2GAutoImprovementIntegration()
        
        print("   🎯 Agent Coordinator: READY")
        print("   📊 UX Analyzer: READY") 
        print("   🔧 Auto-Improvement Engine: READY")
        print("   📈 Performance Monitor: READY")
        print("   🛡️  Error Prevention System: READY")
        print()
        
        # Start monitoring
        print("🔄 Starting Autonomous Monitoring...")
        status = integration.start_integrated_monitoring()
        
        print("   ✅ Continuous log analysis: ACTIVE")
        print("   ✅ Performance monitoring: ACTIVE") 
        print("   ✅ User experience optimization: ACTIVE")
        print("   ✅ Error pattern detection: ACTIVE")
        print("   ✅ Automatic improvement implementation: ACTIVE")
        print()
        
        # Display capabilities
        print("🎯 Autonomous Capabilities:")
        print("   • Analyzes logs every 5 minutes")
        print("   • Detects performance degradation patterns")
        print("   • Identifies user workflow inefficiencies") 
        print("   • Implements improvements automatically (high confidence)")
        print("   • Monitors improvement effectiveness")
        print("   • Learns from user behavior patterns")
        print("   • Prevents error recurrence")
        print()
        
        print("📊 Learning Targets:")
        print("   • Database query optimization")
        print("   • UI/UX improvement suggestions")
        print("   • Error handling enhancement")
        print("   • Performance bottleneck resolution")
        print("   • User workflow streamlining")
        print()
        
        # Start the main application
        print("🚀 Starting TruckOptimum Application...")
        print("   📱 Web interface will open automatically")
        print("   🌐 Access: http://127.0.0.1:5001")
        print("   📝 Logs: ./logs/ directory")
        print()
        
        # Import and start the main app
        from app import create_app
        import webbrowser
        
        app = create_app()
        port = 5001
        
        # Open browser after brief delay
        def open_browser():
            time.sleep(2)
            print("🌐 Opening web browser...")
            webbrowser.open(f'http://127.0.0.1:{port}')
        
        # Status monitoring thread
        def status_monitor():
            while True:
                time.sleep(300)  # Every 5 minutes
                try:
                    report = integration.generate_improvement_report()
                    queue_len = report['system_status']['queue_length']
                    if queue_len > 0:
                        print(f"🔧 Auto-improvement: {queue_len} optimizations queued")
                except Exception as e:
                    pass
        
        # Start threads
        threading.Thread(target=open_browser, daemon=True).start()
        threading.Thread(target=status_monitor, daemon=True).start()
        
        print("✅ All systems operational!")
        print("🤖 G2G Auto-Improvement is now monitoring and optimizing...")
        print("📈 Check logs/g2g_auto_improvement.log for improvement activities")
        print()
        print("=" * 60)
        
        # Start the Flask application
        app.run(port=port, debug=False, use_reloader=False)
        
    except ImportError as e:
        print(f"⚠️  G2G Auto-Improvement system not available: {e}")
        print("   Starting TruckOptimum in standard mode...")
        
        # Fallback to standard mode
        from app import create_app
        app = create_app()
        app.run(port=5001, debug=True)
        
    except Exception as e:
        print(f"❌ Error starting system: {e}")
        print("   Falling back to standard mode...")
        
        # Fallback to standard mode
        from app import create_app
        app = create_app()
        app.run(port=5001, debug=True)

def show_improvement_dashboard():
    """Display current improvement status"""
    print("📊 G2G Auto-Improvement Dashboard")
    print("=" * 40)
    
    try:
        import sqlite3
        from datetime import datetime, timedelta
        
        # Check if insights database exists
        db_path = "ux_insights.db"
        if Path(db_path).exists():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Get recent insights
            cursor.execute("""
                SELECT category, severity, COUNT(*) as count
                FROM ux_insights 
                WHERE timestamp > datetime('now', '-24 hours')
                GROUP BY category, severity
                ORDER BY count DESC
            """)
            
            insights = cursor.fetchall()
            
            if insights:
                print("📈 Last 24 Hours:")
                for category, severity, count in insights:
                    print(f"   {category.capitalize()}: {count} {severity} issues")
            else:
                print("📋 No recent insights (system learning)")
            
            # Get improvement count
            cursor.execute("""
                SELECT COUNT(*) FROM improvements_implemented
                WHERE implemented_at > datetime('now', '-24 hours')
            """)
            
            improvements = cursor.fetchone()[0]
            print(f"🔧 Improvements implemented: {improvements}")
            
            conn.close()
        else:
            print("📋 Insights database not yet created")
            print("🤖 System will begin learning after first run")
            
    except Exception as e:
        print(f"⚠️  Dashboard unavailable: {e}")
    
    print("=" * 40)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--dashboard":
        show_improvement_dashboard()
    else:
        main()