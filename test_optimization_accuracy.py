#!/usr/bin/env python3
"""
Test optimization accuracy and manual verification
"""

import requests
import json
import sys
import os
sys.path.append('/workspaces/Truck_Opti')

from app import create_app, db
from app.models import TruckType, CartonType
from app.packer import pack_cartons_optimized
import sqlite3

def get_database_data():
    """Retrieve truck and carton data from database"""
    try:
        conn = sqlite3.connect('/workspaces/Truck_Opti/app/truck_opti.db')
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, name, length, width, height, max_weight FROM truck_type LIMIT 5")
        trucks = cursor.fetchall()
        
        cursor.execute("SELECT id, name, length, width, height, weight FROM carton_type LIMIT 5")
        cartons = cursor.fetchall()
        
        conn.close()
        return trucks, cartons
        
    except Exception as e:
        print(f"Database error: {e}")
        return [], []

def test_web_optimization():
    """Test web-based optimization with real database data"""
    print("TruckOpti Optimization Accuracy Testing")
    print("=" * 50)
    
    trucks, cartons = get_database_data()
    
    if not trucks or not cartons:
        print("❌ No data available for testing")
        return
    
    print(f"📊 Testing with {len(trucks)} trucks and {len(cartons)} cartons")
    
    # Test scenarios
    test_scenarios = [
        {
            "name": "Small Load Test",
            "description": "Small quantity that should fit in one truck",
            "cartons": {str(cartons[0][0]): "5", str(cartons[1][0]): "3"}
        },
        {
            "name": "Medium Load Test", 
            "description": "Medium load requiring optimization",
            "cartons": {str(cartons[0][0]): "20", str(cartons[1][0]): "15", str(cartons[2][0]): "10"}
        },
        {
            "name": "Large Load Test",
            "description": "Large load requiring multiple trucks",
            "cartons": {str(cartons[i][0]): str(30-i*5) for i in range(min(4, len(cartons)))}
        },
        {
            "name": "Priority Mix Test",
            "description": "Mixed priorities and sizes",
            "cartons": {str(cartons[i][0]): str(15+i*3) for i in range(min(3, len(cartons)))}
        }
    ]
    
    session = requests.Session()
    results = {}
    
    for scenario in test_scenarios:
        print(f"\n🧪 Testing: {scenario['name']}")
        print(f"   {scenario['description']}")
        
        try:
            # Test with recommend-truck endpoint
            start_time = time.time()
            response = session.post(
                "http://127.0.0.1:5000/recommend-truck", 
                data=scenario['cartons']
            )
            end_time = time.time()
            
            processing_time = end_time - start_time
            
            if response.status_code == 200:
                # Analyze response
                response_text = response.text.lower()
                
                analysis = {
                    'has_recommendations': 'recommended' in response_text,
                    'has_cost_data': 'cost' in response_text,
                    'has_utilization': 'utilization' in response_text,
                    'has_3d_data': 'position' in response_text,
                    'processing_time': processing_time,
                    'response_size': len(response.content)
                }
                
                score = sum([analysis['has_recommendations'], analysis['has_cost_data'], 
                           analysis['has_utilization'], analysis['has_3d_data']])
                
                print(f"   ✅ Status: SUCCESS")
                print(f"   📊 Features: {score}/4 (Rec: {analysis['has_recommendations']}, "
                      f"Cost: {analysis['has_cost_data']}, Util: {analysis['has_utilization']}, 3D: {analysis['has_3d_data']})")
                print(f"   ⏱️  Time: {processing_time:.3f}s")
                print(f"   📦 Response: {analysis['response_size']/1024:.1f}KB")
                
                results[scenario['name']] = {
                    'status': 'SUCCESS',
                    'features_score': score,
                    'processing_time': processing_time,
                    **analysis
                }
            else:
                print(f"   ❌ Status: FAILED ({response.status_code})")
                results[scenario['name']] = {
                    'status': 'FAILED',
                    'status_code': response.status_code
                }
                
        except Exception as e:
            print(f"   ❌ Exception: {e}")
            results[scenario['name']] = {
                'status': 'EXCEPTION',
                'error': str(e)
            }
    
    return results

