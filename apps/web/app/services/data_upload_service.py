"""
Data Upload and Import Service
==============================
Handles file uploads for trucks/bins and items/cartons data
Supports CSV, Excel, and JSON formats

Author: TruckOpti Team
Version: 2.0.0
"""

import os
import json
import csv
import io
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
import uuid
from datetime import datetime

# Try to import pandas for Excel support
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("[WARNING] pandas not available - Excel import disabled")


class FileType(Enum):
    """Supported file types for data import"""
    CSV = "csv"
    JSON = "json"
    XLSX = "xlsx"
    XLS = "xls"


class DataType(Enum):
    """Types of data being imported"""
    ITEMS = "items"
    BINS = "bins"
    TRUCKS = "trucks"
    CARTONS = "cartons"


@dataclass
class ImportResult:
    """Result of a data import operation"""
    success: bool
    data: List[Dict]
    errors: List[str]
    warnings: List[str]
    records_imported: int
    records_failed: int
    file_name: str
    import_timestamp: str


@dataclass
class ValidationError:
    """Represents a validation error in imported data"""
    row: int
    field: str
    value: Any
    message: str


class DataValidator:
    """Validates imported data for trucks and items"""
    
    # Required fields for each data type
    ITEM_REQUIRED_FIELDS = ['name', 'length', 'width', 'height']
    ITEM_OPTIONAL_FIELDS = ['weight', 'quantity', 'priority', 'fragile', 'stackable', 
                           'color', 'sku', 'category', 'id']
    
    BIN_REQUIRED_FIELDS = ['name', 'length', 'width', 'height']
    BIN_OPTIONAL_FIELDS = ['max_weight', 'cost_per_km', 'base_cost', 'category', 
                          'availability', 'id']
    
    @classmethod
    def validate_items(cls, data: List[Dict]) -> Tuple[List[Dict], List[ValidationError]]:
        """Validate item/carton data"""
        validated = []
        errors = []
        
        for i, row in enumerate(data, 1):
            row_errors = []
            
            # Check required fields
            for field in cls.ITEM_REQUIRED_FIELDS:
                if field not in row or row[field] is None or row[field] == '':
                    row_errors.append(ValidationError(
                        row=i, field=field, value=row.get(field),
                        message=f"Required field '{field}' is missing or empty"
                    ))
            
            # Validate numeric fields
            numeric_fields = ['length', 'width', 'height', 'weight', 'quantity', 'priority']
            for field in numeric_fields:
                if field in row and row[field] is not None and row[field] != '':
                    try:
                        float(row[field])
                    except (ValueError, TypeError):
                        row_errors.append(ValidationError(
                            row=i, field=field, value=row[field],
                            message=f"Field '{field}' must be a number"
                        ))
            
            # Validate dimensions are positive
            for field in ['length', 'width', 'height']:
                if field in row and row[field] is not None:
                    try:
                        val = float(row[field])
                        if val <= 0:
                            row_errors.append(ValidationError(
                                row=i, field=field, value=row[field],
                                message=f"Field '{field}' must be positive"
                            ))
                    except (ValueError, TypeError):
                        pass  # Already caught above
            
            # Validate boolean fields
            bool_fields = ['fragile', 'stackable']
            for field in bool_fields:
                if field in row and row[field] is not None and row[field] != '':
                    val = row[field]
                    if not isinstance(val, bool):
                        if str(val).lower() not in ['true', 'false', '1', '0', 'yes', 'no']:
                            row_errors.append(ValidationError(
                                row=i, field=field, value=val,
                                message=f"Field '{field}' must be a boolean (true/false)"
                            ))
            
            if row_errors:
                errors.extend(row_errors)
            else:
                validated.append(cls._normalize_item(row, i))
        
        return validated, errors
    
    @classmethod
    def validate_bins(cls, data: List[Dict]) -> Tuple[List[Dict], List[ValidationError]]:
        """Validate bin/truck data"""
        validated = []
        errors = []
        
        for i, row in enumerate(data, 1):
            row_errors = []
            
            # Check required fields
            for field in cls.BIN_REQUIRED_FIELDS:
                if field not in row or row[field] is None or row[field] == '':
                    row_errors.append(ValidationError(
                        row=i, field=field, value=row.get(field),
                        message=f"Required field '{field}' is missing or empty"
                    ))
            
            # Validate numeric fields
            numeric_fields = ['length', 'width', 'height', 'max_weight', 'cost_per_km', 'base_cost']
            for field in numeric_fields:
                if field in row and row[field] is not None and row[field] != '':
                    try:
                        float(row[field])
                    except (ValueError, TypeError):
                        row_errors.append(ValidationError(
                            row=i, field=field, value=row[field],
                            message=f"Field '{field}' must be a number"
                        ))
            
            # Validate dimensions are positive
            for field in ['length', 'width', 'height']:
                if field in row and row[field] is not None:
                    try:
                        val = float(row[field])
                        if val <= 0:
                            row_errors.append(ValidationError(
                                row=i, field=field, value=row[field],
                                message=f"Field '{field}' must be positive"
                            ))
                    except (ValueError, TypeError):
                        pass
            
            if row_errors:
                errors.extend(row_errors)
            else:
                validated.append(cls._normalize_bin(row, i))
        
        return validated, errors
    
    @classmethod
    def _normalize_item(cls, row: Dict, index: int) -> Dict:
        """Normalize and clean item data"""
        item = {
            'id': row.get('id', str(uuid.uuid4())[:8]),
            'name': str(row['name']).strip(),
            'length': float(row['length']),
            'width': float(row['width']),
            'height': float(row['height']),
            'weight': float(row.get('weight', 0) or 0),
            'quantity': int(row.get('quantity', 1) or 1),
            'priority': int(row.get('priority', 1) or 1),
            'fragile': cls._to_bool(row.get('fragile', False)),
            'stackable': cls._to_bool(row.get('stackable', True)),
            'color': row.get('color', cls._generate_color(index)),
            'sku': row.get('sku', ''),
            'category': row.get('category', 'General')
        }
        
        # Calculate volume
        item['volume'] = item['length'] * item['width'] * item['height']
        
        return item
    
    @classmethod
    def _normalize_bin(cls, row: Dict, index: int) -> Dict:
        """Normalize and clean bin data"""
        bin_data = {
            'id': row.get('id', str(uuid.uuid4())[:8]),
            'name': str(row['name']).strip(),
            'length': float(row['length']),
            'width': float(row['width']),
            'height': float(row['height']),
            'max_weight': float(row.get('max_weight', 0) or 0),
            'cost_per_km': float(row.get('cost_per_km', 0) or 0),
            'base_cost': float(row.get('base_cost', 0) or 0),
            'category': row.get('category', 'Standard'),
            'availability': cls._to_bool(row.get('availability', True))
        }
        
        # Calculate volume
        bin_data['volume'] = bin_data['length'] * bin_data['width'] * bin_data['height']
        
        return bin_data
    
    @staticmethod
    def _to_bool(value: Any) -> bool:
        """Convert various values to boolean"""
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.lower() in ['true', '1', 'yes', 'y', 'on']
        return False
    
    @staticmethod
    def _generate_color(index: int) -> str:
        """Generate a color for visualization"""
        colors = [
            '#3B82F6',  # Blue
            '#EF4444',  # Red
            '#10B981',  # Green
            '#F59E0B',  # Amber
            '#8B5CF6',  # Purple
            '#EC4899',  # Pink
            '#14B8A6',  # Teal
            '#F97316',  # Orange
            '#6366F1',  # Indigo
            '#84CC16',  # Lime
        ]
        return colors[index % len(colors)]


