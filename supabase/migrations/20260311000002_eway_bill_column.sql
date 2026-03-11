-- BATCH20 T7: Add e-way bill data column to shipments
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS eway_bill_data JSONB;
