-- TruckOpti Production Database Setup
-- Run this in Supabase SQL Editor to verify/create all tables with RLS
-- Project: jbxncejtcbpcronndqlx.supabase.co

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. BASE TABLES (Existing)
-- ============================================

-- TRUCKS TABLE
CREATE TABLE IF NOT EXISTS public.trucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  length DECIMAL(10,2) NOT NULL,
  width DECIMAL(10,2) NOT NULL,
  height DECIMAL(10,2) NOT NULL,
  capacity DECIMAL(10,2) NOT NULL,
  cost_per_km DECIMAL(10,2) NOT NULL,
  available INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Indian truck catalog
INSERT INTO public.trucks (name, name_hi, length, width, height, capacity, cost_per_km, available) VALUES
  ('Tata Ace', 'टाटा एस', 2.2, 1.5, 1.2, 750, 12, 5),
  ('Tata 407', 'टाटा 407', 4.0, 1.8, 1.8, 2500, 18, 3),
  ('Eicher 14ft', 'आयशर 14 फुट', 4.26, 1.8, 1.8, 4000, 22, 4),
  ('Eicher 17ft', 'आयशर 17 फुट', 5.18, 2.1, 2.1, 6000, 28, 2),
  ('BharatBenz 24ft', 'भारत बेंज 24 फुट', 7.3, 2.3, 2.1, 9000, 35, 3),
  ('BharatBenz 32ft', 'भारत बेंज 32 फुट', 9.45, 2.4, 2.15, 15000, 45, 2),
  ('Ashok Leyland 19ft', 'अशोक लीलैंड 19 फुट', 5.8, 2.2, 2.0, 7000, 30, 2),
  ('Volvo 40ft Container', 'वोल्वो 40 फुट', 12.0, 2.35, 2.4, 25000, 60, 1)
ON CONFLICT DO NOTHING;

-- CARTONS TABLE
CREATE TABLE IF NOT EXISTS public.cartons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  length DECIMAL(10,2) NOT NULL,
  width DECIMAL(10,2) NOT NULL,
  height DECIMAL(10,2) NOT NULL,
  weight DECIMAL(10,2) NOT NULL,
  fragile BOOLEAN DEFAULT FALSE,
  stackable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
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

-- SHIPMENTS TABLE
CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  truck_id UUID REFERENCES public.trucks(id),
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

-- ROUTES TABLE
CREATE TABLE IF NOT EXISTS public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_location TEXT NOT NULL,
  destinations TEXT[] NOT NULL,
  total_distance DECIMAL(10,2) DEFAULT 0,
  total_time DECIMAL(10,2) DEFAULT 0,
  total_cost DECIMAL(10,2) DEFAULT 0,
  toll_cost DECIMAL(10,2) DEFAULT 0,
  fuel_cost DECIMAL(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PACKING RESULTS TABLE
CREATE TABLE IF NOT EXISTS public.packing_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES public.shipments(id),
  truck_id UUID REFERENCES public.trucks(id),
  algorithm TEXT NOT NULL,
  items_packed INTEGER NOT NULL,
  total_items INTEGER NOT NULL,
  volume_utilization DECIMAL(5,2) NOT NULL,
  weight_utilization DECIMAL(5,2) NOT NULL,
  packed_boxes JSONB NOT NULL,
  unfit_items TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
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

-- ============================================
-- 2. SUBSCRIPTION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_hi TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('starter', 'growth', 'professional', 'enterprise')),
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER NOT NULL,
  trucks_limit INTEGER NOT NULL,
  shipments_monthly INTEGER NOT NULL,
  users_limit INTEGER NOT NULL,
  storage_gb INTEGER NOT NULL,
  api_calls_monthly INTEGER NOT NULL,
  sms_included INTEGER NOT NULL,
  maps_requests_monthly INTEGER NOT NULL,
  support_level TEXT NOT NULL CHECK (support_level IN ('email', 'chat', 'priority', 'dedicated')),
  features JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.subscription_plans (name, name_hi, tier, price_monthly, price_yearly, trucks_limit, shipments_monthly, users_limit, storage_gb, api_calls_monthly, sms_included, maps_requests_monthly, support_level, features) VALUES
  ('Starter', 'स्टार्टर', 'starter', 49900, 499900, 3, 50, 2, 1, 1000, 100, 500, 'email', '["basic_3d_packing", "route_planning", "shipment_tracking", "basic_reports"]'),
  ('Growth', 'ग्रोथ', 'growth', 199900, 1999900, 20, 500, 10, 10, 10000, 500, 5000, 'chat', '["advanced_3d_packing", "multi_stop_optimization", "live_tracking", "analytics_dashboard", "export_reports", "api_access"]'),
  ('Professional', 'प्रोफेशनल', 'professional', 499900, 4999900, 50, 2000, 25, 50, 50000, 2000, 20000, 'priority', '["enterprise_algorithms", "fleet_management", "custom_branding", "advanced_analytics", "webhook_integrations", "sla_guarantee"]'),
  ('Enterprise', 'एंटरप्राइज', 'enterprise', 1499900, 14999900, -1, -1, -1, 500, -1, 10000, -1, 'dedicated', '["unlimited_everything", "white_label", "custom_integrations", "dedicated_support", "on_premise_option", "custom_sla"]')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired', 'trial')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  payment_method_id TEXT,
  razorpay_subscription_id TEXT,
  razorpay_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  shipments_used INTEGER DEFAULT 0,
  api_calls_used INTEGER DEFAULT 0,
  sms_sent INTEGER DEFAULT 0,
  maps_requests INTEGER DEFAULT 0,
  storage_used_mb INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  invoice_number TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  tax_amount INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  razorpay_invoice_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. EXTENDED TABLES (Required)