class FileParser:
    """Parses various file formats into structured data"""
    
    @staticmethod
    def detect_file_type(filename: str) -> Optional[FileType]:
        """Detect file type from filename"""
        ext = filename.lower().split('.')[-1] if '.' in filename else ''
        type_map = {
            'csv': FileType.CSV,
            'json': FileType.JSON,
            'xlsx': FileType.XLSX,
            'xls': FileType.XLS
        }
        return type_map.get(ext)
    
    @classmethod
    def parse(cls, file_content: bytes, filename: str) -> Tuple[List[Dict], List[str]]:
        """
        Parse file content into list of dictionaries
        
        Returns:
            Tuple of (data, errors)
        """
        file_type = cls.detect_file_type(filename)
        
        if file_type is None:
            return [], [f"Unsupported file type: {filename}"]
        
        if file_type == FileType.CSV:
            return cls._parse_csv(file_content)
        elif file_type == FileType.JSON:
            return cls._parse_json(file_content)
        elif file_type in [FileType.XLSX, FileType.XLS]:
            return cls._parse_excel(file_content)
        
        return [], ["Unknown file type"]
    
    @staticmethod
    def _parse_csv(content: bytes) -> Tuple[List[Dict], List[str]]:
        """Parse CSV content"""
        errors = []
        data = []
        
        try:
            # Try to decode as UTF-8 first, then fall back to latin-1
            try:
                text = content.decode('utf-8')
            except UnicodeDecodeError:
                text = content.decode('latin-1')
            
            # Use csv.DictReader
            reader = csv.DictReader(io.StringIO(text))
            
            for row in reader:
                # Clean the row - strip whitespace and handle empty strings
                cleaned_row = {}
                for key, value in row.items():
                    if key:  # Skip empty column names
                        clean_key = key.strip().lower().replace(' ', '_')
                        clean_value = value.strip() if value else None
                        cleaned_row[clean_key] = clean_value
                
                if any(cleaned_row.values()):  # Skip completely empty rows
                    data.append(cleaned_row)
        
        except Exception as e:
            errors.append(f"CSV parsing error: {str(e)}")
        
        return data, errors
    
    @staticmethod
    def _parse_json(content: bytes) -> Tuple[List[Dict], List[str]]:
        """Parse JSON content"""
        errors = []
        data = []
        
        try:
            text = content.decode('utf-8')
            parsed = json.loads(text)
            
            # Handle both list and object with data key
            if isinstance(parsed, list):
                data = parsed
            elif isinstance(parsed, dict):
                # Check for common data keys
                for key in ['data', 'items', 'rows', 'records', 'bins', 'trucks', 'cartons']:
                    if key in parsed and isinstance(parsed[key], list):
                        data = parsed[key]
                        break
                else:
                    # Single object, wrap in list
                    data = [parsed]
            
            # Normalize keys to lowercase with underscores
            normalized_data = []
            for row in data:
                if isinstance(row, dict):
                    normalized_row = {}
                    for key, value in row.items():
                        clean_key = str(key).strip().lower().replace(' ', '_')
                        normalized_row[clean_key] = value
                    normalized_data.append(normalized_row)
            
            data = normalized_data
        
        except json.JSONDecodeError as e:
            errors.append(f"JSON parsing error: {str(e)}")
        except Exception as e:
            errors.append(f"Error processing JSON: {str(e)}")
        
        return data, errors
    
    @staticmethod
    def _parse_excel(content: bytes) -> Tuple[List[Dict], List[str]]:
        """Parse Excel content"""
        errors = []
        data = []
        
        if not PANDAS_AVAILABLE:
            return [], ["Excel support requires pandas library. Install with: pip install pandas openpyxl"]
        
        try:
            # Read Excel file
            df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
            
            # Clean column names
            df.columns = [str(col).strip().lower().replace(' ', '_') for col in df.columns]
            
            # Convert to list of dictionaries
            data = df.to_dict('records')
            
            # Clean up NaN values
            for row in data:
                for key, value in row.items():
                    if pd.isna(value):
                        row[key] = None
        
        except Exception as e:
            errors.append(f"Excel parsing error: {str(e)}")
        
        return data, errors


