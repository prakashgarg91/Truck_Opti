#!/usr/bin/env python3
"""
Manual browser testing script for TruckOpti
Uses requests to simulate browser interactions
"""

import requests
from bs4 import BeautifulSoup
import json
import re
from urllib.parse import urljoin, urlparse

BASE_URL = "http://127.0.0.1:5002"

def extract_routes_from_html(html_content):
    """Extract routes/links from HTML content"""
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Find all links
    links = []
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        text = a_tag.get_text(strip=True)
        links.append({'href': href, 'text': text})
    
    # Find forms and their actions
    forms = []
    for form_tag in soup.find_all('form'):
        action = form_tag.get('action', '')
        method = form_tag.get('method', 'GET').upper()
        inputs = []
        for input_tag in form_tag.find_all(['input', 'select', 'textarea']):
            input_info = {
                'name': input_tag.get('name', ''),
                'type': input_tag.get('type', 'text'),
                'value': input_tag.get('value', ''),
                'required': input_tag.has_attr('required')
            }
            inputs.append(input_info)
        forms.append({'action': action, 'method': method, 'inputs': inputs})
    
    return {'links': links, 'forms': forms}

def test_homepage():
    """Test homepage and extract navigation structure"""
    print("🏠 Testing Homepage...")
    
    try:
        response = requests.get(BASE_URL, timeout=10)
        if response.status_code == 200:
            print(f"✅ Homepage loads successfully (Status: {response.status_code})")
            
            # Extract page structure
            structure = extract_routes_from_html(response.text)
            
            print(f"\n📍 Found {len(structure['links'])} navigation links:")
            for link in structure['links']:
                if link['href'].startswith('/') or link['href'].startswith('http'):
                    print(f"  - {link['text']}: {link['href']}")
            
            print(f"\n📝 Found {len(structure['forms'])} forms:")
            for i, form in enumerate(structure['forms'], 1):
                print(f"  Form {i}: {form['method']} {form['action']}")
                for inp in form['inputs'][:3]:  # Show first 3 inputs
                    print(f"    - {inp['name']} ({inp['type']})")
            
            return structure
        else:
            print(f"❌ Homepage failed to load (Status: {response.status_code})")
            return None
            
    except Exception as e:
        print(f"❌ Homepage error: {str(e)}")
        return None

def test_discovered_routes(structure):
    """Test all discovered routes from the homepage"""
    if not structure:
        return
    
    print("\n🔗 Testing discovered routes...")
    
    working_routes = []
    broken_routes = []
    
    for link in structure['links']:
        href = link['href']
        if href.startswith('/'):
            full_url = urljoin(BASE_URL, href)
            try:
                response = requests.get(full_url, timeout=5)
                if response.status_code == 200:
                    print(f"✅ {link['text']}: {href} (Working)")
                    working_routes.append({'text': link['text'], 'href': href})
                else:
                    print(f"❌ {link['text']}: {href} (Status: {response.status_code})")
                    broken_routes.append({'text': link['text'], 'href': href, 'status': response.status_code})
            except Exception as e:
                print(f"❌ {link['text']}: {href} (Error: {str(e)})")
                broken_routes.append({'text': link['text'], 'href': href, 'error': str(e)})
    
    return {'working': working_routes, 'broken': broken_routes}

def test_truck_management():
    """Test truck management functionality"""
    print("\n🚛 Testing Truck Management...")
    
    # Try common truck management routes
    truck_routes = [
        '/trucks', '/manage-trucks', '/truck-types', 
        '/add-truck', '/truck', '/fleet'
    ]
    
    for route in truck_routes:
        try:
            response = requests.get(urljoin(BASE_URL, route), timeout=5)
            if response.status_code == 200:
                print(f"✅ Found truck route: {route}")
                
                # Extract truck data if it looks like a truck page
                if 'truck' in response.text.lower():
                    soup = BeautifulSoup(response.text, 'html.parser')
                    
                    # Look for truck data
                    tables = soup.find_all('table')
                    if tables:
                        print(f"  📊 Found {len(tables)} table(s) with potential truck data")
                    
                    # Look for add truck forms
                    forms = soup.find_all('form')
                    for form in forms:
                        if any('truck' in str(input_tag).lower() for input_tag in form.find_all(['input', 'select'])):
                            print(f"  📝 Found truck form: {form.get('action', 'No action')}")
                
                return route
            elif response.status_code == 404:
                continue
            else:
                print(f"⚠️ Truck route {route} returned {response.status_code}")
        except:
            continue
    
    print("❌ No working truck management routes found")
    return None

def test_carton_management():
    """Test carton management functionality"""
    print("\n📦 Testing Carton Management...")
    
    # Try common carton management routes
    carton_routes = [
        '/cartons', '/manage-cartons', '/carton-types', 
        '/add-carton', '/carton', '/packages'
    ]
    
    for route in carton_routes:
        try:
            response = requests.get(urljoin(BASE_URL, route), timeout=5)
            if response.status_code == 200:
                print(f"✅ Found carton route: {route}")
                return route
        except:
            continue
    
    print("❌ No working carton management routes found")
    return None

