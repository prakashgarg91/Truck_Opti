-- BATCH14 T3: Driver Payouts Table
-- Create driver_payouts table for driver withdrawal requests

CREATE TABLE IF NOT EXISTS driver_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  note TEXT
);

-- Enable RLS
ALTER TABLE driver_payouts ENABLE ROW LEVEL SECURITY;

-- Driver can read their own payouts
CREATE POLICY "driver_reads_own_payouts" ON driver_payouts
  FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

-- Driver can insert their own payout requests
CREATE POLICY "driver_inserts_own_payout" ON driver_payouts
  FOR INSERT TO authenticated
  WITH CHECK (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

-- Admins can manage all payouts
CREATE POLICY "admin_manages_payouts" ON driver_payouts
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
