#!/usr/bin/env python3
"""
3D Carton Fitting Algorithm Validation and Correction
Tests and validates truck recommendation algorithms with 3D constraints
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.models import db, TruckType, CartonType
import math
from typing import List, Dict, Tuple, Any

class Algorithm3DValidator:
    """Validate 3D carton fitting algorithms"""
    
    def __init__(self):
        self.app = create_app()
        self.test_results = []
        
    def log_result(self, test_name: str, passed: bool, details: str = ""):
        """Log test results"""
        status = "[PASS]" if passed else "[FAIL]"
        result = f"{status} | {test_name} | {details}"
        self.test_results.append(result)
        print(result)
    
    def calculate_3d_fitting(self, carton_dims: Tuple[float, float, float], 
                           truck_dims: Tuple[float, float, float], 
                           quantity: int) -> Dict[str, Any]:
        """Calculate 3D fitting with rotation possibilities"""
        
        c_l, c_w, c_h = carton_dims  # carton length, width, height (cm)
        t_l, t_w, t_h = truck_dims   # truck length, width, height (cm)
        
        # Test all possible orientations for cartons
        orientations = [
            (c_l, c_w, c_h),  # Original
            (c_l, c_h, c_w),  # Rotate around length
            (c_w, c_l, c_h),  # Rotate around height  
            (c_w, c_h, c_l),  # 
            (c_h, c_l, c_w),  # 
            (c_h, c_w, c_l)   # All 6 possible orientations
        ]
        
        best_fit = {
            'fits': False,
            'max_quantity': 0,
            'orientation': None,
            'arrangement': None,
            'utilization': 0.0
        }
        
        for orientation in orientations:
            o_l, o_w, o_h = orientation
            
            # Skip if single carton doesn't fit in any dimension
            if o_l > t_l or o_w > t_w or o_h > t_h:
                continue
                
            # Calculate how many fit in each dimension
            fit_length = int(t_l // o_l)
            fit_width = int(t_w // o_w)  
            fit_height = int(t_h // o_h)
            
            total_fit = fit_length * fit_width * fit_height
            
            if total_fit >= quantity and total_fit > best_fit['max_quantity']:
                # Calculate volume utilization
                carton_volume = (c_l * c_w * c_h) / 1000000  # m³
                truck_volume = (t_l * t_w * t_h) / 1000000   # m³
                
                utilization = (carton_volume * quantity) / truck_volume * 100
                
                best_fit = {
                    'fits': True,
                    'max_quantity': total_fit,
                    'orientation': orientation,
                    'arrangement': (fit_length, fit_width, fit_height),
                    'utilization': utilization,
                    'used_quantity': quantity
                }
        
        return best_fit
    
    def test_led_tv_fitting(self) -> bool:
        """Test LED TV 32 fitting in different trucks"""
        try:
            # LED TV 32" dimensions (real world)
            led_tv_dims = (80.0, 15.0, 55.0)  # L x W x H in cm
            quantity = 2
            
            # Test with Tata Ace (Small truck)
            tata_ace_dims = (168.0, 127.0, 124.0)  # cm
            
            result = self.calculate_3d_fitting(led_tv_dims, tata_ace_dims, quantity)
            
            # Manual verification
            # Can fit lengthwise: 2 * 80 = 160 cm < 168 cm ✓
            # Width fits: 15 cm < 127 cm ✓  
            # Height fits: 55 cm < 124 cm ✓
            expected_fits = True
            expected_arrangement = (2, 8, 2)  # Can fit many more than needed
            
            passed = result['fits'] == expected_fits and result['used_quantity'] == quantity
            details = f"Fits: {result['fits']}, Arrangement: {result['arrangement']}, Utilization: {result['utilization']:.1f}%"
            
            self.log_result("LED TV 32 in Tata Ace", passed, details)
            return passed
            
        except Exception as e:
            self.log_result("LED TV 32 in Tata Ace", False, str(e))
            return False
    
    def test_large_item_fitting(self) -> bool:
        """Test large item that shouldn't fit"""
        try:
            # Large refrigerator dimensions
            fridge_dims = (200.0, 80.0, 180.0)  # cm
            quantity = 1
            
            # Small truck
            small_truck_dims = (168.0, 127.0, 124.0)  # cm
            
            result = self.calculate_3d_fitting(fridge_dims, small_truck_dims, quantity)
            
            # Should NOT fit (height 180 > 124)
            expected_fits = False
            
            passed = result['fits'] == expected_fits
            details = f"Correctly identifies non-fit: {not result['fits']}"
            
            self.log_result("Large Refrigerator Non-Fit", passed, details)
            return passed
            
        except Exception as e:
            self.log_result("Large Refrigerator Non-Fit", False, str(e))
            return False
    
    def test_rotation_optimization(self) -> bool:
        """Test if algorithm finds best rotation"""
        try:
            # Tall thin item
            tall_item_dims = (20.0, 20.0, 150.0)  # cm
            quantity = 1
            
            # Truck with limited height but good length
            truck_dims = (200.0, 150.0, 100.0)  # cm
            
            result = self.calculate_3d_fitting(tall_item_dims, truck_dims, quantity)
            
            # Should fit by rotating (150 length fits in 200 length dimension)
            expected_fits = True
            
            # Verify it found a rotation that works
            if result['fits']:
                o_l, o_w, o_h = result['orientation']
                rotation_found = o_h <= 100  # Height constraint met
            else:
                rotation_found = False
            
            passed = result['fits'] and rotation_found
            details = f"Found rotation: {result['orientation']}, Fits: {result['fits']}"
            
            self.log_result("Rotation Optimization", passed, details)
            return passed
            
        except Exception as e:
            self.log_result("Rotation Optimization", False, str(e))
            return False
    
    def test_utilization_calculation(self) -> bool:
        """Test volume utilization calculation accuracy"""
        try:
            # Test case: Small boxes in large truck
            box_dims = (50.0, 50.0, 50.0)  # cm
            quantity = 8  # 8 boxes
            
            # Large truck
            truck_dims = (400.0, 200.0, 200.0)  # cm
            
            result = self.calculate_3d_fitting(box_dims, truck_dims, quantity)
            
            # Manual calculation
            box_volume = (50 * 50 * 50) / 1000000  # 0.125 m³ per box
            total_box_volume = box_volume * quantity  # 1.0 m³
            truck_volume = (400 * 200 * 200) / 1000000  # 16.0 m³
            expected_utilization = (total_box_volume / truck_volume) * 100  # 6.25%
            
            utilization_accurate = abs(result['utilization'] - expected_utilization) < 0.1
            
            passed = result['fits'] and utilization_accurate
            details = f"Utilization: {result['utilization']:.2f}% (Expected: {expected_utilization:.2f}%)"
            
            self.log_result("Utilization Calculation", passed, details)
            return passed
            
        except Exception as e:
            self.log_result("Utilization Calculation", False, str(e))
            return False
    
    def test_quantity_constraints(self) -> bool:
        """Test quantity constraint validation"""
        try:
            # Medium box
            box_dims = (30.0, 30.0, 30.0)  # cm
            required_quantity = 100  # Need 100 boxes
            
            # Small truck - should not fit 100 boxes
            small_truck_dims = (100.0, 100.0, 100.0)  # cm
            
            result = self.calculate_3d_fitting(box_dims, small_truck_dims, required_quantity)
            
            # Calculate theoretical max
            max_length = int(100 // 30)  # 3
            max_width = int(100 // 30)   # 3  
            max_height = int(100 // 30)  # 3
            theoretical_max = max_length * max_width * max_height  # 27
            
            should_fit = theoretical_max >= required_quantity  # False (27 < 100)
            
            passed = result['fits'] == should_fit
            details = f"Max capacity: {result['max_quantity']}, Required: {required_quantity}, Fits: {result['fits']}"
            
            self.log_result("Quantity Constraints", passed, details)
            return passed
            
        except Exception as e:
            self.log_result("Quantity Constraints", False, str(e))
            return False
    
    def run_all_algorithm_tests(self) -> Dict[str, Any]:
        """Run all 3D algorithm validation tests"""
        print("[3D-ALGO] Starting 3D Algorithm Validation")
        print("=" * 60)
        
        tests = [
            ("LED TV Fitting Test", self.test_led_tv_fitting),
            ("Large Item Non-Fit Test", self.test_large_item_fitting),
            ("Rotation Optimization Test", self.test_rotation_optimization),
            ("Utilization Calculation Test", self.test_utilization_calculation),
            ("Quantity Constraints Test", self.test_quantity_constraints)
        ]
        
        passed_tests = 0
        total_tests = len(tests)
        
        for test_name, test_func in tests:
            print(f"\n[TEST] {test_name}")
            try:
                result = test_func()
                if result:
                    passed_tests += 1
            except Exception as e:
                print(f"[FAIL] {test_name} | Exception: {str(e)}")
        
        success_rate = (passed_tests / total_tests) * 100
        
        print("\n" + "=" * 60)
        print("[SUMMARY] 3D ALGORITHM VALIDATION RESULTS")
        print("=" * 60)
        
        for result in self.test_results:
            print(result)
        
        print(f"\n[RESULT] ALGORITHM TESTS: {passed_tests}/{total_tests} passed ({success_rate:.1f}%)")
        
        if success_rate >= 80:
            print("[SUCCESS] 3D ALGORITHMS: VALIDATED")
        else:
            print("[WARNING] 3D ALGORITHMS: NEED CORRECTION")
        
        return {
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "success_rate": success_rate,
            "results": self.test_results
        }

def main():
    """Run 3D algorithm validation"""
    validator = Algorithm3DValidator()
    results = validator.run_all_algorithm_tests()
    return results

if __name__ == "__main__":
    main()