-- ============================================

-- PACKING JOBS TABLE
CREATE TABLE IF NOT EXISTS public.packing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  items JSONB DEFAULT '[]'::jsonb,
  volume_utilization DECIMAL(5,2) DEFAULT 0,
  weight_utilization DECIMAL(5,2) DEFAULT 0,
  total_cost DECIMAL(10,2) DEFAULT 0,
  algorithm VARCHAR(50) DEFAULT 'skyline',
  optimization_goal VARCHAR(20) DEFAULT 'space' CHECK (optimization_goal IN ('space', 'cost', 'balanced')),
  result_data JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- PACKING ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.packing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.packing_jobs(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  length DECIMAL(10,2) NOT NULL,
  width DECIMAL(10,2) NOT NULL,
  height DECIMAL(10,2) NOT NULL,
  weight DECIMAL(10,2) DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  fragile BOOLEAN DEFAULT FALSE,
  stackable BOOLEAN DEFAULT TRUE,
  category VARCHAR(100) DEFAULT 'General',
  position_x DECIMAL(10,2),
  position_y DECIMAL(10,2),
  position_z DECIMAL(10,2),
  rotation VARCHAR(10),
  is_packed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SALE ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.sale_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number VARCHAR(100) NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'packed', 'shipped', 'delivered', 'cancelled')),
  total_items INTEGER DEFAULT 0,
  total_volume DECIMAL(12,4) DEFAULT 0,
  total_weight DECIMAL(12,2) DEFAULT 0,
  total_value DECIMAL(12,2) DEFAULT 0,
  priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  delivery_address TEXT,
  delivery_city VARCHAR(100),
  delivery_state VARCHAR(100),
  delivery_pincode VARCHAR(20),
  expected_delivery_date DATE,
  packing_job_id UUID REFERENCES public.packing_jobs(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- SALE ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.sale_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sale_orders(id) ON DELETE CASCADE,
  product_code VARCHAR(100) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  description TEXT,
  length DECIMAL(10,2) NOT NULL,
  width DECIMAL(10,2) NOT NULL,
  height DECIMAL(10,2) NOT NULL,
  weight DECIMAL(10,2) DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total_price DECIMAL(12,2) DEFAULT 0,
  category VARCHAR(100) DEFAULT 'General',
  fragile BOOLEAN DEFAULT FALSE,
  stackable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500),
  action_label VARCHAR(100),
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- ANALYTICS EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  session_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. RLS POLICIES (Enable on ALL tables)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- TRUCKS: Public read, Authenticated write
CREATE POLICY IF NOT EXISTS "Public read access for trucks" ON public.trucks FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can insert trucks" ON public.trucks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can update trucks" ON public.trucks FOR UPDATE TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can delete trucks" ON public.trucks FOR DELETE TO authenticated USING (true);

-- CARTONS: Public read, Authenticated write
CREATE POLICY IF NOT EXISTS "Public read access for cartons" ON public.cartons FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can insert cartons" ON public.cartons FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can update cartons" ON public.cartons FOR UPDATE TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can delete cartons" ON public.cartons FOR DELETE TO authenticated USING (true);

-- CUSTOMERS: Authenticated CRUD
CREATE POLICY IF NOT EXISTS "Authenticated users can read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can delete customers" ON public.customers FOR DELETE TO authenticated USING (true);

-- SHIPMENTS: Authenticated CRU
CREATE POLICY IF NOT EXISTS "Authenticated users can read shipments" ON public.shipments FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can insert shipments" ON public.shipments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can update shipments" ON public.shipments FOR UPDATE TO authenticated USING (true);

-- ROUTES: Authenticated CRUD
CREATE POLICY IF NOT EXISTS "Authenticated users can read routes" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can insert routes" ON public.routes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can update routes" ON public.routes FOR UPDATE TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can delete routes" ON public.routes FOR DELETE TO authenticated USING (true);

-- PACKING RESULTS: Authenticated CR
CREATE POLICY IF NOT EXISTS "Authenticated users can read packing_results" ON public.packing_results FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Authenticated users can insert packing_results" ON public.packing_results FOR INSERT TO authenticated WITH CHECK (true);

