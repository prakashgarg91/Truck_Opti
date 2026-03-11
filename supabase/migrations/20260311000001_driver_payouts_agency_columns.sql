-- BATCH20 T3: Add agency_id and type to driver_payouts for agency-initiated payments
ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES transport_agencies(id),
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'withdrawal'
    CHECK (type IN ('withdrawal', 'agency_pay'));

-- Agency can read payouts for their drivers
CREATE POLICY "agency_reads_driver_payouts" ON driver_payouts
  FOR SELECT TO authenticated
  USING (
    agency_id IN (
      SELECT id FROM transport_agencies WHERE user_id = auth.uid()
    )
  );

-- Agency can insert payments to their drivers
CREATE POLICY "agency_inserts_driver_payout" ON driver_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    agency_id IN (
      SELECT id FROM transport_agencies WHERE user_id = auth.uid()
    )
    AND type = 'agency_pay'
  );