class DataUploadService:
    """
    Main service for handling data uploads
    Coordinates parsing, validation, and storage
    """
    
    def __init__(self, db=None):
        self.db = db
        self.parser = FileParser()
        self.validator = DataValidator()
    
    def import_items(self, file_content: bytes, filename: str) -> ImportResult:
        """
        Import items/cartons from uploaded file
        
        Args:
            file_content: Raw bytes of uploaded file
            filename: Original filename
        
        Returns:
            ImportResult with imported data and any errors
        """
        errors = []
        warnings = []
        
        # Parse file
        data, parse_errors = self.parser.parse(file_content, filename)
        errors.extend(parse_errors)
        
        if not data:
            return ImportResult(
                success=False,
                data=[],
                errors=errors or ["No data found in file"],
                warnings=warnings,
                records_imported=0,
                records_failed=0,
                file_name=filename,
                import_timestamp=datetime.now().isoformat()
            )
        
        # Validate data
        validated_data, validation_errors = self.validator.validate_items(data)
        
        for err in validation_errors:
            errors.append(f"Row {err.row}: {err.message} (field: {err.field}, value: {err.value})")
        
        # Create result
        return ImportResult(
            success=len(validated_data) > 0,
            data=validated_data,
            errors=errors,
            warnings=warnings,
            records_imported=len(validated_data),
            records_failed=len(data) - len(validated_data),
            file_name=filename,
            import_timestamp=datetime.now().isoformat()
        )
    
    def import_bins(self, file_content: bytes, filename: str) -> ImportResult:
        """
        Import bins/trucks from uploaded file
        
        Args:
            file_content: Raw bytes of uploaded file
            filename: Original filename
        
        Returns:
            ImportResult with imported data and any errors
        """
        errors = []
        warnings = []
        
        # Parse file
        data, parse_errors = self.parser.parse(file_content, filename)
        errors.extend(parse_errors)
        
        if not data:
            return ImportResult(
                success=False,
                data=[],
                errors=errors or ["No data found in file"],
                warnings=warnings,
                records_imported=0,
                records_failed=0,
                file_name=filename,
                import_timestamp=datetime.now().isoformat()
            )
        
        # Validate data
        validated_data, validation_errors = self.validator.validate_bins(data)
        
        for err in validation_errors:
            errors.append(f"Row {err.row}: {err.message} (field: {err.field}, value: {err.value})")
        
        # Create result
        return ImportResult(
            success=len(validated_data) > 0,
            data=validated_data,
            errors=errors,
            warnings=warnings,
            records_imported=len(validated_data),
            records_failed=len(data) - len(validated_data),
            file_name=filename,
            import_timestamp=datetime.now().isoformat()
        )
    
    def save_items_to_db(self, items: List[Dict]) -> Tuple[int, List[str]]:
        """Save validated items to database"""
        if not self.db:
            return 0, ["Database not available"]
        
        # Implementation depends on your database model
        # This is a placeholder
        saved_count = 0
        errors = []
        
        try:
            from app.models import CartonType, db as flask_db
            
            for item in items:
                carton = CartonType(
                    name=item['name'],
                    length=item['length'],
                    width=item['width'],
                    height=item['height'],
                    weight=item.get('weight', 0),
                    can_rotate=item.get('stackable', True),
                    fragile=item.get('fragile', False)
                )
                flask_db.session.add(carton)
                saved_count += 1
            
            flask_db.session.commit()
        
        except Exception as e:
            errors.append(f"Database error: {str(e)}")
            if self.db:
                try:
                    flask_db.session.rollback()
                except:
                    pass
        
        return saved_count, errors
    
    def save_bins_to_db(self, bins: List[Dict]) -> Tuple[int, List[str]]:
        """Save validated bins to database"""
        if not self.db:
            return 0, ["Database not available"]
        
        saved_count = 0
        errors = []
        
        try:
            from app.models import TruckType, db as flask_db
            
            for bin_data in bins:
                truck = TruckType(
                    name=bin_data['name'],
                    length=bin_data['length'],
                    width=bin_data['width'],
                    height=bin_data['height'],
                    max_weight=bin_data.get('max_weight', 0),
                    cost_per_km=bin_data.get('cost_per_km', 0),
                    truck_category=bin_data.get('category', 'Standard'),
                    availability=bin_data.get('availability', True)
                )
                flask_db.session.add(truck)
                saved_count += 1
            
            flask_db.session.commit()
        
        except Exception as e:
            errors.append(f"Database error: {str(e)}")
            if self.db:
                try:
                    flask_db.session.rollback()
                except:
                    pass
        
        return saved_count, errors
    
    @staticmethod
    def generate_template(data_type: DataType) -> bytes:
        """
        Generate a CSV template for data import
        
        Args:
            data_type: Type of data template to generate
        
        Returns:
            CSV content as bytes
        """
        if data_type in [DataType.ITEMS, DataType.CARTONS]:
            headers = ['name', 'length', 'width', 'height', 'weight', 'quantity', 
                      'priority', 'fragile', 'stackable', 'sku', 'category']
            sample_rows = [
                ['Large Box', '100', '80', '60', '50', '5', '1', 'false', 'true', 'SKU001', 'General'],
                ['Medium Box', '60', '40', '40', '30', '10', '2', 'false', 'true', 'SKU002', 'General'],
                ['Small Box', '30', '30', '30', '15', '20', '3', 'false', 'true', 'SKU003', 'General'],
                ['Fragile Item', '50', '50', '30', '20', '3', '1', 'true', 'false', 'SKU004', 'Fragile'],
            ]
        else:
            headers = ['name', 'length', 'width', 'height', 'max_weight', 
                      'cost_per_km', 'base_cost', 'category', 'availability']
            sample_rows = [
                ['Standard Truck', '600', '240', '240', '10000', '15', '500', 'Standard', 'true'],
                ['Large Container', '1200', '240', '260', '25000', '25', '1000', 'Heavy', 'true'],
                ['Small Van', '300', '180', '180', '3000', '8', '200', 'Light', 'true'],
            ]
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows(sample_rows)
        
        return output.getvalue().encode('utf-8')
    
    @staticmethod
    def generate_json_template(data_type: DataType) -> bytes:
        """Generate a JSON template for data import"""
        if data_type in [DataType.ITEMS, DataType.CARTONS]:
            template = {
                "items": [
                    {
                        "name": "Large Box",
                        "length": 100,
                        "width": 80,
                        "height": 60,
                        "weight": 50,
                        "quantity": 5,
                        "priority": 1,
                        "fragile": False,
                        "stackable": True,
                        "sku": "SKU001",
                        "category": "General"
                    },
                    {
                        "name": "Medium Box",
                        "length": 60,
                        "width": 40,
                        "height": 40,
                        "weight": 30,
                        "quantity": 10,
                        "priority": 2,
                        "fragile": False,
                        "stackable": True,
                        "sku": "SKU002",
                        "category": "General"
                    }
                ]
            }
        else:
            template = {
                "trucks": [
                    {
                        "name": "Standard Truck",
                        "length": 600,
                        "width": 240,
                        "height": 240,
                        "max_weight": 10000,
                        "cost_per_km": 15,
                        "base_cost": 500,
                        "category": "Standard",
                        "availability": True
                    },
                    {
                        "name": "Large Container",
                        "length": 1200,
                        "width": 240,
                        "height": 260,
                        "max_weight": 25000,
                        "cost_per_km": 25,
                        "base_cost": 1000,
                        "category": "Heavy",
                        "availability": True
                    }
                ]
            }
        
        return json.dumps(template, indent=2).encode('utf-8')


