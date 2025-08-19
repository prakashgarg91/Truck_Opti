#!/usr/bin/env python3
"""
Simple Test for Advanced 3D Packing Integration
Tests the new advanced 3D carton fitting algorithms
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_advanced_3d_packer():
    """Test the advanced 3D packer with LED TV scenario"""
    print("TESTING ADVANCED 3D PACKING")
    print("=" * 40)
    
    try:
        from app.advanced_3d_packer import create_advanced_packing_recommendation
        
        # Test scenario: LED TVs 
        cartons = [{
            'name': 'LED TV 32"',
            'length': 80,
            'width': 15, 
            'height': 55,
            'weight': 10,
            'quantity': 2
        }]
        
        trucks = [{
            'name': 'Tata Ace',
            'length': 220,
            'width': 150,
            'height': 120,
            'max_weight': 750,
            'cost_per_km': 45
        }]
        
        # Test different optimization goals
        for goal in ['balanced', 'stability', 'efficiency']:
            print(f"\nTesting {goal} optimization:")
            
            result = create_advanced_packing_recommendation(trucks, cartons, goal)
            
            if result['recommendations']:
                best = result['recommendations'][0]
                packing = best['packing_result']
                
                print(f"  Truck: {best['truck_name']}")
                print(f"  Utilization: {packing.truck_utilization:.1f}%")
                print(f"  Stability: {packing.stability_score*100:.0f}%")
                print(f"  Packed: {len(packing.packed_cartons)} cartons")
                print(f"  Success: YES")
            else:
                print(f"  Success: NO")
        
        return True
        
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    """Main test function"""
    print("ADVANCED 3D PACKING INTEGRATION TEST")
    print("=" * 40)
    
    success = test_advanced_3d_packer()
    
    if success:
        print("\nRESULT: ADVANCED 3D PACKING WORKING")
        return True
    else:
        print("\nRESULT: ADVANCED 3D PACKING NEEDS FIXES")
        return False

if __name__ == "__main__":
    main()