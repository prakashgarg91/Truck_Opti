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
        
        @self.app.route('/recommendations')
        def recommendations():
            """Advanced recommendation history with analytics"""
            return render_template('recommendations.html')
        
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
        
        @self.app.route('/api/recommendations', methods=['GET'])
        def api_recommendations():
            """Advanced recommendation history with filtering and analytics"""
            with sqlite3.connect(self.db_path) as conn:
                # Get query parameters for filtering
                page = int(request.args.get('page', 1))
                limit = int(request.args.get('limit', 10))
                offset = (page - 1) * limit
                
                truck_filter = request.args.get('truck_name', '')
                algorithm_filter = request.args.get('algorithm', '')
                min_score = request.args.get('min_score', '')
                date_from = request.args.get('date_from', '')
                date_to = request.args.get('date_to', '')
                sort_by = request.args.get('sort_by', 'created_at')
                sort_order = request.args.get('sort_order', 'DESC')
                
                # Build WHERE clause
                where_conditions = []
                params = []
                
                if truck_filter:
                    where_conditions.append("recommended_truck_name LIKE ?")
                    params.append(f"%{truck_filter}%")
                
                if algorithm_filter:
                    where_conditions.append("algorithm_used LIKE ?")
                    params.append(f"%{algorithm_filter}%")
                
                if min_score:
                    where_conditions.append("recommendation_score >= ?")
                    params.append(float(min_score))
                
                if date_from:
                    where_conditions.append("DATE(created_at) >= ?")
                    params.append(date_from)
                
                if date_to:
                    where_conditions.append("DATE(created_at) <= ?")
                    params.append(date_to)
                
                where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
                
                # Get total count for pagination
                count_query = f"SELECT COUNT(*) FROM recommendations {where_clause}"
                total_count = conn.execute(count_query, params).fetchone()[0]
                
                # Get filtered recommendations
                main_query = f'''
                    SELECT * FROM recommendations {where_clause}
                    ORDER BY {sort_by} {sort_order}
                    LIMIT ? OFFSET ?
                '''
                params.extend([limit, offset])
                
                recommendations = conn.execute(main_query, params).fetchall()
                
                # Convert to dictionaries
                recommendation_list = []
                for rec in recommendations:
                    recommendation_list.append({
                        'id': rec[0], 'recommendation_id': rec[1], 'carton_requirements': rec[2],
                        'recommended_truck_name': rec[4], 'recommendation_score': rec[5],
                        'volume_utilization': rec[6], 'weight_utilization': rec[7], 
                        'stability_score': rec[8], 'packed_cartons': rec[9], 
                        'total_cartons': rec[10], 'algorithm_used': rec[11],
                        'processing_time': rec[12], 'created_at': rec[13]
                    })
                
                # Calculate analytics
                analytics = self._calculate_recommendation_analytics(conn, where_clause, params[:-2])
                
                return jsonify({
                    'success': True,
                    'recommendations': recommendation_list,
                    'pagination': {
                        'page': page,
                        'limit': limit,
                        'total': total_count,
                        'pages': (total_count + limit - 1) // limit
                    },
                    'analytics': analytics
                })
        
        @self.app.route('/api/recommendations/compare', methods=['POST'])
        def api_compare_recommendations():
            """Compare and suggest optimization improvements"""
            try:
                data = request.get_json()
                recommendation_ids = data.get('recommendation_ids', [])
                
                if len(recommendation_ids) < 2:
                    return jsonify({'success': False, 'error': 'Need at least 2 recommendations to compare'}), 400
                
                # Get recommendations from database
                recommendations = []
                with sqlite3.connect(self.db_path) as conn:
                    for rec_id in recommendation_ids:
                        rec = conn.execute('''
                            SELECT * FROM recommendations WHERE recommendation_id = ?
                        ''', (rec_id,)).fetchone()
                        
                        if rec:
                            recommendations.append({
                                'id': rec[0], 'recommendation_id': rec[1], 'carton_requirements': rec[2],
                                'recommended_truck_name': rec[4], 'recommendation_score': rec[5],
                                'volume_utilization': rec[6], 'weight_utilization': rec[7], 
                                'stability_score': rec[8], 'packed_cartons': rec[9], 
                                'total_cartons': rec[10], 'algorithm_used': rec[11],
                                'processing_time': rec[12], 'created_at': rec[13]
                            })
                
                if len(recommendations) < 2:
                    return jsonify({'success': False, 'error': 'Could not find specified recommendations'}), 400
                
                # Generate comparison analysis
                comparison = self._generate_recommendation_comparison(recommendations)
                
                return jsonify({
                    'success': True,
                    'comparison': comparison
                })
                
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500
        
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
    
    def _calculate_recommendation_analytics(self, conn, where_clause, params):
        """Calculate analytics for recommendation history"""
        try:
            # Overall statistics
            stats_query = f'''
                SELECT 
                    COUNT(*) as total_recommendations,
                    AVG(recommendation_score) as avg_score,
                    AVG(volume_utilization) as avg_volume_util,
                    AVG(weight_utilization) as avg_weight_util,
                    AVG(stability_score) as avg_stability,
                    MAX(recommendation_score) as max_score,
                    MIN(recommendation_score) as min_score
                FROM recommendations {where_clause}
            '''
            stats = conn.execute(stats_query, params).fetchone()
            
            # Most popular trucks
            truck_stats_query = f'''
                SELECT 
                    recommended_truck_name,
                    COUNT(*) as usage_count,
                    AVG(recommendation_score) as avg_score,
                    AVG(volume_utilization) as avg_volume_util
                FROM recommendations {where_clause}
                GROUP BY recommended_truck_name
                ORDER BY usage_count DESC
                LIMIT 5
            '''
            truck_stats = conn.execute(truck_stats_query, params).fetchall()
            
            # Algorithm performance
            algo_stats_query = f'''
                SELECT 
                    algorithm_used,
                    COUNT(*) as usage_count,
                    AVG(recommendation_score) as avg_score,
                    AVG(processing_time) as avg_processing_time
                FROM recommendations {where_clause}
                GROUP BY algorithm_used
                ORDER BY avg_score DESC
            '''
            algo_stats = conn.execute(algo_stats_query, params).fetchall()
            
            # Trend data (last 30 days)
            trend_query = f'''
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as daily_count,
                    AVG(recommendation_score) as daily_avg_score
                FROM recommendations 
                {where_clause + (" AND " if where_clause else "WHERE ") + "created_at >= datetime('now', '-30 days')"}
                GROUP BY DATE(created_at)
                ORDER BY date DESC
                LIMIT 30
            '''
            trend_params = params + [] if not where_clause else params
            trend_data = conn.execute(trend_query, trend_params).fetchall()
            
            return {
                'summary': {
                    'total_recommendations': stats[0] or 0,
                    'avg_score': round(stats[1] or 0, 1),
                    'avg_volume_utilization': round(stats[2] or 0, 1),
                    'avg_weight_utilization': round(stats[3] or 0, 1),
                    'avg_stability': round(stats[4] or 0, 1),
                    'max_score': round(stats[5] or 0, 1),
                    'min_score': round(stats[6] or 0, 1)
                },
                'popular_trucks': [
                    {
                        'name': truck[0],
                        'usage_count': truck[1],
                        'avg_score': round(truck[2] or 0, 1),
                        'avg_volume_util': round(truck[3] or 0, 1)
                    } for truck in truck_stats
                ],
                'algorithm_performance': [
                    {
                        'algorithm': algo[0],
                        'usage_count': algo[1],
                        'avg_score': round(algo[2] or 0, 1),
                        'avg_processing_time': round(float(algo[3] or 0), 3)
                    } for algo in algo_stats
                ],
                'trend_data': [
                    {
                        'date': trend[0],
                        'count': trend[1],
                        'avg_score': round(trend[2] or 0, 1)
                    } for trend in trend_data
                ]
            }
        except Exception as e:
            return {
                'summary': {},
                'popular_trucks': [],
                'algorithm_performance': [],
                'trend_data': [],
                'error': str(e)
            }
    
    def _generate_recommendation_comparison(self, recommendations: List[Dict]) -> Dict:
        """Generate detailed comparison analysis and optimization suggestions"""
        try:
            # Sort by recommendation score for analysis
            sorted_recs = sorted(recommendations, key=lambda x: x['recommendation_score'], reverse=True)
            best_rec = sorted_recs[0]
            worst_rec = sorted_recs[-1]
            
            # Calculate performance metrics
            avg_score = sum(r['recommendation_score'] for r in recommendations) / len(recommendations)
            avg_volume = sum(r['volume_utilization'] for r in recommendations) / len(recommendations)
            avg_weight = sum(r['weight_utilization'] for r in recommendations) / len(recommendations)
            avg_stability = sum(r['stability_score'] for r in recommendations) / len(recommendations)
            
            # Identify performance gaps
            score_gap = best_rec['recommendation_score'] - worst_rec['recommendation_score']
            volume_gap = best_rec['volume_utilization'] - worst_rec['volume_utilization']
            weight_gap = best_rec['weight_utilization'] - worst_rec['weight_utilization']
            stability_gap = best_rec['stability_score'] - worst_rec['stability_score']
            
            # Generate optimization suggestions
            suggestions = []
            
            # Algorithm optimization suggestions
            if score_gap > 20:
                best_algorithm = best_rec['algorithm_used']
                worst_algorithm = worst_rec['algorithm_used']
                suggestions.append({
                    'type': 'algorithm_optimization',
                    'priority': 'high',
                    'title': 'Algorithm Performance Gap Detected',
                    'description': f'Switch from "{worst_algorithm}" to "{best_algorithm}" for {score_gap:.1f}% improvement',
                    'potential_improvement': f'{score_gap:.1f}% better recommendation score',
                    'implementation': 'automatic_algorithm_selection'
                })
            
            # Volume utilization suggestions
            if volume_gap > 15:
                suggestions.append({
                    'type': 'space_optimization',
                    'priority': 'medium',
                    'title': 'Space Utilization Improvement',
                    'description': f'Optimize carton placement for {volume_gap:.1f}% better space utilization',
                    'potential_improvement': f'{volume_gap:.1f}% more efficient space usage',
                    'implementation': 'enhanced_3d_packing'
                })
            
            # Weight distribution suggestions
            if weight_gap > 20:
                suggestions.append({
                    'type': 'weight_optimization',
                    'priority': 'medium',
                    'title': 'Weight Distribution Enhancement',
                    'description': f'Improve weight distribution for {weight_gap:.1f}% better utilization',
                    'potential_improvement': f'{weight_gap:.1f}% improved weight efficiency',
                    'implementation': 'physics_based_placement'
                })
            
            # Stability improvement suggestions
            if stability_gap > 25:
                suggestions.append({
                    'type': 'stability_enhancement',
                    'priority': 'high',
                    'title': 'Stability Optimization Required',
                    'description': f'Critical stability improvement needed: {stability_gap:.1f}% gap detected',
                    'potential_improvement': f'{stability_gap:.1f}% more stable load configuration',
                    'implementation': 'center_of_gravity_optimization'
                })
            
            # Cost efficiency analysis
            truck_usage = {}
            for rec in recommendations:
                truck = rec['recommended_truck_name']
                if truck not in truck_usage:
                    truck_usage[truck] = {'count': 0, 'avg_score': 0, 'scores': []}
                truck_usage[truck]['count'] += 1
                truck_usage[truck]['scores'].append(rec['recommendation_score'])
            
            # Calculate average scores per truck
            for truck in truck_usage:
                truck_usage[truck]['avg_score'] = sum(truck_usage[truck]['scores']) / len(truck_usage[truck]['scores'])
            
            # Find best performing truck
            best_truck = max(truck_usage.items(), key=lambda x: x[1]['avg_score'])
            if best_truck[1]['avg_score'] > avg_score + 10:
                suggestions.append({
                    'type': 'truck_selection',
                    'priority': 'medium',
                    'title': 'Optimal Truck Selection',
                    'description': f'Consider using "{best_truck[0]}" more frequently for better results',
                    'potential_improvement': f'{best_truck[1]["avg_score"] - avg_score:.1f}% score improvement',
                    'implementation': 'truck_fleet_optimization'
                })
            
            # Performance trend analysis
            efficiency_trends = []
            for i, rec in enumerate(recommendations):
                efficiency_trends.append({
                    'order': i + 1,
                    'recommendation_id': rec['recommendation_id'],
                    'score': rec['recommendation_score'],
                    'volume_util': rec['volume_utilization'],
                    'weight_util': rec['weight_utilization'],
                    'stability': rec['stability_score'],
                    'truck': rec['recommended_truck_name'],
                    'algorithm': rec['algorithm_used']
                })
            
            # Overall assessment
            if avg_score >= 80:
                overall_assessment = "Excellent performance across recommendations"
            elif avg_score >= 60:
                overall_assessment = "Good performance with room for optimization"
            elif avg_score >= 40:
                overall_assessment = "Average performance, significant improvement potential"
            else:
                overall_assessment = "Poor performance, urgent optimization required"
            
            return {
                'summary': {
                    'total_compared': len(recommendations),
                    'best_score': best_rec['recommendation_score'],
                    'worst_score': worst_rec['recommendation_score'],
                    'average_score': round(avg_score, 1),
                    'score_range': round(score_gap, 1),
                    'overall_assessment': overall_assessment
                },
                'performance_metrics': {
                    'average_volume_utilization': round(avg_volume, 1),
                    'average_weight_utilization': round(avg_weight, 1),
                    'average_stability_score': round(avg_stability, 1),
                    'volume_gap': round(volume_gap, 1),
                    'weight_gap': round(weight_gap, 1),
                    'stability_gap': round(stability_gap, 1)
                },
                'best_recommendation': {
                    'id': best_rec['recommendation_id'],
                    'score': best_rec['recommendation_score'],
                    'truck': best_rec['recommended_truck_name'],
                    'algorithm': best_rec['algorithm_used'],
                    'volume_util': best_rec['volume_utilization'],
                    'weight_util': best_rec['weight_utilization'],
                    'stability': best_rec['stability_score']
                },
                'optimization_suggestions': suggestions,
                'truck_performance': truck_usage,
                'efficiency_trends': efficiency_trends,
                'recommendations': {
                    'immediate_actions': [s for s in suggestions if s['priority'] == 'high'],
                    'medium_term_improvements': [s for s in suggestions if s['priority'] == 'medium'],
                    'algorithm_recommendation': best_rec['algorithm_used'] if score_gap > 10 else 'current_algorithms_adequate',
                    'truck_recommendation': best_truck[0] if best_truck[1]['avg_score'] > avg_score + 5 else 'current_selection_adequate'
                }
            }
        except Exception as e:
            return {
                'summary': {'error': 'Failed to generate comparison'},
                'performance_metrics': {},
                'optimization_suggestions': [],
                'error': str(e)
            }
    
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