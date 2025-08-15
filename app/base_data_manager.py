from flask import jsonify
from app.models import TruckType, CartonType, AllowedCombination


def get_base_truck_data():
    """
    Retrieve base truck data for analytics and visualizations.

    Returns:
        JSON response with truck type data and statistics
    """
    try:
        truck_types = TruckType.query.all()
        truck_data = []

        for truck in truck_types:
            # Count allowed carton combinations for each truck
            carton_count = AllowedCombination.query.filter_by(
                truck_type_id=truck.id
            ).count()

            truck_data.append({
                'id': truck.id,
                'name': truck.name,
                'length': truck.length,
                'width': truck.width,
                'height': truck.height,
                'max_weight': truck.max_weight,
                'carton_combinations': carton_count
            })

        return jsonify({
            'success': True,
            'truck_types': truck_data
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error retrieving truck data: {str(e)}'
        }), 500


def get_base_carton_data():
    """
    Retrieve base carton data for analytics and visualizations.

    Returns:
        JSON response with carton type data and statistics
    """
    try:
        carton_types = CartonType.query.all()
        carton_data = []

        for carton in carton_types:
            carton_data.append({
                'id': carton.id,
                'name': carton.name,
                'length': carton.length,
                'width': carton.width,
                'height': carton.height,
                'weight': carton.weight
            })

        return jsonify({
            'success': True,
            'carton_types': carton_data
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error retrieving carton data: {str(e)}'
        }), 500


def get_allowed_combinations():
    """
    Retrieve allowed truck and carton combinations.

    Returns:
        JSON response with allowed combinations
    """
    try:
        combinations = AllowedCombination.query.all()
        combo_data = []

        for combo in combinations:
            combo_data.append({
                'truck_type_id': combo.truck_type_id,
                'carton_type_id': combo.carton_type_id,
                'max_cartons': combo.max_cartons
            })

        return jsonify({
            'success': True,
            'allowed_combinations': combo_data
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error retrieving allowed combinations: {str(e)}'
        }), 500
