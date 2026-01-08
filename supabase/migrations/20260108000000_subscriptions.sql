-- TruckOpti Subscription & Billing Schema
-- Pricing: Starter ₹499, Growth ₹1,999, Professional ₹4,999, Enterprise ₹14,999

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create update_updated_at_column function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ============= SUBSCRIPTION PLANS TABLE =============
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_hi TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('starter', 'growth', 'professional', 'enterprise')),
  price_monthly INTEGER NOT NULL, -- INR (paise for precision)
  price_yearly INTEGER NOT NULL,  -- INR (paise)
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

-- Insert pricing tiers (60% margin included)
INSERT INTO subscription_plans (name, name_hi, tier, price_monthly, price_yearly, trucks_limit, shipments_monthly, users_limit, storage_gb, api_calls_monthly, sms_included, maps_requests_monthly, support_level, features) VALUES
  ('Starter', 'स्टार्टर', 'starter', 49900, 499900, 3, 50, 2, 1, 1000, 100, 500, 'email', '["basic_3d_packing", "route_planning", "shipment_tracking", "basic_reports"]'),
  ('Growth', 'ग्रोथ', 'growth', 199900, 1999900, 20, 500, 10, 10, 10000, 500, 5000, 'chat', '["advanced_3d_packing", "multi_stop_optimization", "live_tracking", "analytics_dashboard", "export_reports", "api_access"]'),
  ('Professional', 'प्रोफेशनल', 'professional', 499900, 4999900, 50, 2000, 25, 50, 50000, 2000, 20000, 'priority', '["enterprise_algorithms", "fleet_management", "custom_branding", "advanced_analytics", "webhook_integrations", "sla_guarantee"]'),
  ('Enterprise', 'एंटरप्राइज', 'enterprise', 1499900, 14999900, -1, -1, -1, 500, -1, 10000, -1, 'dedicated', '["unlimited_everything", "white_label", "custom_integrations", "dedicated_support", "on_premise_option", "custom_sla"]')
ON CONFLICT (name) DO NOTHING;

-- ============= SUBSCRIPTIONS TABLE =============
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
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

-- ============= USAGE TRACKING TABLE =============
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
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

-- ============= INVOICES TABLE =============
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  invoice_number TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL, -- paise
  tax_amount INTEGER DEFAULT 0, -- GST 18%
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

-- ============= ADD-ONS PURCHASES TABLE =============
CREATE TABLE IF NOT EXISTS addon_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  addon_type TEXT NOT NULL CHECK (addon_type IN ('sms_pack', 'storage', 'api_calls', 'priority_support')),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL, -- paise
  total_price INTEGER NOT NULL,
  valid_until TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'expired')),
  razorpay_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= PAYMENT HISTORY TABLE =============
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  subscription_id UUID REFERENCES subscriptions(id),
  invoice_id UUID REFERENCES invoices(id),
  amount INTEGER NOT NULL, -- paise
  currency TEXT DEFAULT 'INR',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'upi', 'netbanking', 'wallet')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= RLS POLICIES FOR SUBSCRIPTION TABLES =============
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Plans are readable by all authenticated users
CREATE POLICY "Anyone can read plans" ON subscription_plans FOR SELECT USING (true);

-- Users can only see their own subscriptions
CREATE POLICY "Users can view own subscription" ON subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own subscription" ON subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Users can only see their own usage
CREATE POLICY "Users can view own usage" ON usage_tracking FOR SELECT TO authenticated 
  USING (subscription_id IN (SELECT id FROM subscriptions WHERE user_id = auth.uid()));

-- Users can only see their own invoices
CREATE POLICY "Users can view own invoices" ON invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Users can only see their own add-ons
CREATE POLICY "Users can view own addons" ON addon_purchases FOR SELECT TO authenticated 
  USING (subscription_id IN (SELECT id FROM subscriptions WHERE user_id = auth.uid()));

-- Users can only see their own payment history
CREATE POLICY "Users can view own payments" ON payment_history FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============= FUNCTIONS FOR SUBSCRIPTION MANAGEMENT =============

-- Function to check if user has active subscription
CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM subscriptions 
    WHERE user_id = p_user_id 
    AND status IN ('active', 'trial')
    AND current_period_end > NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's current plan
CREATE OR REPLACE FUNCTION get_user_plan(p_user_id UUID)
RETURNS TABLE (
  plan_name TEXT,
  tier TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.name,
    sp.tier,
    s.status,
    s.current_period_end
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.user_id = p_user_id
  AND s.status IN ('active', 'trial')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(p_user_id UUID, p_resource TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  -- Get limit from plan
  SELECT 
    CASE p_resource
      WHEN 'shipments' THEN sp.shipments_monthly
      WHEN 'api_calls' THEN sp.api_calls_monthly
      WHEN 'sms' THEN sp.sms_included
      WHEN 'maps' THEN sp.maps_requests_monthly
    END INTO v_limit
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.user_id = p_user_id AND s.status = 'active';
  
  -- Unlimited (-1)
  IF v_limit = -1 THEN RETURN TRUE; END IF;
  
  -- Get current usage
  SELECT 
    CASE p_resource
      WHEN 'shipments' THEN ut.shipments_used
      WHEN 'api_calls' THEN ut.api_calls_used
      WHEN 'sms' THEN ut.sms_sent
      WHEN 'maps' THEN ut.maps_requests
    END INTO v_used
  FROM usage_tracking ut
  JOIN subscriptions s ON ut.subscription_id = s.id
  WHERE s.user_id = p_user_id
  AND ut.period_start <= NOW()
  AND ut.period_end > NOW();
  
  RETURN COALESCE(v_used, 0) < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_resource TEXT, p_amount INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
  UPDATE usage_tracking ut
  SET 
    shipments_used = CASE WHEN p_resource = 'shipments' THEN shipments_used + p_amount ELSE shipments_used END,
    api_calls_used = CASE WHEN p_resource = 'api_calls' THEN api_calls_used + p_amount ELSE api_calls_used END,
    sms_sent = CASE WHEN p_resource = 'sms' THEN sms_sent + p_amount ELSE sms_sent END,
    maps_requests = CASE WHEN p_resource = 'maps' THEN maps_requests + p_amount ELSE maps_requests END,
    updated_at = NOW()
  FROM subscriptions s
  WHERE ut.subscription_id = s.id
  AND s.user_id = p_user_id
  AND ut.period_start <= NOW()
  AND ut.period_end > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(NEXTVAL('invoice_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Create sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

-- ============= TRIGGERS =============
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_usage_tracking_updated_at BEFORE UPDATE ON usage_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to create usage tracking when subscription is created
CREATE OR REPLACE FUNCTION create_usage_tracking()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO usage_tracking (subscription_id, period_start, period_end)
  VALUES (NEW.id, NEW.current_period_start, NEW.current_period_end);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_subscription_insert
AFTER INSERT ON subscriptions
FOR EACH ROW EXECUTE FUNCTION create_usage_tracking();

-- ============= INDEXES =============
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_subscription_id ON usage_tracking(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);

-- ============= REALTIME =============
ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE usage_tracking;
