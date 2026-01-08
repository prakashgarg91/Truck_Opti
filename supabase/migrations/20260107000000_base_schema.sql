-- TruckOpti Supabase Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============= TRUCKS TABLE =============
CREATE TABLE IF NOT EXISTS trucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  length DECIMAL(10,2) NOT NULL, -- meters
  width DECIMAL(10,2) NOT NULL,  -- meters
  height DECIMAL(10,2) NOT NULL, -- meters
  capacity DECIMAL(10,2) NOT NULL, -- kg
  cost_per_km DECIMAL(10,2) NOT NULL, -- INR
  available INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Indian truck catalog
INSERT INTO trucks (name, name_hi, length, width, height, capacity, cost_per_km, available) VALUES
  ('Tata Ace', 'टाटा एस', 2.2, 1.5, 1.2, 750, 12, 5),
  ('Tata 407', 'टाटा 407', 4.0, 1.8, 1.8, 2500, 18, 3),
  ('Eicher 14ft', 'आयशर 14 फुट', 4.26, 1.8, 1.8, 4000, 22, 4),
  ('Eicher 17ft', 'आयशर 17 फुट', 5.18, 2.1, 2.1, 6000, 28, 2),
  ('BharatBenz 24ft', 'भारत बेंज 24 फुट', 7.3, 2.3, 2.1, 9000, 35, 3),
  ('BharatBenz 32ft', 'भारत बेंज 32 फुट', 9.45, 2.4, 2.15, 15000, 45, 2),
  ('Ashok Leyland 19ft', 'अशोक लीलैंड 19 फुट', 5.8, 2.2, 2.0, 7000, 30, 2),
  ('Volvo 40ft Container', 'वोल्वो 40 फुट', 12.0, 2.35, 2.4, 25000, 60, 1)
ON CONFLICT DO NOTHING;

-- ============= CARTONS TABLE =============
CREATE TABLE IF NOT EXISTS cartons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  length DECIMAL(10,2) NOT NULL, -- cm
  width DECIMAL(10,2) NOT NULL,  -- cm
  height DECIMAL(10,2) NOT NULL, -- cm
  weight DECIMAL(10,2) NOT NULL, -- kg
  fragile BOOLEAN DEFAULT FALSE,
  stackable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sample cartons
INSERT INTO cartons (name, length, width, height, weight, fragile, stackable) VALUES
  ('Small Box', 30, 25, 20, 5, false, true),
  ('Medium Box', 45, 35, 30, 10, false, true),
  ('Large Box', 60, 45, 40, 15, false, true),
  ('Electronics Box', 50, 40, 35, 8, true, false),
  ('Fragile Glass', 40, 40, 50, 12, true, false)
ON CONFLICT DO NOTHING;

-- ============= CUSTOMERS TABLE =============
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  gst_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sample customers
INSERT INTO customers (name, phone, email, address, city, state, pincode) VALUES
  ('Rajesh Industries', '+919876543210', 'rajesh@industries.com', '123 Industrial Area', 'Mumbai', 'Maharashtra', '400001'),
  ('Sharma Traders', '+919123456789', 'sharma.traders@gmail.com', '456 Market Road', 'Delhi', 'Delhi', '110001'),
  ('South Star Logistics', '+918765432109', 'info@southstar.in', '789 Logistics Park', 'Chennai', 'Tamil Nadu', '600001')
ON CONFLICT DO NOTHING;

-- ============= SHIPMENTS TABLE =============
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  truck_id UUID REFERENCES trucks(id),
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'delivered', 'cancelled')),
  total_weight DECIMAL(10,2) DEFAULT 0,
  total_volume DECIMAL(10,2) DEFAULT 0,
  estimated_cost DECIMAL(10,2) DEFAULT 0,
  driver_name TEXT,
  vehicle_number TEXT,
  latitude DECIMAL(10,6),
  longitude DECIMAL(10,6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= ROUTES TABLE =============
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_location TEXT NOT NULL,
  destinations TEXT[] NOT NULL,
  total_distance DECIMAL(10,2) DEFAULT 0, -- km
  total_time DECIMAL(10,2) DEFAULT 0, -- minutes
  total_cost DECIMAL(10,2) DEFAULT 0, -- INR
  toll_cost DECIMAL(10,2) DEFAULT 0,
  fuel_cost DECIMAL(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= PACKING RESULTS TABLE =============
CREATE TABLE IF NOT EXISTS packing_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id),
  truck_id UUID REFERENCES trucks(id),
  algorithm TEXT NOT NULL,
  items_packed INTEGER NOT NULL,
  total_items INTEGER NOT NULL,
  volume_utilization DECIMAL(5,2) NOT NULL,
  weight_utilization DECIMAL(5,2) NOT NULL,
  packed_boxes JSONB NOT NULL,
  unfit_items TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= USERS TABLE (extends Supabase auth.users) =============
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  phone_verified BOOLEAN DEFAULT FALSE,
  google_linked BOOLEAN DEFAULT FALSE,
  profile_picture TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'driver', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= ROW LEVEL SECURITY (RLS) =============
ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Public read access for trucks and cartons (catalog)
CREATE POLICY "Public read access for trucks" ON trucks FOR SELECT USING (true);
CREATE POLICY "Public read access for cartons" ON cartons FOR SELECT USING (true);

-- Authenticated users can CRUD customers
CREATE POLICY "Authenticated users can read customers" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customers" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customers" ON customers FOR DELETE TO authenticated USING (true);

-- Authenticated users can CRUD shipments
CREATE POLICY "Authenticated users can read shipments" ON shipments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert shipments" ON shipments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update shipments" ON shipments FOR UPDATE TO authenticated USING (true);

-- Authenticated users can CRUD routes
CREATE POLICY "Authenticated users can read routes" ON routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert routes" ON routes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update routes" ON routes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete routes" ON routes FOR DELETE TO authenticated USING (true);

-- Authenticated users can CRUD packing results
CREATE POLICY "Authenticated users can read packing_results" ON packing_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert packing_results" ON packing_results FOR INSERT TO authenticated WITH CHECK (true);

-- Users can only see their own profile
CREATE POLICY "Users can view own profile" ON users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ============= TRIGGERS FOR updated_at =============
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_trucks_updated_at BEFORE UPDATE ON trucks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cartons_updated_at BEFORE UPDATE ON cartons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============= INDEXES FOR PERFORMANCE =============
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
CREATE INDEX IF NOT EXISTS idx_packing_results_shipment_id ON packing_results(shipment_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ============= REALTIME SUBSCRIPTIONS =============
-- Enable realtime for shipments (for live tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE trucks;
