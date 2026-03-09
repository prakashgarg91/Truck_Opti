-- Migration: 20260309000000_contact_inquiries.sql
-- Creates the contact_inquiries table for the public Contact Us form.
-- Anyone (anon or authenticated) can insert; only admins can read.

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  phone      TEXT,
  subject    TEXT        NOT NULL DEFAULT 'General',
  message    TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous visitors) can submit a contact inquiry
CREATE POLICY "public can submit inquiry"
  ON contact_inquiries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read inquiries
CREATE POLICY "admin reads inquiries"
  ON contact_inquiries
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Only admins can update (mark as resolved)
CREATE POLICY "admin updates inquiries"
  ON contact_inquiries
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
