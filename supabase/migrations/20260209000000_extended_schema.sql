-- Extended schema migration for TruckOpti
-- Creates missing tables with RLS policies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PACKING JOBS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.packing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

COMMENT ON TABLE public.packing_jobs IS '3D bin packing optimization jobs';

-- RLS for packing_jobs
ALTER TABLE public.packing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own packing jobs"
    ON public.packing_jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own packing jobs"
    ON public.packing_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own packing jobs"
    ON public.packing_jobs FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own packing jobs"
    ON public.packing_jobs FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- PACKING ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.packing_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

COMMENT ON TABLE public.packing_items IS 'Individual items within a packing job';

-- RLS for packing_items (through packing_jobs)
ALTER TABLE public.packing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view packing items for their jobs"
    ON public.packing_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.packing_jobs 
            WHERE packing_jobs.id = packing_items.job_id 
            AND packing_jobs.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create packing items for their jobs"
    ON public.packing_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.packing_jobs 
            WHERE packing_jobs.id = packing_items.job_id 
            AND packing_jobs.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update packing items for their jobs"
    ON public.packing_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.packing_jobs 
            WHERE packing_jobs.id = packing_items.job_id 
            AND packing_jobs.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete packing items for their jobs"
    ON public.packing_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.packing_jobs 
            WHERE packing_jobs.id = packing_items.job_id 
            AND packing_jobs.user_id = auth.uid()
        )
    );

-- ============================================
-- SALE ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.sale_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

COMMENT ON TABLE public.sale_orders IS 'Customer sale orders for processing';

-- RLS for sale_orders
ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sale orders"
    ON public.sale_orders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sale orders"
    ON public.sale_orders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sale orders"
    ON public.sale_orders FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sale orders"
    ON public.sale_orders FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- SALE ORDER ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.sale_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

COMMENT ON TABLE public.sale_order_items IS 'Individual line items within a sale order';

-- RLS for sale_order_items
ALTER TABLE public.sale_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sale order items for their orders"
    ON public.sale_order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.sale_orders 
            WHERE sale_orders.id = sale_order_items.order_id 
            AND sale_orders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create sale order items for their orders"
    ON public.sale_order_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sale_orders 
            WHERE sale_orders.id = sale_order_items.order_id 
            AND sale_orders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update sale order items for their orders"
    ON public.sale_order_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.sale_orders 
            WHERE sale_orders.id = sale_order_items.order_id 
            AND sale_orders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete sale order items for their orders"
    ON public.sale_order_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.sale_orders 
            WHERE sale_orders.id = sale_order_items.order_id 
            AND sale_orders.user_id = auth.uid()
        )
    );

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

COMMENT ON TABLE public.notifications IS 'User notifications and alerts';

-- RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications for users"
    ON public.notifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications (mark as read)"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
    ON public.notifications FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- ANALYTICS EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb,
    session_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.analytics_events IS 'Analytics and tracking events';

-- RLS for analytics_events
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analytics events"
    ON public.analytics_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own analytics events"
    ON public.analytics_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_packing_jobs_user_id ON public.packing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_packing_jobs_status ON public.packing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_packing_jobs_created_at ON public.packing_jobs(created_at);

CREATE INDEX IF NOT EXISTS idx_packing_items_job_id ON public.packing_items(job_id);

CREATE INDEX IF NOT EXISTS idx_sale_orders_user_id ON public.sale_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_status ON public.sale_orders(status);
CREATE INDEX IF NOT EXISTS idx_sale_orders_order_number ON public.sale_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_sale_orders_created_at ON public.sale_orders(created_at);

CREATE INDEX IF NOT EXISTS idx_sale_order_items_order_id ON public.sale_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at);

-- ============================================
-- UPDATE TRIGGER FOR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_packing_jobs_updated_at
    BEFORE UPDATE ON public.packing_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sale_orders_updated_at
    BEFORE UPDATE ON public.sale_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- NOTIFICATION READ TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION public.set_notification_read_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_read = TRUE AND OLD.is_read = FALSE THEN
        NEW.read_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_notification_read_timestamp
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.set_notification_read_at();
