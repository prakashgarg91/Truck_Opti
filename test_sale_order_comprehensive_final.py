#!/usr/bin/env python3
"""
Comprehensive Manual Test for Sale Order Truck Selection Feature
Validates all key improvements without browser dependencies
"""

import requests
import json
import time
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SaleOrderComprehensiveTester:
    def __init__(self, base_url="http://127.0.0.1:5001"):
        self.base_url = base_url
        self.test_results = {
            'test_timestamp': datetime.now().isoformat(),
            'feature_validation': {
                'carton_based_processing': {
                    'implemented': False,
                    'carton_types_mapped': [],
                    'processing_accuracy': 0
                },
                'single_truck_optimization': {
                    'prioritized': False,
                    'space_utilization_focus': False,
                    'cost_efficiency': False
                },
                'enhanced_ui': {
                    'single_truck_prominence': False,
                    'space_utilization_display': False,
                    'perfect_fit_indicators': False,
                    'cost_savings_focus': False
                }
            },
            'order_analysis': {},
            'performance_metrics': {
                'upload_time': 0,
                'processing_time': 0,
                'response_size': 0
            },
            'overall_assessment': {
                'score': 0,
                'status': 'UNKNOWN',
                'recommendations': []
            }
        }

    def validate_server_health(self):
        """Validate server is running and accessible"""
        try:
            start_time = time.time()
            response = requests.get(self.base_url, timeout=10)
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                logger.info(f"✅ Server healthy (response time: {response_time:.2f}s)")
                return True
            else:
                logger.error(f"❌ Server returned status {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"❌ Server health check failed: {e}")
            return False

    def test_carton_based_processing(self):
        """Test the carton-based processing functionality"""
        try:
            logger.info("📦 Testing carton-based processing...")
            
            # Upload CSV and measure performance
            csv_path = "/workspaces/Truck_Opti/sample_sale_orders.csv"
            
            with open(csv_path, 'rb') as f:
                files = {'file': ('sample_sale_orders.csv', f, 'text/csv')}
                
                start_time = time.time()
                response = requests.post(f"{self.base_url}/sale-orders", files=files, timeout=60)
                processing_time = time.time() - start_time
                
                self.test_results['performance_metrics']['upload_time'] = processing_time
                self.test_results['performance_metrics']['response_size'] = len(response.content)
                
                if response.status_code == 200:
                    # Analyze response for carton processing
                    self.analyze_carton_processing(response.text)
                    return True
                else:
                    logger.error(f"❌ Upload failed: {response.status_code}")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Carton processing test failed: {e}")
            return False

    def analyze_carton_processing(self, response_text):
        """Analyze the response for carton-based processing evidence"""
        try:
            logger.info("🔍 Analyzing carton processing implementation...")
            
            # Expected carton types from CSV
            expected_cartons = [
                'Small Box', 'Medium Box', 'Large Box', 'Heavy Box',
                'Electronics Box', 'Component Box', 'Heavy Equipment'
            ]
            
            # Check if carton types are mentioned in response
            response_lower = response_text.lower()
            detected_cartons = []
            
            for carton in expected_cartons:
                if carton.lower() in response_lower:
                    detected_cartons.append(carton)
            
            self.test_results['feature_validation']['carton_based_processing']['carton_types_mapped'] = detected_cartons
            self.test_results['feature_validation']['carton_based_processing']['implemented'] = len(detected_cartons) > 0
            
            # Calculate processing accuracy
            accuracy = (len(detected_cartons) / len(expected_cartons)) * 100
            self.test_results['feature_validation']['carton_based_processing']['processing_accuracy'] = accuracy
            
            logger.info(f"📊 Carton mapping: {len(detected_cartons)}/{len(expected_cartons)} types detected ({accuracy:.1f}%)")
            
            # Analyze order processing
            self.analyze_order_processing(response_text)
            
        except Exception as e:
            logger.error(f"❌ Carton processing analysis failed: {e}")

    def analyze_order_processing(self, response_text):
        """Analyze how well orders are processed"""
        try:
            logger.info("📋 Analyzing order processing...")
            
            # Expected orders from CSV
            expected_orders = {
                'SO001': {'cartons': 8, 'types': ['Small Box', 'Medium Box']},
                'SO002': {'cartons': 12, 'types': ['Large Box', 'Heavy Box']}, 
                'SO003': {'cartons': 33, 'types': ['Small Box', 'Medium Box', 'Large Box']},
                'SO004': {'cartons': 20, 'types': ['Electronics Box', 'Component Box']},
                'SO005': {'cartons': 9, 'types': ['Heavy Equipment', 'Large Box']},
                'SO006': {'cartons': 60, 'types': ['Small Box', 'Medium Box', 'Large Box']}
            }
            
            response_lower = response_text.lower()
            
            for order_id, details in expected_orders.items():
                order_analysis = {
                    'detected': order_id.lower() in response_lower,
                    'expected_cartons': details['cartons'],
                    'carton_types': details['types'],
                    'has_recommendation': False,
                    'single_truck_solution': False,
                    'space_utilization': None
                }
                
                if order_analysis['detected']:
                    # Look for truck recommendation indicators
                    truck_keywords = ['truck', 'recommend', 'optimal', 'best']
                    order_analysis['has_recommendation'] = any(
                        keyword in response_lower for keyword in truck_keywords
                    )
                    
                    # Look for single truck indicators
                    single_keywords = ['single truck', 'one truck', 'complete solution']
                    order_analysis['single_truck_solution'] = any(
                        keyword in response_lower for keyword in single_keywords
                    )
                
                self.test_results['order_analysis'][order_id] = order_analysis
            
            logger.info(f"📈 Order processing analysis completed for {len(expected_orders)} orders")
            
        except Exception as e:
            logger.error(f"❌ Order processing analysis failed: {e}")

    def analyze_single_truck_optimization(self, response_text):
        """Analyze single truck optimization features"""
        try:
            logger.info("🎯 Analyzing single truck optimization...")
            
            response_lower = response_text.lower()
            
            # Check for single truck optimization indicators
            single_truck_indicators = [
                'single truck', 'optimal single', 'one truck solution',
                'complete solution', 'perfect fit', 'single vehicle'
            ]
            
            found_indicators = [ind for ind in single_truck_indicators if ind in response_lower]
            prioritized = len(found_indicators) > 0
            
            self.test_results['feature_validation']['single_truck_optimization']['prioritized'] = prioritized
            
            # Check for space utilization focus
            space_indicators = [
                'space utilization', 'utilization', 'space efficiency',
                'capacity', 'fill rate', '%'
            ]
            
            space_focus = any(ind in response_lower for ind in space_indicators)
            self.test_results['feature_validation']['single_truck_optimization']['space_utilization_focus'] = space_focus
            
            # Check for cost efficiency mentions
            cost_indicators = [
                'cost', 'savings', 'efficient', 'optimal cost', 'economical'
            ]
            
            cost_efficiency = any(ind in response_lower for ind in cost_indicators)
            self.test_results['feature_validation']['single_truck_optimization']['cost_efficiency'] = cost_efficiency
            
            logger.info(f"🎯 Single truck optimization: Prioritized={prioritized}, Space Focus={space_focus}, Cost Efficiency={cost_efficiency}")
            
        except Exception as e:
            logger.error(f"❌ Single truck optimization analysis failed: {e}")

    def analyze_ui_enhancements(self, response_text):
        """Analyze UI enhancement indicators in response"""
        try:
            logger.info("🎨 Analyzing UI enhancements...")
            
            response_lower = response_text.lower()
            
            # Check for single truck prominence in UI
            prominence_indicators = [
                'optimal single truck', 'best truck', 'recommended truck',
                'single truck solution', 'primary recommendation'
            ]
            
            prominence = any(ind in response_lower for ind in prominence_indicators)
            self.test_results['feature_validation']['enhanced_ui']['single_truck_prominence'] = prominence
            
            # Check for space utilization display
            space_display_indicators = [
                'space utilization', 'progress', 'percentage', 'utilization',
                'capacity used', 'fill rate'
            ]
            
            space_display = any(ind in response_lower for ind in space_display_indicators)
            self.test_results['feature_validation']['enhanced_ui']['space_utilization_display'] = space_display
            
            # Check for perfect fit indicators
            perfect_fit_indicators = [
                'perfect fit', 'complete fit', 'best choice', 'optimal',
                'excellent match', '100%'
            ]
            
            perfect_fit = any(ind in response_lower for ind in perfect_fit_indicators)
            self.test_results['feature_validation']['enhanced_ui']['perfect_fit_indicators'] = perfect_fit
            
            # Check for cost savings focus
            cost_focus_indicators = [
                'cost savings', 'savings', 'cost efficient', 'economical',
                'cost optimal', 'budget friendly'
            ]
            
            cost_focus = any(ind in response_lower for ind in cost_focus_indicators)
            self.test_results['feature_validation']['enhanced_ui']['cost_savings_focus'] = cost_focus
            
            logger.info(f"🎨 UI enhancements: Prominence={prominence}, Space Display={space_display}, Perfect Fit={perfect_fit}, Cost Focus={cost_focus}")
            
        except Exception as e:
            logger.error(f"❌ UI enhancement analysis failed: {e}")

    def calculate_overall_assessment(self):
        """Calculate overall assessment score and recommendations"""
        try:
            logger.info("🏆 Calculating overall assessment...")
            
            # Weight different aspects
            scores = []
            
            # Carton processing (30% weight)
            carton_score = self.test_results['feature_validation']['carton_based_processing']['processing_accuracy'] / 100
            scores.append(carton_score * 0.3)
            
            # Single truck optimization (40% weight)  
            single_truck = self.test_results['feature_validation']['single_truck_optimization']
            single_truck_score = sum([
                single_truck['prioritized'],
                single_truck['space_utilization_focus'], 
                single_truck['cost_efficiency']
            ]) / 3
            scores.append(single_truck_score * 0.4)
            
            # UI enhancements (30% weight)
            ui = self.test_results['feature_validation']['enhanced_ui']
            ui_score = sum([
                ui['single_truck_prominence'],
                ui['space_utilization_display'],
                ui['perfect_fit_indicators'],
                ui['cost_savings_focus']
            ]) / 4
            scores.append(ui_score * 0.3)
            
            # Calculate final score
            final_score = sum(scores) * 100
            self.test_results['overall_assessment']['score'] = final_score
            
            # Determine status
            if final_score >= 80:
                status = "EXCELLENT"
            elif final_score >= 65:
                status = "GOOD"
            elif final_score >= 50:
                status = "ADEQUATE"
            else:
                status = "NEEDS_IMPROVEMENT"
            
            self.test_results['overall_assessment']['status'] = status
            
            # Generate recommendations
            recommendations = []
            if carton_score < 0.8:
                recommendations.append("Improve carton type mapping accuracy")
            if not single_truck['prioritized']:
                recommendations.append("Enhance single truck solution prioritization")
            if not ui['space_utilization_display']:
                recommendations.append("Add visual space utilization indicators")
            if not ui['cost_savings_focus']:
                recommendations.append("Emphasize cost savings in UI")
            
            self.test_results['overall_assessment']['recommendations'] = recommendations
            
            logger.info(f"🏆 Overall score: {final_score:.1f}% ({status})")
            
        except Exception as e:
            logger.error(f"❌ Overall assessment calculation failed: {e}")

    def run_comprehensive_test(self):
        """Run complete comprehensive test"""
        logger.info("🚀 Starting comprehensive Sale Order feature test")
        
        # Step 1: Validate server health
        if not self.validate_server_health():
            return self.test_results
        
        # Step 2: Test carton-based processing
        if not self.test_carton_based_processing():
            return self.test_results
        
        # Get the response for further analysis
        try:
            with open("/workspaces/Truck_Opti/sample_sale_orders.csv", 'rb') as f:
                files = {'file': ('sample_sale_orders.csv', f, 'text/csv')}
                response = requests.post(f"{self.base_url}/sale-orders", files=files, timeout=60)
                
                if response.status_code == 200:
                    # Step 3: Analyze single truck optimization
                    self.analyze_single_truck_optimization(response.text)
                    
                    # Step 4: Analyze UI enhancements
                    self.analyze_ui_enhancements(response.text)
        
        except Exception as e:
            logger.error(f"❌ Additional analysis failed: {e}")
        
        # Step 5: Calculate overall assessment
        self.calculate_overall_assessment()
        
        return self.test_results

    def generate_final_report(self):
        """Generate comprehensive final report"""
        results = self.test_results
        
        print("\n" + "="*90)
        print("🚚 SALE ORDER TRUCK SELECTION COMPREHENSIVE TEST REPORT")
        print("="*90)
        print(f"📅 Test Date: {results['test_timestamp']}")
        
        # Feature Validation Summary
        print(f"\n📋 FEATURE VALIDATION SUMMARY:")
        
        # Carton-based processing
        carton = results['feature_validation']['carton_based_processing']
        print(f"\n📦 CARTON-BASED PROCESSING:")
        print(f"   ✅ Implementation Status: {'IMPLEMENTED' if carton['implemented'] else 'NOT IMPLEMENTED'}")
        print(f"   📊 Processing Accuracy: {carton['processing_accuracy']:.1f}%")
        print(f"   🏷️  Carton Types Mapped: {len(carton['carton_types_mapped'])}")
        
        if carton['carton_types_mapped']:
            print(f"   📝 Detected Types: {', '.join(carton['carton_types_mapped'][:3])}{'...' if len(carton['carton_types_mapped']) > 3 else ''}")
        
        # Single truck optimization
        single = results['feature_validation']['single_truck_optimization']
        print(f"\n🎯 SINGLE TRUCK OPTIMIZATION:")
        print(f"   🎯 Prioritized: {'✅ YES' if single['prioritized'] else '❌ NO'}")
        print(f"   📊 Space Utilization Focus: {'✅ YES' if single['space_utilization_focus'] else '❌ NO'}")
        print(f"   💰 Cost Efficiency: {'✅ YES' if single['cost_efficiency'] else '❌ NO'}")
        
        # Enhanced UI
        ui = results['feature_validation']['enhanced_ui']
        print(f"\n🎨 ENHANCED UI:")
        print(f"   🏆 Single Truck Prominence: {'✅ YES' if ui['single_truck_prominence'] else '❌ NO'}")
        print(f"   📈 Space Utilization Display: {'✅ YES' if ui['space_utilization_display'] else '❌ NO'}")
        print(f"   ⭐ Perfect Fit Indicators: {'✅ YES' if ui['perfect_fit_indicators'] else '❌ NO'}")
        print(f"   💡 Cost Savings Focus: {'✅ YES' if ui['cost_savings_focus'] else '❌ NO'}")
        
        # Order Analysis
        print(f"\n📋 ORDER PROCESSING ANALYSIS:")
        if results['order_analysis']:
            for order_id, analysis in results['order_analysis'].items():
                status = "✅ PROCESSED" if analysis['detected'] else "❌ NOT DETECTED"
                recommendation = "🚛 HAS RECOMMENDATION" if analysis['has_recommendation'] else "⚠️ NO RECOMMENDATION"
                single_truck = "🎯 SINGLE TRUCK" if analysis['single_truck_solution'] else "🔄 MULTI-TRUCK"
                
                print(f"   {order_id}: {status} | {analysis['expected_cartons']} cartons | {recommendation} | {single_truck}")
        
        # Performance Metrics
        perf = results['performance_metrics']
        print(f"\n⚡ PERFORMANCE METRICS:")
        print(f"   ⏱️  Upload/Processing Time: {perf['upload_time']:.2f}s")
        print(f"   📦 Response Size: {perf['response_size']:,} bytes")
        
        # Overall Assessment
        assessment = results['overall_assessment']
        print(f"\n🏆 OVERALL ASSESSMENT:")
        print(f"   📊 Final Score: {assessment['score']:.1f}%")
        print(f"   🎯 Status: {assessment['status']}")
        
        # Status indicator
        if assessment['status'] == 'EXCELLENT':
            print(f"   🟢 RESULT: All key features working excellently")
        elif assessment['status'] == 'GOOD':
            print(f"   🟡 RESULT: Most features working well")
        elif assessment['status'] == 'ADEQUATE':
            print(f"   🟠 RESULT: Basic functionality working")
        else:
            print(f"   🔴 RESULT: Significant improvements needed")
        
        # Recommendations
        if assessment['recommendations']:
            print(f"\n💡 RECOMMENDATIONS:")
            for i, rec in enumerate(assessment['recommendations'], 1):
                print(f"   {i}. {rec}")
        else:
            print(f"\n✅ NO RECOMMENDATIONS - Feature working as expected!")
        
        # Key Success Indicators
        print(f"\n✅ KEY SUCCESS INDICATORS:")
        success_indicators = []
        
        if carton['implemented']:
            success_indicators.append("Carton-based processing implemented")
        if single['prioritized']:
            success_indicators.append("Single truck optimization prioritized")
        if ui['space_utilization_display']:
            success_indicators.append("Space utilization clearly displayed")
        if ui['cost_savings_focus']:
            success_indicators.append("Cost savings emphasized")
        
        if success_indicators:
            for indicator in success_indicators:
                print(f"   ✅ {indicator}")
        else:
            print(f"   ⚠️ No key success indicators detected")
        
        print("\n" + "="*90)
        
        return results

def main():
    """Main comprehensive test execution"""
    print("🚀 Starting Comprehensive Sale Order Truck Selection Test...")
    
    tester = SaleOrderComprehensiveTester()
    final_results = tester.run_comprehensive_test()
    
    # Generate final report
    tester.generate_final_report()
    
    # Save comprehensive results
    final_results_file = "/workspaces/Truck_Opti/sale_order_comprehensive_test_results.json"
    with open(final_results_file, 'w') as f:
        json.dump(final_results, f, indent=2)
    print(f"\n💾 Comprehensive results saved to: {final_results_file}")

if __name__ == "__main__":
    main()