-- BATCH13 T1: Fix RLS Security Vulnerabilities (BUG-RLS-001 to BUG-RLS-006)
-- Fixes cross-tenant data exposure by adding ownership columns and scoped policies

-- ============================================
-- STEP 1: Add created_by column to user-owned tables
-- ============================================

-- Add created_by to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add created_by to shipments table
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add created_by to routes table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add created_by to packing_results table
ALTER TABLE packing_results ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- ============================================
-- STEP 2: Fix customers table policies (BUG-RLS-001)
-- ============================================

-- Drop old overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can read customers" ON customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON customers;
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON customers;

-- Create ownership-scoped policies for customers
CREATE POLICY "customers_select_own" ON customers
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "customers_insert_own" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "customers_update_own" ON customers
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "customers_delete_own" ON customers
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- ============================================
-- STEP 3: Fix shipments table policies (BUG-RLS-002)
-- ============================================

-- Drop old overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can read shipments" ON shipments;
DROP POLICY IF EXISTS "Authenticated users can insert shipments" ON shipments;
DROP POLICY IF EXISTS "Authenticated users can update shipments" ON shipments;

-- Create ownership-scoped policies for shipments
CREATE POLICY "shipments_select_own" ON shipments
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "shipments_insert_own" ON shipments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "shipments_update_own" ON shipments
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- ============================================
-- STEP 4: Fix routes table policies (BUG-RLS-003)
-- ============================================

-- Drop old overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can read routes" ON routes;
DROP POLICY IF EXISTS "Authenticated users can insert routes" ON routes;
DROP POLICY IF EXISTS "Authenticated users can update routes" ON routes;
DROP POLICY IF EXISTS "Authenticated users can delete routes" ON routes;

-- Create ownership-scoped policies for routes
CREATE POLICY "routes_select_own" ON routes
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "routes_insert_own" ON routes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "routes_update_own" ON routes
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "routes_delete_own" ON routes
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- ============================================
-- STEP 5: Fix packing_results policies (BUG-RLS-004)
-- ============================================

-- Drop old overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can read packing_results" ON packing_results;
DROP POLICY IF EXISTS "Authenticated users can insert packing_results" ON packing_results;

-- Create ownership-scoped policies for packing_results
CREATE POLICY "packing_results_select_own" ON packing_results
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "packing_results_insert_own" ON packing_results
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- ============================================
-- STEP 6: Fix trucks table policies (BUG-RLS-005)
-- Reference data: remove write access, keep only public read
-- ============================================

-- Drop overly permissive write policies on trucks
DROP POLICY IF EXISTS "Public read access for trucks" ON trucks;
DROP POLICY IF EXISTS "Authenticated users can insert trucks" ON trucks;
DROP POLICY IF EXISTS "Authenticated users can update trucks" ON trucks;
DROP POLICY IF EXISTS "Authenticated users can delete trucks" ON trucks;

-- Create read-only policy (reference data)
CREATE POLICY "Anyone can read trucks" ON trucks FOR SELECT USING (true);

-- ============================================
-- STEP 7: Fix cartons table policies (BUG-RLS-006)
-- Reference data: remove write access, keep only public read
-- ============================================

-- Drop overly permissive write policies on cartons
DROP POLICY IF EXISTS "Public read access for cartons" ON cartons;
DROP POLICY IF EXISTS "Authenticated users can insert cartons" ON cartons;
DROP POLICY IF EXISTS "Authenticated users can update cartons" ON cartons;
DROP POLICY IF EXISTS "Authenticated users can delete cartons" ON cartons;

-- Create read-only policy (reference data)
CREATE POLICY "Anyone can read cartons" ON cartons FOR SELECT USING (true);

-- ============================================
-- STEP 8: Fix production_setup.sql duplicate policies
-- These policies also exist in production_setup.sql and need to be removed/updated
-- ============================================

-- Drop duplicate policies from production_setup if they exist
DROP POLICY IF EXISTS "Public read access for trucks" ON public.trucks;
DROP POLICY IF EXISTS "Authenticated users can insert trucks" ON public.trucks;
DROP POLICY IF EXISTS "Authenticated users can update trucks" ON public.trucks;
DROP POLICY IF EXISTS "Authenticated users can delete trucks" ON public.trucks;

DROP POLICY IF EXISTS "Public read access for cartons" ON public.cartons;
DROP POLICY IF EXISTS "Authenticated users can insert cartons" ON public.cartons;
DROP POLICY IF EXISTS "Authenticated users can update cartons" ON public.cartons;
DROP POLICY IF EXISTS "Authenticated users can delete cartons" ON public.cartons;

DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;

DROP POLICY IF EXISTS "Authenticated users can read shipments" ON public.shipments;
DROP POLICY IF EXISTS "Authenticated users can insert shipments" ON public.shipments;
DROP POLICY IF EXISTS "Authenticated users can update shipments" ON public.shipments;

DROP POLICY IF EXISTS "Authenticated users can read routes" ON public.routes;
DROP POLICY IF EXISTS "Authenticated users can insert routes" ON public.routes;
DROP POLICY IF EXISTS "Authenticated users can update routes" ON public.routes;
DROP POLICY IF EXISTS "Authenticated users can delete routes" ON public.routes;

DROP POLICY IF EXISTS "Authenticated users can read packing_results" ON public.packing_results;
DROP POLICY IF EXISTS "Authenticated users can insert packing_results" ON public.packing_results;

-- Create proper ownership-scoped policies on public schema
-- customers
CREATE POLICY "customers_select_own" ON public.customers
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "customers_insert_own" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "customers_update_own" ON public.customers
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "customers_delete_own" ON public.customers
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- shipments
CREATE POLICY "shipments_select_own" ON public.shipments
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "shipments_insert_own" ON public.shipments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "shipments_update_own" ON public.shipments
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- routes
CREATE POLICY "routes_select_own" ON public.routes
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "routes_insert_own" ON public.routes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "routes_update_own" ON public.routes
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "routes_delete_own" ON public.routes
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- packing_results
CREATE POLICY "packing_results_select_own" ON public.packing_results
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "packing_results_insert_own" ON public.packing_results
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- trucks - read only
CREATE POLICY "Anyone can read trucks" ON public.trucks FOR SELECT USING (true);

-- cartons - read only
CREATE POLICY "Anyone can read cartons" ON public.cartons FOR SELECT USING (true);
