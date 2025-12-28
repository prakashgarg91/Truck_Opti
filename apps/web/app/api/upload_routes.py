"""
Upload Routes - REST API for Data Import
TruckOpti Modern Logistics Solution
"""

from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os
import json
import csv
from io import StringIO, BytesIO
from datetime import datetime
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

upload_bp = Blueprint('upload', __name__, url_prefix='/api/upload')

# Configuration
ALLOWED_EXTENSIONS = {'csv', 'json', 'xlsx', 'xls'}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16 MB


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_file_extension(filename: str) -> str:
    """Get lowercase file extension"""
    return filename.rsplit('.', 1)[1].lower() if '.' in filename else ''


def parse_csv(file_content: str) -> List[Dict[str, Any]]:
    """Parse CSV content to list of dictionaries"""
    reader = csv.DictReader(StringIO(file_content))
    return [row for row in reader]


def parse_json(file_content: str) -> List[Dict[str, Any]]:
    """Parse JSON content to list of dictionaries"""
    data = json.loads(file_content)
    if isinstance(data, list):
        return data
    elif isinstance(data, dict) and 'items' in data:
        return data['items']
    elif isinstance(data, dict) and 'data' in data:
        return data['data']
    elif isinstance(data, dict):
        return [data]
    return []


def parse_excel(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Parse Excel content to list of dictionaries"""
    try:
        import pandas as pd
        df = pd.read_excel(BytesIO(file_bytes))
        return df.to_dict('records')
    except ImportError:
        raise ImportError("pandas and openpyxl required for Excel support. Install with: pip install pandas openpyxl")


def validate_item_data(item: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and normalize item data"""
    errors = []
    
    # Required fields
    required_fields = ['name', 'length', 'width', 'height']
    for field in required_fields:
        if field not in item or not item[field]:
            errors.append(f"Missing required field: {field}")
    
    if errors:
        return {'valid': False, 'errors': errors, 'data': item}
    
    # Normalize numeric values
    try:
        normalized = {
            'name': str(item['name']).strip(),
            'length': float(item['length']),
            'width': float(item['width']),
            'height': float(item['height']),
            'weight': float(item.get('weight', 0)),
            'quantity': int(item.get('quantity', 1)),
            'fragile': bool(item.get('fragile', False)),
            'stackable': bool(item.get('stackable', True)),
            'rotatable': bool(item.get('rotatable', True)),
            'priority': int(item.get('priority', 0)),
            'color': str(item.get('color', '#2563EB'))
        }
        return {'valid': True, 'data': normalized, 'errors': []}
    except (ValueError, TypeError) as e:
        return {'valid': False, 'errors': [f"Invalid data type: {str(e)}"], 'data': item}


def validate_bin_data(bin_item: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and normalize bin/truck data"""
    errors = []
    
    # Required fields
    required_fields = ['name', 'length', 'width', 'height']
    for field in required_fields:
        if field not in bin_item or not bin_item[field]:
            errors.append(f"Missing required field: {field}")
    
    if errors:
        return {'valid': False, 'errors': errors, 'data': bin_item}
    
    # Normalize numeric values
    try:
        normalized = {
            'name': str(bin_item['name']).strip(),
            'length': float(bin_item['length']),
            'width': float(bin_item['width']),
            'height': float(bin_item['height']),
            'max_weight': float(bin_item.get('max_weight', 10000)),
            'quantity': int(bin_item.get('quantity', 1)),
            'cost_per_unit': float(bin_item.get('cost_per_unit', 0)),
            'type': str(bin_item.get('type', 'truck'))
        }
        return {'valid': True, 'data': normalized, 'errors': []}
    except (ValueError, TypeError) as e:
        return {'valid': False, 'errors': [f"Invalid data type: {str(e)}"], 'data': bin_item}


@upload_bp.route('/items', methods=['POST'])
def upload_items():
    """
    Upload items/cartons data
    
    Accepts CSV, JSON, or Excel files with item specifications
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided',
                'message': 'Please select a file to upload'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected',
                'message': 'Please select a file to upload'
            }), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': 'Invalid file type',
                'message': f'Allowed file types: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
        
        extension = get_file_extension(file.filename)
        
        # Parse file content based on type
        try:
            if extension == 'csv':
                content = file.read().decode('utf-8')
                items = parse_csv(content)
            elif extension == 'json':
                content = file.read().decode('utf-8')
                items = parse_json(content)
            elif extension in ['xlsx', 'xls']:
                content = file.read()
                items = parse_excel(content)
            else:
                return jsonify({
                    'success': False,
                    'error': 'Unsupported file type',
                    'message': f'File type .{extension} is not supported'
                }), 400
        except Exception as e:
            logger.error(f"Error parsing file: {str(e)}")
            return jsonify({
                'success': False,
                'error': 'Parse error',
                'message': f'Failed to parse file: {str(e)}'
            }), 400
        
        # Validate items
        validated_items = []
        errors = []
        
        for idx, item in enumerate(items):
            result = validate_item_data(item)
            if result['valid']:
                validated_items.append(result['data'])
            else:
                errors.append({
                    'row': idx + 1,
                    'errors': result['errors'],
                    'data': result['data']
                })
        
        # Import valid items into database
        from app.models import db, CartonType
        
        imported_count = 0
        for item in validated_items:
            try:
                carton = CartonType(
                    name=item['name'],
                    length=item['length'],
                    width=item['width'],
                    height=item['height'],
                    weight=item['weight']
                )
                db.session.add(carton)
                imported_count += 1
            except Exception as e:
                errors.append({
                    'item': item['name'],
                    'error': str(e)
                })
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Successfully imported {imported_count} items',
            'summary': {
                'total_rows': len(items),
                'imported': imported_count,
                'errors': len(errors),
                'error_details': errors[:10] if errors else []
            },
            'items': validated_items
        }), 200
        
    except Exception as e:
        logger.error(f"Upload items error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Server error',
            'message': str(e)
        }), 500


