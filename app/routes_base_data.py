from flask import Blueprint, jsonify
from .base_data_manager import BaseDataManager

base_data_bp = Blueprint('base_data', __name__)

@base_data_bp.route('/api/base-data/trucks', methods=['GET'])
def get_truck_base_data():
    """
    Retrieve comprehensive truck base data with metrics
    """
    return BaseDataManager.get_truck_base_data()

@base_data_bp.route('/api/base-data/cartons', methods=['GET'])
def get_carton_base_data():
    """
    Retrieve comprehensive carton base data with metrics
    """
    return BaseDataManager.get_carton_base_data()

@base_data_bp.route('/api/base-data/initialize', methods=['POST'])
def initialize_base_data():
    """
    Initialize base data if empty
    """
    trucks_added, cartons_added = BaseDataManager.initialize_base_data()
    
    if trucks_added > 0 or cartons_added > 0:
        return jsonify({
            'status': 'success',
            'message': f'Base data initialized: {trucks_added} trucks, {cartons_added} cartons added',
            'trucks_added': trucks_added,
            'cartons_added': cartons_added
        }), 201
    else:
        return jsonify({
            'status': 'info',
            'message': 'Base data already exists, no initialization needed'
        }), 200