def test_optimization_features():
    """Test optimization functionality"""
    print("\n⚙️ Testing Optimization Features...")
    
    # Try common optimization routes
    opt_routes = [
        '/optimize', '/pack', '/recommend-truck', 
        '/fit-cartons', '/calculate', '/pack-optimization'
    ]
    
    working_opts = []
    for route in opt_routes:
        try:
            response = requests.get(urljoin(BASE_URL, route), timeout=5)
            if response.status_code == 200:
                print(f"✅ Found optimization route: {route}")
                working_opts.append(route)
                
                # Check for optimization forms
                soup = BeautifulSoup(response.text, 'html.parser')
                forms = soup.find_all('form')
                if forms:
                    print(f"  📝 Found {len(forms)} form(s) for optimization")
                    
                # Check for 3D visualization elements
                if any(keyword in response.text.lower() for keyword in ['canvas', 'three.js', 'webgl', 'visualization']):
                    print(f"  🎨 3D visualization elements detected on {route}")
                
        except:
            continue
    
    if not working_opts:
        print("❌ No working optimization routes found")
    
    return working_opts

def analyze_database_content():
    """Analyze database content"""
    print("\n🗄️ Analyzing Database Content...")
    
    import sqlite3
    db_path = "/workspaces/Truck_Opti/app/truck_opti.db"
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check truck types
        cursor.execute("SELECT COUNT(*), name FROM truck_type GROUP BY name LIMIT 10")
        truck_data = cursor.fetchall()
        print(f"📊 Truck Types in Database: {len(truck_data)}")
        for count, name in truck_data[:5]:
            print(f"  - {name}: {count} entries")
        
        # Check carton types
        cursor.execute("SELECT COUNT(*), name FROM carton_type GROUP BY name LIMIT 10")
        carton_data = cursor.fetchall()
        print(f"📦 Carton Types in Database: {len(carton_data)}")
        for count, name in carton_data[:5]:
            print(f"  - {name}: {count} entries")
        
        # Check packing results
        cursor.execute("SELECT COUNT(*) FROM packing_result")
        packing_count = cursor.fetchone()[0]
        print(f"📈 Packing Results: {packing_count} entries")
        
        conn.close()
        
        return {
            'trucks': len(truck_data),
            'cartons': len(carton_data),
            'packing_results': packing_count
        }
        
    except Exception as e:
        print(f"❌ Database analysis error: {str(e)}")
        return None

def run_manual_test():
    """Run comprehensive manual test"""
    print("🚚 === TruckOpti Manual Browser Test ===")
    print(f"Testing application at: {BASE_URL}")
    print("=" * 50)
    
    # Test homepage
    structure = test_homepage()
    
    # Test discovered routes
    route_results = test_discovered_routes(structure)
    
    # Test specific functionality
    truck_route = test_truck_management()
    carton_route = test_carton_management()
    opt_routes = test_optimization_features()
    
    # Analyze database
    db_stats = analyze_database_content()
    
    # Summary
    print("\n" + "="*50)
    print("🚚 === MANUAL TEST SUMMARY ===")
    
    if route_results:
        print(f"✅ Working routes: {len(route_results['working'])}")
        print(f"❌ Broken routes: {len(route_results['broken'])}")
    
    print(f"🚛 Truck management: {'✅ Working' if truck_route else '❌ Not found'}")
    print(f"📦 Carton management: {'✅ Working' if carton_route else '❌ Not found'}")
    print(f"⚙️ Optimization features: {len(opt_routes) if opt_routes else 0} found")
    
    if db_stats:
        print(f"🗄️ Database: {db_stats['trucks']} trucks, {db_stats['cartons']} cartons, {db_stats['packing_results']} results")
    
    # Specific issues identified
    issues = []
    recommendations = []
    
    if not truck_route:
        issues.append("No truck management interface found")
        recommendations.append("HIGH: Implement truck management UI")
    
    if not carton_route:
        issues.append("No carton management interface found") 
        recommendations.append("HIGH: Implement carton management UI")
    
    if not opt_routes:
        issues.append("No optimization interface found")
        recommendations.append("CRITICAL: Implement optimization interface")
    
    if route_results and len(route_results['broken']) > len(route_results['working']):
        issues.append("More broken routes than working routes")
        recommendations.append("HIGH: Fix navigation and routing issues")
    
    if issues:
        print(f"\n🚨 Issues Found: {len(issues)}")
        for issue in issues:
            print(f"  - {issue}")
    
    if recommendations:
        print(f"\n🔧 Recommendations: {len(recommendations)}")
        for rec in recommendations:
            print(f"  - {rec}")
    
    return {
        'structure': structure,
        'routes': route_results,
        'truck_route': truck_route,
        'carton_route': carton_route,
        'opt_routes': opt_routes,
        'db_stats': db_stats,
        'issues': issues,
        'recommendations': recommendations
    }

if __name__ == "__main__":
    results = run_manual_test()
    
    # Save results
    with open('/workspaces/Truck_Opti/manual_test_results.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\n📄 Results saved to: /workspaces/Truck_Opti/manual_test_results.json")