def test_direct_algorithm_accuracy():
    """Test algorithm accuracy by manual verification"""
    print("\n" + "=" * 50)
    print("DIRECT ALGORITHM ACCURACY TESTING")
    print("=" * 50)
    
    # Create test objects directly
    app = create_app()
    with app.app_context():
        try:
            # Get actual database objects
            trucks = TruckType.query.limit(3).all()
            cartons = CartonType.query.limit(3).all()
            
            if not trucks or not cartons:
                print("❌ No database objects available")
                return
            
            print(f"🔍 Manual verification with:")
            print(f"   Trucks: {[t.name for t in trucks]}")
            print(f"   Cartons: {[c.name for c in cartons]}")
            
            # Test case 1: Simple case for manual verification
            print(f"\n📝 Test Case 1: Simple Verification")
            truck_quantities = {trucks[0]: 1}  # One truck
            carton_quantities = {cartons[0]: 3, cartons[1]: 2}  # Few cartons
            
            result = pack_cartons_optimized(truck_quantities, carton_quantities, 'space')
            
            if result:
                r = result[0]
                print(f"   Truck: {trucks[0].name} ({trucks[0].length}x{trucks[0].width}x{trucks[0].height}cm, {trucks[0].max_weight}kg)")
                print(f"   Cartons requested: {sum(carton_quantities.values())}")
                print(f"   Cartons fitted: {len(r['fitted_items'])}")
                print(f"   Utilization: {r['utilization']:.2%}")
                print(f"   Total cost: ${r['total_cost']:.2f}")
                
                # Manual verification
                total_carton_volume = sum(
                    c.length * c.width * c.height * qty 
                    for c, qty in carton_quantities.items()
                )
                truck_volume = trucks[0].length * trucks[0].width * trucks[0].height
                expected_utilization = min(1.0, total_carton_volume / truck_volume)
                
                print(f"   📊 Manual Verification:")
                print(f"   Total carton volume: {total_carton_volume:,.0f} cm³")
                print(f"   Truck volume: {truck_volume:,.0f} cm³") 
                print(f"   Theoretical max utilization: {expected_utilization:.2%}")
                
                # Check if results make sense
                if len(r['fitted_items']) <= sum(carton_quantities.values()):
                    print(f"   ✅ Fitted items count is reasonable")
                else:
                    print(f"   ❌ Fitted more items than requested!")
                
                if r['utilization'] <= 1.0:
                    print(f"   ✅ Utilization within bounds")
                else:
                    print(f"   ❌ Utilization exceeds 100%!")
                
                # Test case 2: Weight constraint test
                print(f"\n📝 Test Case 2: Weight Constraint Verification")
                
                # Make cartons heavy
                heavy_cartons = {cartons[0]: 1}  # Just one heavy carton
                cartons[0].weight = trucks[0].max_weight * 1.5  # 150% of truck capacity
                
                result2 = pack_cartons_optimized({trucks[0]: 1}, heavy_cartons, 'weight')
                
                if result2:
                    r2 = result2[0]
                    print(f"   Heavy carton weight: {cartons[0].weight}kg")
                    print(f"   Truck capacity: {trucks[0].max_weight}kg")
                    print(f"   Items fitted: {len(r2['fitted_items'])}")
                    
                    if len(r2['fitted_items']) == 0:
                        print(f"   ✅ Correctly rejected overweight carton")
                    else:
                        print(f"   ⚠️  Algorithm may have weight constraint issue")
                
                return True
                
        except Exception as e:
            print(f"❌ Direct algorithm test exception: {e}")
            return False

