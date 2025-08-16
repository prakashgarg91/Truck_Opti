#!/usr/bin/env python3
"""Test file upload functionality"""

import sys
import os
sys.path.append('.')

from app import create_app
from app.routes import process_sale_order_file
from werkzeug.datastructures import FileStorage
import io

def test_file_upload():
    """Test the file upload and processing functionality"""
    app = create_app()
    
    with app.app_context():
        # Test the file processing function
        with open('test_sale_orders.csv', 'rb') as f:
            file_content = f.read()
            
        file_like = io.BytesIO(file_content)
        file_storage = FileStorage(
            stream=file_like,
            filename='test_sale_orders.csv',
            content_type='text/csv'
        )

        print('Testing sale order file processing...')
        try:
            result = process_sale_order_file(file_storage, 'test_batch_verification', 'cost', True)
            print(f'Success: {result["success"]}')
            if result["success"]:
                print(f'Processed orders: {result["processed_orders"]}')
                print(f'Batch ID: {result["batch_id"]}')
            else:
                print(f'Error: {result["error"]}')
            return result
        except Exception as e:
            print(f'Exception: {e}')
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

if __name__ == "__main__":
    test_file_upload()