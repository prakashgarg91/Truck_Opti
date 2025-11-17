"""
TruckOpti Microsoft - Main Entry Point

This is the main entry point for the TruckOpti Microsoft application,
providing both command-line and web interface options.
"""

import sys
import os
import argparse
import logging
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from web.app import create_app
from core.microsoft import WindowsOptimizer
from core.optimization import OptimizationEngine


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="TruckOpti Microsoft - Advanced Truck Optimization System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py web                    # Start web interface
  python main.py web --port 8080        # Start web interface on port 8080
  python main.py optimize --help        # Show optimization options
  python main.py benchmark --help       # Show benchmarking options
        """
    )
    
    parser.add_argument(
        '--version', 
        action='version', 
        version='TruckOpti Microsoft 1.0.0'
    )
    
    parser.add_argument(
        '--debug', 
        action='store_true',
        help='Enable debug mode'
    )
    
    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Set logging level'
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Web command
    web_parser = subparsers.add_parser('web', help='Start web interface')
    web_parser.add_argument(
        '--host',
        default='0.0.0.0',
        help='Host to bind to (default: 0.0.0.0)'
    )
    web_parser.add_argument(
        '--port',
        type=int,
        default=5000,
        help='Port to bind to (default: 5000)'
    )
    web_parser.add_argument(
        '--no-windows-optimization',
        action='store_true',
        help='Disable Windows optimizations'
    )
    
    # Optimize command
    optimize_parser = subparsers.add_parser('optimize', help='Run optimization from command line')
    optimize_parser.add_argument(
        '--cartons',
        required=True,
        help='CSV file with cartons data'
    )
    optimize_parser.add_argument(
        '--trucks',
        required=True,
        help='CSV file with trucks data'
    )
    optimize_parser.add_argument(
        '--algorithm',
        default='l_aff',
        choices=['l_aff', 'skyline_bottom_left', 'first_fit_decreasing', 'best_fit_decreasing'],
        help='Algorithm to use (default: l_aff)'
    )
    optimize_parser.add_argument(
        '--output',
        help='Output file for results (default: print to console)'
    )
    optimize_parser.add_argument(
        '--max-iterations',
        type=int,
        default=1000,
        help='Maximum iterations (default: 1000)'
    )
    
    # Benchmark command
    benchmark_parser = subparsers.add_parser('benchmark', help='Benchmark algorithms')
    benchmark_parser.add_argument(
        '--cartons',
        type=int,
        default=50,
        help='Number of test cartons (default: 50)'
    )
    benchmark_parser.add_argument(
        '--trucks',
        type=int,
        default=5,
        help='Number of test trucks (default: 5)'
    )
    benchmark_parser.add_argument(
        '--iterations',
        type=int,
        default=3,
        help='Iterations per algorithm (default: 3)'
    )
    benchmark_parser.add_argument(
        '--output',
        help='Output file for benchmark results (default: print to console)'
    )
    
    # System info command
    system_parser = subparsers.add_parser('system', help='Show system information')
    system_parser.add_argument(
        '--optimizations',
        action='store_true',
        help='Show Windows optimizations status'
    )
    
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        if args.command == 'web':
            run_web_interface(args)
        elif args.command == 'optimize':
            run_optimization(args)
        elif args.command == 'benchmark':
            run_benchmark(args)
        elif args.command == 'system':
            show_system_info(args)
            
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Command failed: {e}")
        if args.debug:
            raise
        sys.exit(1)


def run_web_interface(args):
    """Run the web interface."""
    print("🚀 Starting TruckOpti Microsoft Web Interface...")
    
    # Apply Windows optimizations if not disabled
    if not args.no_windows_optimization:
        print("🔧 Applying Windows optimizations...")
        with WindowsOptimizer() as windows_optimizer:
            result = windows_optimizer.optimize_for_truck_optimization()
            if result['success']:
                print("✅ Windows optimizations applied successfully")
                for opt in result['optimizations']:
                    print(f"   • {opt}")
            else:
                print("⚠️  Some Windows optimizations failed:")
                for error in result['errors']:
                    print(f"   • {error}")
    
    # Create and configure app
    app = create_app({
        'DEBUG': args.debug,
        'TESTING': False
    })
    
    # Add Windows optimizer to app if not disabled
    if not args.no_windows_optimization:
        try:
            app.windows_optimizer = WindowsOptimizer()
        except Exception as e:
            print(f"⚠️  Could not initialize Windows optimizer: {e}")
    
    print(f"🌐 Web interface will be available at: http://{args.host}:{args.port}")
    print("📝 API documentation available at: /api/health")
    print("🛑 Press Ctrl+C to stop the server")
    
    # Start the web server
    app.run(
        host=args.host,
        port=args.port,
        debug=args.debug,
        threaded=True
    )


def run_optimization(args):
    """Run optimization from command line."""
    print("🔧 Running TruckOpti Optimization...")
    
    # This would implement command-line optimization
    # For now, show that the interface is ready
    print(f"📁 Cartons file: {args.cartons}")
    print(f"🚛 Trucks file: {args.trucks}")
    print(f"🧮 Algorithm: {args.algorithm}")
    print(f"🔄 Max iterations: {args.max_iterations}")
    
    print("⚠️  Command-line optimization not yet implemented")
    print("💡 Use the web interface for full optimization capabilities")


def run_benchmark(args):
    """Run algorithm benchmark."""
    print("🧪 Running Algorithm Benchmark...")
    
    print(f"📦 Test cartons: {args.cartons}")
    print(f"🚛 Test trucks: {args.trucks}")
    print(f"🔄 Iterations per algorithm: {args.iterations}")
    
    # This would implement actual benchmarking
    print("⚠️  Algorithm benchmarking not yet implemented")
    print("💡 Use the web interface at /api/benchmark for full benchmarking")


def show_system_info(args):
    """Show system information."""
    print("💻 TruckOpti Microsoft System Information")
    print("=" * 50)
    
    if args.optimizations:
        print("🔧 Windows Optimizations Status:")
        try:
            with WindowsOptimizer() as windows_optimizer:
                info = windows_optimizer.get_windows_system_info()
                print(f"   Platform: {info.get('platform', 'Unknown')}")
                print(f"   Available: {info.get('available', False)}")
                if 'memory' in info:
                    print(f"   Memory: {info['memory']['total_gb']} GB total, "
                          f"{info['memory']['available_gb']} GB available")
                if 'cpu' in info:
                    print(f"   CPU: {info['cpu']['count_physical']} physical cores, "
                          f"{info['cpu']['count_logical']} logical cores")
        except Exception as e:
            print(f"   ❌ Failed to get Windows info: {e}")
    else:
        print("💡 Use --optimizations to see Windows optimization status")
    
    print("\n🧮 Optimization Engine Status:")
    try:
        engine = OptimizationEngine()
        print(f"   Available algorithms: {len(engine.algorithms)}")
        print(f"   Max workers: {engine.max_workers}")
        print(f"   Parallel processing: {engine.enable_parallel_processing}")
        for name, algorithm in engine.algorithms.items():
            print(f"   • {name}: {algorithm.name}")
    except Exception as e:
        print(f"   ❌ Failed to get optimization engine info: {e}")


if __name__ == '__main__':
    main()