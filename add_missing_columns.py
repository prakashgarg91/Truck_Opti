#!/usr/bin/env python3
"""
Add missing columns to truck_recommendation table
"""
import sqlite3

# Connect to database
db_path = '/home/codespace/.truckopti/truck_opti.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    print("🔧 Adding missing columns to truck_recommendation table...")
    
    # Add missing columns
    cursor.execute('ALTER TABLE truck_recommendation ADD COLUMN utilization_score FLOAT DEFAULT 0.0')
    print("✅ Added utilization_score column")
    
    cursor.execute('ALTER TABLE truck_recommendation ADD COLUMN cost_score FLOAT DEFAULT 0.0')
    print("✅ Added cost_score column")
    
    cursor.execute('ALTER TABLE truck_recommendation ADD COLUMN date_calculated DATETIME DEFAULT CURRENT_TIMESTAMP')
    print("✅ Added date_calculated column")
    
    conn.commit()
    print("🎉 All missing columns added successfully!")
    
    # Verify the schema
    print("\n📊 Updated truck_recommendation table schema:")
    cursor.execute("PRAGMA table_info(truck_recommendation)")
    columns = cursor.fetchall()
    for col in columns:
        print(f"   - {col[1]} ({col[2]})")

except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print(f"⚠️ Column already exists: {e}")
    else:
        print(f"❌ Error: {e}")
except Exception as e:
    print(f"❌ Unexpected error: {e}")

finally:
    conn.close()
    print("\n✅ Database connection closed")