#!/usr/bin/env python3
"""
Manually create sale order tables
"""

import sqlite3
import os

# Connect to database
db_path = '/home/codespace/.truckopti/truck_opti.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create SaleOrderBatch table
cursor.execute('''
CREATE TABLE IF NOT EXISTS sale_order_batch (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_name VARCHAR(200) NOT NULL,
    filename VARCHAR(255),
    total_orders INTEGER DEFAULT 0,
    processed_orders INTEGER DEFAULT 0,
    failed_orders INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    processing_notes TEXT,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP
)
''')

# Create SaleOrder table
cursor.execute('''
CREATE TABLE IF NOT EXISTS sale_order (
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

# Drop existing table and recreate with all fields
cursor.execute('DROP TABLE IF EXISTS sale_order_item')

# Create SaleOrderItem table with all fields
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
cursor.execute('''
CREATE TABLE IF NOT EXISTS truck_recommendation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_order_id INTEGER NOT NULL,
    truck_type_id INTEGER NOT NULL,
    space_utilization FLOAT DEFAULT 0.0,
    weight_utilization FLOAT DEFAULT 0.0,
    estimated_cost FLOAT DEFAULT 0.0,
    packing_feasible BOOLEAN DEFAULT FALSE,
    packing_details JSON,
    overall_score FLOAT DEFAULT 0.0,
    recommendation_rank INTEGER DEFAULT 1,
    notes TEXT,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_order_id) REFERENCES sale_order (id),
    FOREIGN KEY (truck_type_id) REFERENCES truck_type (id)
)
''')

conn.commit()
conn.close()

print("✅ Sale Order tables created successfully!")

# Verify tables were created
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print(f"📊 Database tables: {', '.join(tables)}")
conn.close()