@upload_bp.route('/bins', methods=['POST'])
def upload_bins():
    """
    Upload bins/trucks data
    
    Accepts CSV, JSON, or Excel files with bin/truck specifications
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided',
                'message': 'Please select a file to upload'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected',
                'message': 'Please select a file to upload'
            }), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': 'Invalid file type',
                'message': f'Allowed file types: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
        
        extension = get_file_extension(file.filename)
        
        # Parse file content based on type
        try:
            if extension == 'csv':
                content = file.read().decode('utf-8')
                bins = parse_csv(content)
            elif extension == 'json':
                content = file.read().decode('utf-8')
                bins = parse_json(content)
            elif extension in ['xlsx', 'xls']:
                content = file.read()
                bins = parse_excel(content)
            else:
                return jsonify({
                    'success': False,
                    'error': 'Unsupported file type',
                    'message': f'File type .{extension} is not supported'
                }), 400
        except Exception as e:
            logger.error(f"Error parsing file: {str(e)}")
            return jsonify({
                'success': False,
                'error': 'Parse error',
                'message': f'Failed to parse file: {str(e)}'
            }), 400
        
        # Validate bins
        validated_bins = []
        errors = []
        
        for idx, bin_item in enumerate(bins):
            result = validate_bin_data(bin_item)
            if result['valid']:
                validated_bins.append(result['data'])
            else:
                errors.append({
                    'row': idx + 1,
                    'errors': result['errors'],
                    'data': result['data']
                })
        
        # Import valid bins into database
        from app.models import db, TruckType
        
        imported_count = 0
        for bin_data in validated_bins:
            try:
                truck = TruckType(
                    name=bin_data['name'],
                    length=bin_data['length'],
                    width=bin_data['width'],
                    height=bin_data['height'],
                    max_weight=bin_data['max_weight']
                )
                db.session.add(truck)
                imported_count += 1
            except Exception as e:
                errors.append({
                    'item': bin_data['name'],
                    'error': str(e)
                })
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Successfully imported {imported_count} bins/trucks',
            'summary': {
                'total_rows': len(bins),
                'imported': imported_count,
                'errors': len(errors),
                'error_details': errors[:10] if errors else []
            },
            'bins': validated_bins
        }), 200
        
    except Exception as e:
        logger.error(f"Upload bins error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Server error',
            'message': str(e)
        }), 500


@upload_bp.route('/template/<data_type>', methods=['GET'])
def download_template(data_type: str):
    """
    Download CSV template for data import
    
    Args:
        data_type: 'items' or 'bins'
    """
    if data_type == 'items':
        template_data = """name,length,width,height,weight,quantity,fragile,stackable,rotatable,priority,color
