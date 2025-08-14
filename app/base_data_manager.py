from flask import jsonify, request
from . import db
from .models import TruckType, CartonType
import logging

class BaseDataManager:
    @staticmethod
    def get_truck_base_data():
        """
        Retrieve comprehensive truck base data with robust error handling.
        
        Returns:
            JSON response with truck data or error details
        """
        try:
            trucks = TruckType.query.all()
            
            # Handle empty dataset
            if not trucks:
                return jsonify({
                    'status': 'warning',
                    'message': 'No truck data available',
                    'data': []
                }), 204
            
            # Enhanced serialization with performance metrics
            truck_data = [
                {
                    **truck.as_dict(),
                    'performance_metrics': truck.get_performance_metrics()
                } 
                for truck in trucks
            ]
            
            return jsonify({
                'status': 'success',
                'message': f'{len(truck_data)} trucks retrieved',
                'data': truck_data
            })
        
        except Exception as e:
            logging.error(f"Error retrieving truck base data: {e}")
            return jsonify({
                'status': 'error',
                'message': 'Failed to retrieve truck base data',
                'details': str(e)
            }), 500
    
    @staticmethod
    def get_carton_base_data():
        """
        Retrieve comprehensive carton base data with robust error handling.
        
        Returns:
            JSON response with carton data or error details
        """
        try:
            cartons = CartonType.query.all()
            
            # Handle empty dataset
            if not cartons:
                return jsonify({
                    'status': 'warning',
                    'message': 'No carton data available',
                    'data': []
                }), 204
            
            # Enhanced serialization with packaging metrics
            carton_data = [
                {
                    **carton.as_dict(),
                    'packaging_metrics': carton.get_packaging_metrics()
                } 
                for carton in cartons
            ]
            
            return jsonify({
                'status': 'success',
                'message': f'{len(carton_data)} cartons retrieved',
                'data': carton_data
            })
        
        except Exception as e:
            logging.error(f"Error retrieving carton base data: {e}")
            return jsonify({
                'status': 'error',
                'message': 'Failed to retrieve carton base data',
                'details': str(e)
            }), 500
    
    @staticmethod
    def initialize_base_data():
        """
        Initialize base data if empty, with robust logging and error tracking.
        
        Returns:
            Tuple of (trucks_added, cartons_added)
        """
        from .default_data import DEFAULT_TRUCKS, DEFAULT_CARTONS
        
        trucks_added = 0
        cartons_added = 0
        
        try:
            # Check and add trucks
            existing_trucks = TruckType.query.count()
            if existing_trucks == 0:
                for truck_data in DEFAULT_TRUCKS:
                    truck = TruckType(**truck_data)
                    db.session.add(truck)
                    trucks_added += 1
            
            # Check and add cartons
            existing_cartons = CartonType.query.count()
            if existing_cartons == 0:
                for carton_data in DEFAULT_CARTONS:
                    carton = CartonType(**carton_data)
                    db.session.add(carton)
                    cartons_added += 1
            
            db.session.commit()
            
            logging.info(f"Base data initialized: {trucks_added} trucks, {cartons_added} cartons")
            
        except Exception as e:
            db.session.rollback()
            logging.error(f"Base data initialization failed: {e}")
        
        return trucks_added, cartons_added