# API Routes for file upload (Flask Blueprint)
def create_upload_routes():
    """Create Flask routes for file upload"""
    from flask import Blueprint, request, jsonify, send_file
    
    upload_bp = Blueprint('upload', __name__, url_prefix='/api/upload')
    upload_service = DataUploadService()
    
    @upload_bp.route('/items', methods=['POST'])
    def upload_items():
        """Upload items/cartons data"""
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        result = upload_service.import_items(file.read(), file.filename)
        
        return jsonify({
            'success': result.success,
            'data': result.data,
            'records_imported': result.records_imported,
            'records_failed': result.records_failed,
            'errors': result.errors,
            'warnings': result.warnings
        })
    
    @upload_bp.route('/bins', methods=['POST'])
    def upload_bins():
        """Upload bins/trucks data"""
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        result = upload_service.import_bins(file.read(), file.filename)
        
        return jsonify({
            'success': result.success,
            'data': result.data,
            'records_imported': result.records_imported,
            'records_failed': result.records_failed,
            'errors': result.errors,
            'warnings': result.warnings
        })
    
    @upload_bp.route('/template/<data_type>/<format>', methods=['GET'])
    def download_template(data_type: str, format: str):
        """Download import template"""
        dtype = DataType.ITEMS if data_type in ['items', 'cartons'] else DataType.BINS
        
        if format == 'csv':
            content = DataUploadService.generate_template(dtype)
            mimetype = 'text/csv'
            filename = f'{data_type}_template.csv'
        elif format == 'json':
            content = DataUploadService.generate_json_template(dtype)
            mimetype = 'application/json'
            filename = f'{data_type}_template.json'
        else:
            return jsonify({'error': 'Invalid format'}), 400
        
        return send_file(
            io.BytesIO(content),
            mimetype=mimetype,
            as_attachment=True,
            download_name=filename
        )
    
    return upload_bp


# Example usage
if __name__ == "__main__":
    # Test CSV parsing
    csv_content = b"""name,length,width,height,weight,quantity
Large Box,100,80,60,50,5
Medium Box,60,40,40,30,10
Small Box,30,30,30,15,20"""
    
    service = DataUploadService()
    result = service.import_items(csv_content, "test.csv")
    
    print("Import Result:")
    print(f"  Success: {result.success}")
    print(f"  Records imported: {result.records_imported}")
    print(f"  Records failed: {result.records_failed}")
    print(f"  Errors: {result.errors}")
    
    if result.data:
        print("\nImported Data:")
        for item in result.data:
            print(f"  - {item['name']}: {item['length']}x{item['width']}x{item['height']}")
