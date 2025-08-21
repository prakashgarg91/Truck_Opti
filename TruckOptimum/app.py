"""
TruckOptimum - Fast, Clean Truck Loading Optimization
Startup Target: <2 seconds
"""

from flask import Flask, render_template, request, jsonify, redirect, url_for
import sqlite3
import os
import sys
import time

# Global timing for performance monitoring
APP_START_TIME = time.time()

class TruckOptimum:
    def __init__(self):
        self.app = Flask(__name__)
        self.app.secret_key = 'truckoptimum-2025'
        self.db_path = self.get_db_path()
        self.setup_routes()
        self.init_database()
        
    def get_db_path(self):
        """Get database path for both dev and executable"""
        if getattr(sys, 'frozen', False):
            # Executable mode
            return os.path.join(os.path.dirname(sys.executable), 'truck_optimum.db')
        else:
            # Development mode
            return os.path.join(os.path.dirname(__file__), 'truck_optimum.db')
    
    def init_database(self):
        """Initialize database with essential tables"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS trucks (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    length REAL NOT NULL,
                    width REAL NOT NULL,
                    height REAL NOT NULL,
                    max_weight REAL NOT NULL,
                    cost_per_km REAL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS cartons (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    length REAL NOT NULL,
                    width REAL NOT NULL,
                    height REAL NOT NULL,
                    weight REAL NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS recommendations (
                    id INTEGER PRIMARY KEY,
                    recommendation_id TEXT UNIQUE NOT NULL,
                    carton_requirements TEXT NOT NULL,
                    recommended_truck_id INTEGER,
                    recommended_truck_name TEXT,
                    recommendation_score REAL,
                    volume_utilization REAL,
                    weight_utilization REAL,
                    stability_score REAL,
                    packed_cartons INTEGER,
                    total_cartons INTEGER,
                    algorithm_used TEXT,
                    processing_time TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (recommended_truck_id) REFERENCES trucks(id)
                )
            ''')
            
            # Add sample data if empty
            if conn.execute('SELECT COUNT(*) FROM trucks').fetchone()[0] == 0:
                self.add_sample_data(conn)
    
    def add_sample_data(self, conn):
        """Add essential sample data"""
        trucks = [
            ('Small Truck', 6.0, 2.5, 2.5, 3000, 15),
            ('Medium Truck', 8.0, 2.5, 3.0, 5000, 20),
            ('Large Truck', 12.0, 2.5, 3.5, 8000, 25),
        ]
        
        cartons = [
            ('Small Box', 0.5, 0.5, 0.5, 10),
            ('Medium Box', 1.0, 1.0, 1.0, 25),
            ('Large Box', 1.5, 1.5, 1.5, 50),
        ]
        
        conn.executemany('INSERT INTO trucks (name, length, width, height, max_weight, cost_per_km) VALUES (?, ?, ?, ?, ?, ?)', trucks)
        conn.executemany('INSERT INTO cartons (name, length, width, height, weight) VALUES (?, ?, ?, ?, ?)', cartons)
        conn.commit()
    
    def setup_routes(self):
        """Setup all routes"""
        
        @self.app.route('/')
        def index():
            startup_time = time.time() - APP_START_TIME
            return render_template('index.html', startup_time=f"{startup_time:.2f}")
        
        @self.app.route('/trucks')
        def trucks():
            with sqlite3.connect(self.db_path) as conn:
                trucks = conn.execute('SELECT * FROM trucks').fetchall()
            return render_template('trucks.html', trucks=trucks)
        
        @self.app.route('/cartons')
        def cartons():
            with sqlite3.connect(self.db_path) as conn:
                cartons = conn.execute('SELECT * FROM cartons').fetchall()
            return render_template('cartons.html', cartons=cartons)
        
        @self.app.route('/optimize')
        def optimize():
            with sqlite3.connect(self.db_path) as conn:
                trucks = conn.execute('SELECT * FROM trucks').fetchall()
                cartons = conn.execute('SELECT * FROM cartons').fetchall()
            return render_template('optimize.html', trucks=trucks, cartons=cartons)
        
        @self.app.route('/api/optimize', methods=['POST'])
        def api_optimize():
            """Fast optimization API - lazy load algorithms only when needed"""
            start_time = time.time()
            
            try:
                data = request.get_json()
                truck_id = data.get('truck_id')
                carton_requirements = data.get('carton_requirements', [])
                carton_ids = data.get('carton_ids', [])  # Fallback for old format
                
                # Get truck from database
                with sqlite3.connect(self.db_path) as conn:
                    truck = conn.execute('SELECT * FROM trucks WHERE id = ?', (truck_id,)).fetchone()
                    
                    cartons = []
                    if carton_requirements:
                        # New quantity-based format
                        for req in carton_requirements:
                            carton_id = req.get('carton_id')
                            quantity = req.get('quantity', 1)
                            carton = conn.execute('SELECT * FROM cartons WHERE id = ?', (carton_id,)).fetchone()
                            if carton:
                                # Add multiple instances of the same carton
                                for i in range(quantity):
                                    cartons.append(carton)
                    else:
                        # Old format - single instance of each carton
                        for cid in carton_ids:
                            carton = conn.execute('SELECT * FROM cartons WHERE id = ?', (cid,)).fetchone()
                            if carton:
                                cartons.append(carton)
                
                if not truck or not cartons:
                    return jsonify({'error': 'Invalid truck or cartons'}), 400
                
                use_advanced = data.get('use_advanced', True)
                
                if use_advanced:
                    # Use advanced 3D packing (lazy loaded)
                    result = self.advanced_optimize(truck, cartons)
                else:
                    # Use simple optimization
                    result = self.simple_optimize(truck, cartons)
                
                # Add quantity summary to result
                if carton_requirements:
                    result['carton_summary'] = {
                        'total_cartons': len(cartons),
                        'carton_types': len(carton_requirements),
                        'requirements': carton_requirements
                    }
                
                processing_time = time.time() - start_time
                result['processing_time'] = f"{processing_time:.3f}s"
                
                return jsonify(result)
                
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/api/recommend-trucks', methods=['POST'])
        def api_recommend_trucks():
            """Smart truck recommendation for given cartons with quantities"""
            import json
            import uuid
            start_time = time.time()
            
            try:
                data = request.get_json()
                carton_requirements = data.get('carton_requirements', [])
                carton_ids = data.get('carton_ids', [])  # Fallback for old format
                
                if not carton_requirements and not carton_ids:
                    return jsonify({'error': 'No cartons specified'}), 400
                
                # Get all trucks and specified cartons
                with sqlite3.connect(self.db_path) as conn:
                    trucks = conn.execute('SELECT * FROM trucks ORDER BY length * width * height').fetchall()
                    cartons = []
                    carton_summary = {'total_cartons': 0, 'carton_types': 0, 'requirements': []}
                    
                    if carton_requirements:
                        # New quantity-based format
                        carton_summary['carton_types'] = len(carton_requirements)
                        carton_summary['requirements'] = carton_requirements
                        
                        for req in carton_requirements:
                            carton_id = req.get('carton_id')
                            quantity = req.get('quantity', 1)
                            carton = conn.execute('SELECT * FROM cartons WHERE id = ?', (carton_id,)).fetchone()
                            if carton:
                                # Add multiple instances of the same carton
                                for i in range(quantity):
                                    cartons.append(carton)
                                carton_summary['total_cartons'] += quantity
                    else:
                        # Old format - single instance of each carton
                        for cid in carton_ids:
                            carton = conn.execute('SELECT * FROM cartons WHERE id = ?', (cid,)).fetchone()
                            if carton:
                                cartons.append(carton)
                        carton_summary['total_cartons'] = len(cartons)
                        carton_summary['carton_types'] = len(cartons)
                
                if not trucks or not cartons:
                    return jsonify({'error': 'No trucks or cartons available'}), 400
                
                # Get smart recommendations
                recommendations = self.smart_truck_recommendation(trucks, cartons)
                
                processing_time = time.time() - start_time
                
                # Save recommendation to database if we have results
                recommendation_id = None
                if recommendations:
                    recommendation_id = f"REC-{uuid.uuid4().hex[:8].upper()}"
                    best_recommendation = recommendations[0]
                    
                    with sqlite3.connect(self.db_path) as conn:
                        conn.execute('''
                            INSERT INTO recommendations (
                                recommendation_id, carton_requirements, recommended_truck_id, 
                                recommended_truck_name, recommendation_score, volume_utilization,
                                weight_utilization, stability_score, packed_cartons, total_cartons,
                                algorithm_used, processing_time
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            recommendation_id, json.dumps(carton_requirements), 
                            best_recommendation.get('truck_id'), best_recommendation.get('truck_name'),
                            best_recommendation.get('recommendation_score'), best_recommendation.get('volume_utilization'),
                            best_recommendation.get('weight_utilization'), best_recommendation.get('stability_score'),
                            best_recommendation.get('packed_cartons'), carton_summary['total_cartons'],
                            best_recommendation.get('algorithm'), f"{processing_time:.3f}s"
                        ))
                        conn.commit()
                
                return jsonify({
                    'success': True,
                    'recommendation_id': recommendation_id,
                    'recommendations': recommendations,
                    'processing_time': f"{processing_time:.3f}s",
                    'total_trucks_analyzed': len(trucks),
                    'carton_count': carton_summary['total_cartons'],
                    'carton_types': carton_summary['carton_types'],
                    'carton_summary': carton_summary
                })
                
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        # RECOMMENDATION HISTORY ENDPOINTS
        @self.app.route('/api/recommendations', methods=['GET'])
        def api_recommendations():
            """Get recommendation history"""
            with sqlite3.connect(self.db_path) as conn:
                recommendations = conn.execute('''
                    SELECT * FROM recommendations ORDER BY created_at DESC LIMIT 50
                ''').fetchall()
                
                recommendation_list = []
                for rec in recommendations:
                    recommendation_list.append({
                        'id': rec[0], 'recommendation_id': rec[1], 'carton_requirements': rec[2],
                        'recommended_truck_name': rec[4], 'recommendation_score': rec[5],
                        'volume_utilization': rec[6], 'weight_utilization': rec[7], 'stability_score': rec[8],
                        'packed_cartons': rec[9], 'total_cartons': rec[10], 'algorithm_used': rec[11],
                        'processing_time': rec[12], 'created_at': rec[13]
                    })
                
                return jsonify({'success': True, 'recommendations': recommendation_list})
        
        @self.app.route('/api/recommendations/<recommendation_id>', methods=['GET'])
        def api_recommendation_detail(recommendation_id):
            """Get specific recommendation details"""
            with sqlite3.connect(self.db_path) as conn:
                rec = conn.execute('''
                    SELECT * FROM recommendations WHERE recommendation_id = ?
                ''', (recommendation_id,)).fetchone()
                
                if not rec:
                    return jsonify({'success': False, 'error': 'Recommendation not found'}), 404
                
                recommendation = {
                    'id': rec[0], 'recommendation_id': rec[1], 'carton_requirements': rec[2],
                    'recommended_truck_name': rec[4], 'recommendation_score': rec[5],
                    'volume_utilization': rec[6], 'weight_utilization': rec[7], 'stability_score': rec[8],
                    'packed_cartons': rec[9], 'total_cartons': rec[10], 'algorithm_used': rec[11],
                    'processing_time': rec[12], 'created_at': rec[13]
                }
                
                return jsonify({'success': True, 'recommendation': recommendation})
        
        # TRUCK CRUD ENDPOINTS
        @self.app.route('/api/trucks', methods=['GET', 'POST'])
        def api_trucks():
            """Get all trucks or create a new truck"""
            with sqlite3.connect(self.db_path) as conn:
                if request.method == 'GET':
                    trucks = conn.execute('SELECT * FROM trucks ORDER BY created_at DESC').fetchall()
                    truck_list = []
                    for truck in trucks:
                        truck_list.append({
                            'id': truck[0], 'name': truck[1], 'length': truck[2], 'width': truck[3],
                            'height': truck[4], 'max_weight': truck[5], 'cost_per_km': truck[6],
                            'volume': truck[2] * truck[3] * truck[4], 'created_at': truck[7]
                        })
                    return jsonify({'success': True, 'trucks': truck_list})
                
                elif request.method == 'POST':
                    data = request.get_json()
                    try:
                        conn.execute('''
                            INSERT INTO trucks (name, length, width, height, max_weight, cost_per_km)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (data['name'], data['length'], data['width'], data['height'], 
                              data['max_weight'], data.get('cost_per_km', 0)))
                        conn.commit()
                        return jsonify({'success': True, 'message': 'Truck added successfully'})
                    except Exception as e:
                        return jsonify({'success': False, 'error': str(e)}), 400
        
        @self.app.route('/api/trucks/<int:truck_id>', methods=['PUT', 'DELETE'])
        def api_truck_detail(truck_id):
            """Update or delete a specific truck"""
            with sqlite3.connect(self.db_path) as conn:
                if request.method == 'PUT':
                    data = request.get_json()
                    try:
                        conn.execute('''
                            UPDATE trucks SET name=?, length=?, width=?, height=?, max_weight=?, 
                            cost_per_km=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
                        ''', (data['name'], data['length'], data['width'], data['height'], 
                              data['max_weight'], data.get('cost_per_km', 0), truck_id))
                        if conn.rowcount == 0:
                            return jsonify({'success': False, 'error': 'Truck not found'}), 404
                        conn.commit()
                        return jsonify({'success': True, 'message': 'Truck updated successfully'})
                    except Exception as e:
                        return jsonify({'success': False, 'error': str(e)}), 400
                
                elif request.method == 'DELETE':
                    try:
                        conn.execute('DELETE FROM trucks WHERE id=?', (truck_id,))
                        if conn.rowcount == 0:
                            return jsonify({'success': False, 'error': 'Truck not found'}), 404
                        conn.commit()
                        return jsonify({'success': True, 'message': 'Truck deleted successfully'})
                    except Exception as e:
                        return jsonify({'success': False, 'error': str(e)}), 400
        
        # CARTON CRUD ENDPOINTS  
        @self.app.route('/api/cartons', methods=['GET', 'POST'])
        def api_cartons():
            """Get all cartons or create a new carton"""
            with sqlite3.connect(self.db_path) as conn:
                if request.method == 'GET':
                    cartons = conn.execute('SELECT * FROM cartons ORDER BY created_at DESC').fetchall()
                    carton_list = []
                    for carton in cartons:
                        carton_list.append({
                            'id': carton[0], 'name': carton[1], 'length': carton[2], 'width': carton[3],
                            'height': carton[4], 'weight': carton[5], 'quantity': carton[6],
                            'volume': carton[2] * carton[3] * carton[4], 'created_at': carton[7]
                        })
                    return jsonify({'success': True, 'cartons': carton_list})
                
                elif request.method == 'POST':
                    data = request.get_json()
                    try:
                        conn.execute('''
                            INSERT INTO cartons (name, length, width, height, weight, quantity)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (data['name'], data['length'], data['width'], data['height'], 
                              data['weight'], data.get('quantity', 1)))
                        conn.commit()
                        return jsonify({'success': True, 'message': 'Carton added successfully'})
                    except Exception as e:
                        return jsonify({'success': False, 'error': str(e)}), 400
        
        @self.app.route('/api/cartons/<int:carton_id>', methods=['PUT', 'DELETE'])
        def api_carton_detail(carton_id):
            """Update or delete a specific carton"""
            with sqlite3.connect(self.db_path) as conn:
                if request.method == 'PUT':
                    data = request.get_json()
                    try:
                        conn.execute('''
                            UPDATE cartons SET name=?, length=?, width=?, height=?, weight=?, 
                            quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
                        ''', (data['name'], data['length'], data['width'], data['height'], 
                              data['weight'], data.get('quantity', 1), carton_id))
                        if conn.rowcount == 0:
                            return jsonify({'success': False, 'error': 'Carton not found'}), 404
                        conn.commit()
                        return jsonify({'success': True, 'message': 'Carton updated successfully'})
                    except Exception as e:
                        return jsonify({'success': False, 'error': str(e)}), 400
                
                elif request.method == 'DELETE':
                    try:
                        conn.execute('DELETE FROM cartons WHERE id=?', (carton_id,))
                        if conn.rowcount == 0:
                            return jsonify({'success': False, 'error': 'Carton not found'}), 404
                        conn.commit()
                        return jsonify({'success': True, 'message': 'Carton deleted successfully'})
                    except Exception as e:
                        return jsonify({'success': False, 'error': str(e)}), 400
        
        @self.app.route('/api/health')
        def health():
            return jsonify({
                'status': 'ok',
                'startup_time': f"{time.time() - APP_START_TIME:.2f}s",
                'version': '1.0.0'
            })
    
    def simple_optimize(self, truck, cartons):
        """Simple volume-based optimization (fast calculation)"""
        # Truck dimensions: id, name, length, width, height, max_weight, cost_per_km
        truck_volume = truck[2] * truck[3] * truck[4]  # length * width * height
        truck_weight_limit = truck[5]
        
        total_carton_volume = 0
        total_carton_weight = 0
        
        for carton in cartons:
            # Carton: id, name, length, width, height, weight
            carton_volume = carton[2] * carton[3] * carton[4]
            total_carton_volume += carton_volume
            total_carton_weight += carton[5]
        
        # Calculate utilization
        volume_utilization = min((total_carton_volume / truck_volume) * 100, 100)
        weight_utilization = min((total_carton_weight / truck_weight_limit) * 100, 100)
        
        # Check if it fits
        fits = total_carton_volume <= truck_volume and total_carton_weight <= truck_weight_limit
        
        return {
            'success': True,
            'fits': fits,
            'truck_name': truck[1],
            'volume_utilization': round(volume_utilization, 1),
            'weight_utilization': round(weight_utilization, 1),
            'total_cartons': len(cartons),
            'algorithm': 'Simple Volume Calculation',
            'recommendation': 'Optimal' if fits and volume_utilization > 70 else 'Acceptable' if fits else 'Overloaded'
        }
    
    def advanced_optimize(self, truck, cartons):
        """Advanced 3D packing optimization with lazy loading"""
        from packing_engine import get_packing_engine, Truck3D, Carton3D
        
        # Convert database records to 3D objects
        truck_3d = Truck3D(
            id=truck[0], name=truck[1], 
            length=truck[2], width=truck[3], height=truck[4],
            max_weight=truck[5], cost_per_km=truck[6]
        )
        
        cartons_3d = []
        for carton in cartons:
            cartons_3d.append(Carton3D(
                id=carton[0], name=carton[1],
                length=carton[2], width=carton[3], height=carton[4],
                weight=carton[5]
            ))
        
        # Get packing engine and optimize
        packing_engine = get_packing_engine()
        packing_result = packing_engine.packer.pack_cartons_in_truck(truck_3d, cartons_3d, "auto")
        
        # Convert result to API format
        return {
            'success': packing_result.success,
            'fits': len(packing_result.unpacked_cartons) == 0,
            'truck_name': truck[1],
            'volume_utilization': round(packing_result.volume_utilization, 1),
            'weight_utilization': round(packing_result.weight_utilization, 1),
            'stability_score': round(packing_result.stability_score, 1),
            'packing_efficiency': round(packing_result.packing_efficiency, 1),
            'total_cartons': len(cartons),
            'packed_cartons': len(packing_result.packed_cartons),
            'unpacked_cartons': len(packing_result.unpacked_cartons),
            'algorithm': packing_result.algorithm_used,
            'recommendation': self._get_advanced_recommendation(packing_result)
        }
    
    def smart_truck_recommendation(self, trucks, cartons):
        """Smart truck recommendation using advanced 3D algorithms"""
        from packing_engine import get_packing_engine, Truck3D, Carton3D
        
        # Convert to 3D objects
        trucks_3d = []
        for truck in trucks:
            trucks_3d.append(Truck3D(
                id=truck[0], name=truck[1],
                length=truck[2], width=truck[3], height=truck[4],
                max_weight=truck[5], cost_per_km=truck[6]
            ))
        
        cartons_3d = []
        for carton in cartons:
            cartons_3d.append(Carton3D(
                id=carton[0], name=carton[1],
                length=carton[2], width=carton[3], height=carton[4],
                weight=carton[5]
            ))
        
        # Get smart recommendations
        packing_engine = get_packing_engine()
        recommendations = packing_engine.recommend_optimal_trucks(trucks_3d, cartons_3d)
        
        # Convert to API format
        result = []
        for rec in recommendations[:5]:  # Top 5 recommendations
            result.append({
                'truck_id': rec['truck'].id,
                'truck_name': rec['truck'].name,
                'recommendation_score': round(rec['recommendation_score'], 1),
                'fits_all': rec['fits_all'],
                'volume_utilization': round(rec['packing_result'].volume_utilization, 1),
                'weight_utilization': round(rec['packing_result'].weight_utilization, 1),
                'stability_score': round(rec['packing_result'].stability_score, 1),
                'cost_efficiency': round(rec['cost_efficiency'], 2),
                'algorithm': rec['packing_result'].algorithm_used,
                'packed_cartons': len(rec['packing_result'].packed_cartons),
                'unpacked_cartons': len(rec['packing_result'].unpacked_cartons),
                'recommendation': self._get_advanced_recommendation(rec['packing_result'])
            })
        
        return result
    
    def _get_advanced_recommendation(self, packing_result):
        """Get recommendation text based on advanced packing result"""
        if not packing_result.success:
            return 'Cannot fit cartons'
        elif len(packing_result.unpacked_cartons) == 0:
            if packing_result.packing_efficiency >= 80:
                return 'Excellent fit'
            elif packing_result.packing_efficiency >= 60:
                return 'Good fit'
            else:
                return 'Acceptable fit'
        else:
            return f'Partial fit ({len(packing_result.unpacked_cartons)} cartons remaining)'
    
    def run(self, host='127.0.0.1', port=5000, debug=False):
        """Run the application"""
        self.app.run(host=host, port=port, debug=debug, use_reloader=False)

def create_app():
    """Application factory"""
    return TruckOptimum()

if __name__ == '__main__':
    import webbrowser
    import threading
    
    print("TruckOptimum starting...")
    
    app = create_app()
    port = 5001
    
    # Open browser after brief delay
    def open_browser():
        time.sleep(1)
        webbrowser.open(f'http://127.0.0.1:{port}')
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    startup_time = time.time() - APP_START_TIME
    print(f"TruckOptimum ready in {startup_time:.2f}s - http://127.0.0.1:{port}")
    
    app.run(port=port, debug=False)