"""
Test startup profiling in development mode
Quick test to verify profiling works before executable testing
"""

from startup_profiler import startup_profiler, log_checkpoint, log_import_time, timed_operation
import time

def test_profiling():
    print("Testing startup profiling system...")
    
    # Test basic checkpoints
    log_checkpoint("TEST_START", "Starting profiling test")
    
    # Test import timing
    import_start = time.time()
    import json
    log_import_time("json", time.time() - import_start)
    
    # Test initialization timing
    with timed_operation("test_initialization"):
        time.sleep(0.1)  # Simulate initialization
    
    # Test component timing
    startup_profiler.log_initialization_time("test_component", 0.05, {
        'component_type': 'test',
        'details': 'test initialization'
    })
    
    log_checkpoint("TEST_COMPLETE", "Profiling test completed")
    
    # Generate report
    print("Generating test report...")
    report = startup_profiler.generate_performance_report()
    
    print(f"Report generated with {len(report['detailed_timeline'])} checkpoints")
    print(f"Total test time: {report['total_startup_time_seconds']:.3f} seconds")
    
    # Print summary
    startup_profiler.print_summary()
    
    return report

if __name__ == "__main__":
    test_profiling()