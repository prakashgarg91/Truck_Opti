#!/usr/bin/env python3
"""
Detailed debug of sale order processing
"""
import sys
import os
sys.path.append('/workspaces/Truck_Opti')

from app import create_app, db
from app.routes import process_sale_order_file
from werkzeug.datastructures import FileStorage
import io

def debug_processing():
    """Debug the sale order processing directly"""
    app = create_app()
    
    with app.app_context():
        try:
            print("🔍 Testing sale order processing directly...")
            
            # Read the sample file
            sample_file_path = "/workspaces/Truck_Opti/sample_sale_orders.csv"
            with open(sample_file_path, 'r') as f:
                file_content = f.read()
            
            print(f"✅ Read file content ({len(file_content)} characters)")
            
            # Create a FileStorage object to mimic the upload
            file_obj = FileStorage(
                stream=io.BytesIO(file_content.encode('utf-8')),
                filename='sample_sale_orders.csv',
                content_type='text/csv'
            )
            
            print("📤 Processing file...")
            result = process_sale_order_file(file_obj, "Debug_Test_Batch")
            
            print(f"📊 Processing result: {result}")
            
            if result['success']:
                print("✅ Processing succeeded!")
                batch_id = result['batch_id']
                
                # Check what was created in the database
                from app.models import SaleOrder, SaleOrderBatch, TruckRecommendation
                
                batch = SaleOrderBatch.query.get(batch_id)
                print(f"📋 Batch: {batch.batch_name} - {batch.status}")
                
                orders = SaleOrder.query.filter_by(batch_id=batch_id).all()
                print(f"📦 Created {len(orders)} sale orders:")
                
                for order in orders:
                    print(f"   - {order.sale_order_number}: {order.total_items} items")
                    recommendations = TruckRecommendation.query.filter_by(sale_order_id=order.id).all()
                    print(f"     💡 {len(recommendations)} truck recommendations")
                    
                    for rec in recommendations[:2]:  # Show top 2
                        print(f"       • Rank {rec.recommendation_rank}: {rec.overall_score:.2f} score")
            else:
                print(f"❌ Processing failed: {result.get('error', 'Unknown error')}")
                
        except Exception as e:
            print(f"❌ Debug failed: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    debug_processing()