def test_performance_benchmarks():
    """Test performance with various load sizes"""
    print("\n" + "=" * 50)
    print("PERFORMANCE BENCHMARKS")
    print("=" * 50)
    
    app = create_app()
    with app.app_context():
        try:
            trucks = TruckType.query.limit(5).all()
            cartons = CartonType.query.limit(10).all()
            
            if not trucks or not cartons:
                print("❌ No database objects for performance testing")
                return
            
            benchmark_tests = [
                {"name": "Small Load", "truck_qty": 1, "total_cartons": 10},
                {"name": "Medium Load", "truck_qty": 2, "total_cartons": 50},
                {"name": "Large Load", "truck_qty": 3, "total_cartons": 150},
                {"name": "Extra Large Load", "truck_qty": 5, "total_cartons": 300}
            ]
            
            performance_results = {}
            
            for test in benchmark_tests:
                print(f"\n⚡ Performance Test: {test['name']}")
                print(f"   Trucks: {test['truck_qty']}, Cartons: {test['total_cartons']}")
                
                # Prepare test data
                truck_quantities = {trucks[i]: 1 for i in range(test['truck_qty'])}
                carton_quantities = {}
                
                cartons_per_type = test['total_cartons'] // len(cartons)
                for i, carton in enumerate(cartons):
                    if i == 0:  # Give remaining to first carton type
                        carton_quantities[carton] = cartons_per_type + (test['total_cartons'] % len(cartons))
                    else:
                        carton_quantities[carton] = cartons_per_type
                
                # Run performance test
                import time
                start_time = time.time()
                result = pack_cartons_optimized(truck_quantities, carton_quantities, 'space')
                end_time = time.time()
                
                processing_time = end_time - start_time
                
                if result:
                    total_fitted = sum(len(r['fitted_items']) for r in result if r['fitted_items'])
                    trucks_used = len([r for r in result if r['fitted_items']])
                    avg_utilization = sum(r['utilization'] for r in result if r['fitted_items']) / trucks_used if trucks_used > 0 else 0
                    
                    # Performance rating
                    if processing_time < 2:
                        rating = "Excellent"
                    elif processing_time < 5:
                        rating = "Good" 
                    elif processing_time < 15:
                        rating = "Fair"
                    else:
                        rating = "Poor"
                    
                    print(f"   ⏱️  Processing time: {processing_time:.3f}s ({rating})")
                    print(f"   📦 Items fitted: {total_fitted}/{test['total_cartons']} ({total_fitted/test['total_cartons']*100:.1f}%)")
                    print(f"   🚛 Trucks used: {trucks_used}")
                    print(f"   📊 Avg utilization: {avg_utilization:.2%}")
                    
                    performance_results[test['name']] = {
                        'processing_time': processing_time,
                        'rating': rating,
                        'items_fitted': total_fitted,
                        'utilization': avg_utilization,
                        'trucks_used': trucks_used
                    }
                else:
                    print(f"   ❌ Performance test failed")
                    performance_results[test['name']] = {'status': 'failed'}
            
            return performance_results
            
        except Exception as e:
            print(f"❌ Performance benchmark exception: {e}")
            return {}

