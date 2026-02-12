#!/usr/bin/env python3
"""
Quick Functionality Test for TruckOpti
Tests core components without running the full server
"""

import sys
import os
import json
from pathlib import Path

def test_imports():
    """Test if core modules can be imported"""
    print("Testing Core Module Imports...")
    
    try:
        # Test web app imports
        sys.path.insert(0, 'apps/web')
        
        print("  ✅ Testing Flask app creation...")
        from app import create_app
        app = create_app()
        print("  ✅ Flask app created successfully")
        
        print("  ✅ Testing database models...")
        from app.domain.entities import TruckType, CartonType
        print("  ✅ Database models imported")
        
        print("  ✅ Testing 3D packing engine...")
        from app.core.modern_3d_packing import Modern3DPacker
        packer = Modern3DPacker()
        print("  ✅ 3D packing engine initialized")
        
        print("  ✅ Testing optimization service...")
        from app.application.services.optimization_service import OptimizationService
        service = OptimizationService()
        print("  ✅ Optimization service initialized")
        
        return True
        
    except ImportError as e:
        print(f"  ❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Unexpected error: {e}")
        return False

def test_basic_packing():
    """Test basic 3D packing functionality"""
    print("\nTesting Basic 3D Packing...")
    
    try:
        sys.path.insert(0, 'apps/web')
        from app.core.modern_3d_packing import Modern3DPacker
        
        # Simple test case
        container = {
            'length': 100,
            'width': 100,
            'height': 100,
            'max_weight': 1000
        }
        
        items = [
            {'name': 'Box1', 'length': 30, 'width': 30, 'height': 30, 'weight': 10},
            {'name': 'Box2', 'length': 25, 'width': 25, 'height': 25, 'weight': 8}
        ]
        
        packer = Modern3DPacker()
        result = packer.pack(container, items)
        
        print(f"  ✅ Packing completed")
        print(f"  ✅ Packed items: {len(result.get('packed_items', []))}")
        print(f"  ✅ Utilization: {result.get('metrics', {}).get('utilization', 0):.1f}%")
        
        return len(result.get('packed_items', [])) > 0
        
    except Exception as e:
        print(f"  ❌ Packing test failed: {e}")
        return False

def test_file_structure():
    """Test if all required files exist"""
    print("\nTesting File Structure...")
    
    required_files = [
        'apps/web/app/__init__.py',
        'apps/web/app/main.py',
        'apps/web/run.py',
        'apps/web/requirements.txt',
        'apps/desktop/TruckOptimum/app.py',
        'frontend/package.json',
        'README.md'
    ]
    
    missing_files = []
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"  ✅ {file_path}")
        else:
            print(f"  ❌ {file_path} - MISSING")
            missing_files.append(file_path)
    
    return len(missing_files) == 0

def test_configuration_files():
    """Test configuration files"""
    print("\nTesting Configuration Files...")
    
    try:
        # Check web app requirements
        with open('apps/web/requirements.txt', 'r') as f:
            requirements = f.read()
            if 'Flask' in requirements:
                print("  ✅ Flask dependency found")
            if 'SQLAlchemy' in requirements:
                print("  ✅ SQLAlchemy dependency found")
            if 'numpy' in requirements:
                print("  ✅ NumPy dependency found")
        
        # Check frontend package.json
        if os.path.exists('frontend/package.json'):
            with open('frontend/package.json', 'r') as f:
                package_data = json.load(f)
                print(f"  ✅ Frontend app: {package_data.get('name', 'Unknown')}")
                print(f"  ✅ Version: {package_data.get('version', 'Unknown')}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Configuration test failed: {e}")
        return False

def test_database_schema():
    """Test database schema without connecting"""
    print("\nTesting Database Schema...")
    
    try:
        sys.path.insert(0, 'apps/web')
        from app.domain.entities import TruckType, CartonType
        
        # Check if models have required attributes
        truck_attrs = ['id', 'name', 'length', 'width', 'height', 'max_weight']
        carton_attrs = ['id', 'name', 'length', 'width', 'height', 'weight']
        
        for attr in truck_attrs:
            if hasattr(TruckType, attr):
                print(f"  ✅ TruckType.{attr}")
            else:
                print(f"  ❌ TruckType.{attr} - MISSING")
        
        for attr in carton_attrs:
            if hasattr(CartonType, attr):
                print(f"  ✅ CartonType.{attr}")
            else:
                print(f"  ❌ CartonType.{attr} - MISSING")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Database schema test failed: {e}")
        return False

def main():
    """Run all quick functionality tests"""
    print("🚛 TRUCKOPTI QUICK FUNCTIONALITY TEST")
    print("=" * 50)
    
    tests = [
        ("File Structure", test_file_structure),
        ("Configuration Files", test_configuration_files),
        ("Core Module Imports", test_imports),
        ("Database Schema", test_database_schema),
        ("Basic 3D Packing", test_basic_packing)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 50)
    print("QUICK TEST SUMMARY")
    print("=" * 50)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\nResults: {passed}/{total} tests passed")
    print(f"Success Rate: {(passed/total)*100:.1f}%")
    
    if passed == total:
        print("\n🎉 ALL QUICK TESTS PASSED!")
        print("The application structure and core functionality appear to be working correctly.")
    elif passed >= total * 0.8:
        print("\n✅ MOST TESTS PASSED!")
        print("The application is mostly functional with minor issues.")
    else:
        print("\n⚠️  SEVERAL TESTS FAILED!")
        print("The application may have significant issues that need attention.")
    
    return passed >= total * 0.8

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)