Small Box,10,10,10,2.5,100,false,true,true,0,#2563EB
Medium Box,20,15,12,5.0,50,false,true,true,1,#10B981
Large Box,30,25,20,10.0,25,false,true,true,2,#F97316
Fragile Item,15,15,15,3.0,10,true,false,false,3,#EF4444
"""
        filename = 'items_template.csv'
    elif data_type == 'bins':
        template_data = """name,length,width,height,max_weight,quantity,cost_per_unit,type
Small Container,200,100,100,500,5,100,container
Medium Truck,400,180,180,2000,3,500,truck
Large Truck,600,200,200,5000,2,1000,truck
20ft Container,600,245,269,25000,1,2500,container
40ft Container,1200,245,269,30000,1,4000,container
"""
        filename = 'bins_template.csv'
    else:
        return jsonify({
            'success': False,
            'error': 'Invalid template type',
            'message': 'Use "items" or "bins" as template type'
        }), 400
    
    return send_file(
        BytesIO(template_data.encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=filename
    )


@upload_bp.route('/preview', methods=['POST'])
def preview_upload():
    """
    Preview uploaded file without importing
    
    Returns parsed and validated data for user review
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided'
            }), 400
        
        file = request.files['file']
        data_type = request.form.get('type', 'items')
        
        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': 'Invalid file type',
                'message': f'Allowed file types: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
        
        extension = get_file_extension(file.filename)
        
        # Parse file content
        try:
            if extension == 'csv':
                content = file.read().decode('utf-8')
                data = parse_csv(content)
            elif extension == 'json':
                content = file.read().decode('utf-8')
                data = parse_json(content)
            elif extension in ['xlsx', 'xls']:
                content = file.read()
                data = parse_excel(content)
            else:
                return jsonify({
                    'success': False,
                    'error': 'Unsupported file type'
                }), 400
        except Exception as e:
            return jsonify({
                'success': False,
                'error': 'Parse error',
                'message': str(e)
            }), 400
        
        # Validate data
        validate_func = validate_item_data if data_type == 'items' else validate_bin_data
        validated = []
        errors = []
        
        for idx, item in enumerate(data):
            result = validate_func(item)
            item_result = {
                'row': idx + 1,
                'valid': result['valid'],
                'data': result['data'],
                'errors': result['errors']
            }
            if result['valid']:
                validated.append(item_result)
            else:
                errors.append(item_result)
        
        return jsonify({
            'success': True,
            'preview': {
                'filename': secure_filename(file.filename),
                'total_rows': len(data),
                'valid_rows': len(validated),
                'error_rows': len(errors),
                'columns': list(data[0].keys()) if data else [],
                'valid_data': validated[:100],
                'error_data': errors[:20]
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Preview upload error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Server error',
            'message': str(e)
        }), 500


@upload_bp.route('/export/<data_type>', methods=['GET'])
def export_data(data_type: str):
    """
    Export existing data to CSV
    
    Args:
        data_type: 'items' or 'bins'
    """
    try:
        from app.models import TruckType, CartonType
        
        if data_type == 'items':
            items = CartonType.query.all()
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(['name', 'length', 'width', 'height', 'weight'])
            for item in items:
                writer.writerow([item.name, item.length, item.width, item.height, item.weight])
            
            return send_file(
                BytesIO(output.getvalue().encode('utf-8')),
                mimetype='text/csv',
                as_attachment=True,
                download_name=f'items_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
            )
            
        elif data_type == 'bins':
            bins = TruckType.query.all()
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(['name', 'length', 'width', 'height', 'max_weight'])
            for bin_item in bins:
                writer.writerow([bin_item.name, bin_item.length, bin_item.width, bin_item.height, bin_item.max_weight])
            
            return send_file(
                BytesIO(output.getvalue().encode('utf-8')),
                mimetype='text/csv',
                as_attachment=True,
                download_name=f'bins_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
            )
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid data type',
                'message': 'Use "items" or "bins" as data type'
            }), 400
            
    except Exception as e:
        logger.error(f"Export error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Server error',
            'message': str(e)
        }), 500