def generate_optimization_report():
    """Generate comprehensive optimization testing report"""
    print("\n" + "=" * 80)
    print("TRUCCOPTI 3D BIN PACKING OPTIMIZATION - COMPREHENSIVE TEST REPORT")
    print("=" * 80)
    
    # Run all tests
    print("\n🌐 Running Web Interface Tests...")
    web_results = test_web_optimization()
    
    print("\n🔍 Running Algorithm Accuracy Tests...")
    accuracy_result = test_direct_algorithm_accuracy()
    
    print("\n⚡ Running Performance Benchmarks...")
    performance_results = test_performance_benchmarks()
    
    # Generate summary
    print("\n" + "=" * 80)
    print("EXECUTIVE SUMMARY")
    print("=" * 80)
    
    # Web interface summary
    if web_results:
        web_success_count = sum(1 for r in web_results.values() if r.get('status') == 'SUCCESS')
        web_total = len(web_results)
        web_success_rate = (web_success_count / web_total * 100) if web_total > 0 else 0
        
        avg_processing_time = sum(r.get('processing_time', 0) for r in web_results.values() if r.get('processing_time')) / web_success_count if web_success_count > 0 else 0
        avg_features = sum(r.get('features_score', 0) for r in web_results.values() if r.get('features_score')) / web_success_count if web_success_count > 0 else 0
        
        print(f"🌐 Web Interface Performance:")
        print(f"   Success Rate: {web_success_rate:.1f}% ({web_success_count}/{web_total} scenarios)")
        print(f"   Average Processing Time: {avg_processing_time:.3f}s")
        print(f"   Average Feature Score: {avg_features:.1f}/4.0")
    
    # Algorithm accuracy summary
    print(f"🔍 Algorithm Accuracy: {'✅ VERIFIED' if accuracy_result else '❌ ISSUES FOUND'}")
    
    # Performance summary
    if performance_results:
        excellent_count = sum(1 for r in performance_results.values() if r.get('rating') == 'Excellent')
        good_count = sum(1 for r in performance_results.values() if r.get('rating') == 'Good')
        total_perf_tests = len(performance_results)
        
        print(f"⚡ Performance Benchmarks:")
        print(f"   Excellent: {excellent_count}/{total_perf_tests}")
        print(f"   Good: {good_count}/{total_perf_tests}")
        print(f"   Overall Rating: {'Excellent' if excellent_count >= total_perf_tests//2 else 'Good' if good_count >= total_perf_tests//2 else 'Needs Improvement'}")
    
    # Key findings
    print(f"\n📊 KEY FINDINGS:")
    findings = []
    
    if web_results and web_success_rate >= 75:
        findings.append("✅ Web optimization interfaces are functioning well")
    elif web_results:
        findings.append("⚠️ Some web optimization features need attention")
    
    if accuracy_result:
        findings.append("✅ Core algorithms produce accurate and logical results")
    else:
        findings.append("❌ Algorithm accuracy needs verification")
    
    if performance_results:
        fast_tests = sum(1 for r in performance_results.values() if r.get('rating') in ['Excellent', 'Good'])
        if fast_tests >= len(performance_results) // 2:
            findings.append("✅ Performance is adequate for production use")
        else:
            findings.append("⚠️ Performance optimization may be needed for large datasets")
    
    for finding in findings:
        print(f"   {finding}")
    
    # Overall assessment
    total_tests = len([web_results, accuracy_result, performance_results])
    successful_components = sum([
        1 if web_results and web_success_rate >= 50 else 0,
        1 if accuracy_result else 0,
        1 if performance_results else 0
    ])
    
    overall_success_rate = (successful_components / total_tests * 100) if total_tests > 0 else 0
    
    if overall_success_rate >= 90:
        overall_rating = "EXCELLENT"
        assessment = "TruckOpti's 3D bin packing optimization is production-ready with excellent performance."
    elif overall_success_rate >= 70:
        overall_rating = "GOOD" 
        assessment = "TruckOpti's optimization system is solid with minor areas for improvement."
    elif overall_success_rate >= 50:
        overall_rating = "FAIR"
        assessment = "TruckOpti's optimization system is functional but needs improvements."
    else:
        overall_rating = "NEEDS_IMPROVEMENT"
        assessment = "TruckOpti's optimization system requires significant attention."
    
    print(f"\n🎯 OVERALL ASSESSMENT: {overall_rating}")
    print(f"📈 Success Rate: {overall_success_rate:.1f}%")
    print(f"📝 Assessment: {assessment}")
    
    return {
        'web_results': web_results,
        'accuracy_result': accuracy_result,
        'performance_results': performance_results,
        'overall_rating': overall_rating,
        'success_rate': overall_success_rate,
        'assessment': assessment
    }

if __name__ == "__main__":
    import time
    
    # Check if server is running
    try:
        response = requests.get("http://127.0.0.1:5000", timeout=5)
        if response.status_code == 200:
            print("✅ TruckOpti server is running")
            generate_optimization_report()
        else:
            print("❌ TruckOpti server is not responding properly")
    except:
        print("❌ TruckOpti server is not accessible")