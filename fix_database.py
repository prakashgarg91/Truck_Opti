#!/usr/bin/env python3
"""
Fix the database by dropping and recreating sale order tables with correct schema
"""
import sqlite3
import os

# Connect to the correct database
db_path = '/home/codespace/.truckopti/truck_opti.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Drop existing sale order tables (in correct order due to foreign keys)
print("🗑️ Dropping existing sale order tables...")
cursor.execute('DROP TABLE IF EXISTS truck_recommendation')
cursor.execute('DROP TABLE IF EXISTS sale_order_item')
cursor.execute('DROP TABLE IF EXISTS sale_order')
cursor.execute('DROP TABLE IF EXISTS sale_order_batch')

# Create SaleOrderBatch table
print("📋 Creating SaleOrderBatch table...")
cursor.execute('''
CREATE TABLE sale_order_batch (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_name VARCHAR(200) NOT NULL,
    filename VARCHAR(255),
    total_orders INTEGER DEFAULT 0,
    processed_orders INTEGER DEFAULT 0,
    failed_orders INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    processing_notes TEXT,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_completed DATETIME
)
''')

# Create SaleOrder table with ALL fields from the model
print("📋 Creating SaleOrder table...")
cursor.execute('''
CREATE TABLE sale_order (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_order_number VARCHAR(100) NOT NULL,
    batch_id INTEGER,
    customer_name VARCHAR(200),
    order_date DATE,
    delivery_address TEXT,
    priority INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending',
    total_items INTEGER DEFAULT 0,
    total_volume FLOAT DEFAULT 0.0,
    total_weight FLOAT DEFAULT 0.0,
    recommended_truck_id INTEGER,
    optimization_score FLOAT DEFAULT 0.0,
    estimated_utilization FLOAT DEFAULT 0.0,
    estimated_cost FLOAT DEFAULT 0.0,
    processing_notes TEXT,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_processed DATETIME,
    FOREIGN KEY (batch_id) REFERENCES sale_order_batch (id),
    FOREIGN KEY (recommended_truck_id) REFERENCES truck_type (id)
)
''')

# Create SaleOrderItem table with ALL fields from the model
print("📋 Creating SaleOrderItem table...")
cursor.execute('''
CREATE TABLE sale_order_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_order_id INTEGER NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_length FLOAT DEFAULT 0.0,
    unit_width FLOAT DEFAULT 0.0,
    unit_height FLOAT DEFAULT 0.0,
    unit_weight FLOAT DEFAULT 0.0,
    unit_value FLOAT DEFAULT 0.0,
    category VARCHAR(100) DEFAULT 'General',
    fragile BOOLEAN DEFAULT FALSE,
    stackable BOOLEAN DEFAULT TRUE,
    total_volume FLOAT DEFAULT 0.0,
    total_weight FLOAT DEFAULT 0.0,
    notes TEXT,
    FOREIGN KEY (sale_order_id) REFERENCES sale_order (id)
)
''')

# Create TruckRecommendation table
print("📋 Creating TruckRecommendation table...")
cursor.execute('''
CREATE TABLE truck_recommendation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_order_id INTEGER NOT NULL,
    truck_type_id INTEGER NOT NULL,
    space_utilization FLOAT DEFAULT 0.0,
    weight_utilization FLOAT DEFAULT 0.0,
    estimated_cost FLOAT DEFAULT 0.0,
    packing_feasible BOOLEAN DEFAULT FALSE,
    packing_details TEXT,
    overall_score FLOAT DEFAULT 0.0,
    recommendation_rank INTEGER DEFAULT 1,
    notes TEXT,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    ranking INTEGER DEFAULT 1,
    efficiency_score FLOAT DEFAULT 0.0,
    fits_completely BOOLEAN DEFAULT TRUE,
    overflow_items INTEGER DEFAULT 0,
    recommendation_reason TEXT,
    FOREIGN KEY (sale_order_id) REFERENCES sale_order (id),
    FOREIGN KEY (truck_type_id) REFERENCES truck_type (id)
)
''')

conn.commit()
conn.close()

print("✅ Database schema fixed successfully!")

# Verify the schema
print("\n📊 Verifying sale_order table schema:")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(sale_order)")
columns = cursor.fetchall()
for col in columns:
    print(f"   - {col[1]} ({col[2]})")

conn.close()
print("\n🎉 Database is ready for Sale Order processing!")