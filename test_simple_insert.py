#!/usr/bin/env python3
"""
Simple test to insert a sale order record
"""
import sys
import os
sys.path.append('/workspaces/Truck_Opti')

from app import create_app, db
from app.models import SaleOrder, SaleOrderBatch
from datetime import datetime

def test_insert():
    """Test inserting a sale order record"""
    app = create_app()
    
    with app.app_context():
        try:
            # Create batch first
            batch = SaleOrderBatch(
                batch_name="Test_Batch",
                filename="test.csv",
                total_orders=1,
                status='processing'
            )
            db.session.add(batch)
            db.session.flush()
            
            print(f"✅ Created batch with ID: {batch.id}")
            
            # Create sale order
            sale_order = SaleOrder(
                sale_order_number="TEST001",
                batch_id=batch.id,
                customer_name="Test Customer",
                delivery_address="Test Address",
                total_items=1
            )
            db.session.add(sale_order)
            db.session.flush()
            
            print(f"✅ Created sale order with ID: {sale_order.id}")
            
            db.session.commit()
            print("✅ Successfully committed transaction")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            db.session.rollback()

if __name__ == "__main__":
    test_insert()