-- USERS: Own profile only
CREATE POLICY IF NOT EXISTS "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY IF NOT EXISTS "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- SUBSCRIPTION PLANS: Public read
CREATE POLICY IF NOT EXISTS "Anyone can read plans" ON public.subscription_plans FOR SELECT USING (true);

-- SUBSCRIPTIONS: Own only
CREATE POLICY IF NOT EXISTS "Users can view own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can create own subscription" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can update own subscription" ON public.subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- USAGE TRACKING: Own subscription only
CREATE POLICY IF NOT EXISTS "Users can view own usage" ON public.usage_tracking FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.subscriptions WHERE subscriptions.id = usage_tracking.subscription_id AND subscriptions.user_id = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users can insert own usage" ON public.usage_tracking FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.subscriptions WHERE subscriptions.id = usage_tracking.subscription_id AND subscriptions.user_id = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users can update own usage" ON public.usage_tracking FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.subscriptions WHERE subscriptions.id = usage_tracking.subscription_id AND subscriptions.user_id = auth.uid()));

-- INVOICES: Own only
CREATE POLICY IF NOT EXISTS "Users can view own invoices" ON public.invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can create own invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- PACKING JOBS: Own only
CREATE POLICY IF NOT EXISTS "Users can view own packing jobs" ON public.packing_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can create own packing jobs" ON public.packing_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can update own packing jobs" ON public.packing_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can delete own packing jobs" ON public.packing_jobs FOR DELETE USING (auth.uid() = user_id);

-- PACKING ITEMS: Through packing_jobs
CREATE POLICY IF NOT EXISTS "Users can view packing items for their jobs" ON public.packing_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.packing_jobs WHERE packing_jobs.id = packing_items.job_id AND packing_jobs.user_id = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users can create packing items for their jobs" ON public.packing_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.packing_jobs WHERE packing_jobs.id = packing_items.job_id AND packing_jobs.user_id = auth.uid()));

-- SALE ORDERS: Own only
CREATE POLICY IF NOT EXISTS "Users can view own sale orders" ON public.sale_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can create own sale orders" ON public.sale_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can update own sale orders" ON public.sale_orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can delete own sale orders" ON public.sale_orders FOR DELETE USING (auth.uid() = user_id);

-- SALE ORDER ITEMS: Through sale_orders
CREATE POLICY IF NOT EXISTS "Users can view sale order items for their orders" ON public.sale_order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.sale_orders WHERE sale_orders.id = sale_order_items.order_id AND sale_orders.user_id = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users can create sale order items for their orders" ON public.sale_order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.sale_orders WHERE sale_orders.id = sale_order_items.order_id AND sale_orders.user_id = auth.uid()));

-- NOTIFICATIONS: Own only
CREATE POLICY IF NOT EXISTS "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can create own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- ANALYTICS EVENTS: Own only
CREATE POLICY IF NOT EXISTS "Users can view own analytics events" ON public.analytics_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can create own analytics events" ON public.analytics_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 5. INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON public.shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_routes_status ON public.routes(status);
CREATE INDEX IF NOT EXISTS idx_packing_results_shipment_id ON public.packing_results(shipment_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_packing_jobs_user_id ON public.packing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_packing_jobs_status ON public.packing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sale_orders_user_id ON public.sale_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_status ON public.sale_orders(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events(user_id);

-- ============================================
-- 6. REALTIME SUBSCRIPTIONS
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trucks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.packing_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_orders;

-- ============================================
-- 7. VERIFICATION VIEW
-- ============================================

CREATE OR REPLACE VIEW public.production_setup_status AS
SELECT 
  'trucks' as table_name, COUNT(*) as row_count FROM public.trucks
UNION ALL SELECT 'cartons', COUNT(*) FROM public.cartons
UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL SELECT 'shipments', COUNT(*) FROM public.shipments
UNION ALL SELECT 'routes', COUNT(*) FROM public.routes
UNION ALL SELECT 'packing_results', COUNT(*) FROM public.packing_results
UNION ALL SELECT 'users', COUNT(*) FROM public.users
UNION ALL SELECT 'subscription_plans', COUNT(*) FROM public.subscription_plans
UNION ALL SELECT 'subscriptions', COUNT(*) FROM public.subscriptions
UNION ALL SELECT 'packing_jobs', COUNT(*) FROM public.packing_jobs
UNION ALL SELECT 'packing_items', COUNT(*) FROM public.packing_items
UNION ALL SELECT 'sale_orders', COUNT(*) FROM public.sale_orders
UNION ALL SELECT 'sale_order_items', COUNT(*) FROM public.sale_order_items
UNION ALL SELECT 'notifications', COUNT(*) FROM public.notifications
UNION ALL SELECT 'analytics_events', COUNT(*) FROM public.analytics_events
UNION ALL SELECT 'invoices', COUNT(*) FROM public.invoices;

-- Run this to verify: SELECT * FROM public.production_setup_status;
