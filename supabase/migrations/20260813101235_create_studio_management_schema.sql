/*
# Bollywood Umang Production - Studio Management Schema

## Overview
Creates the complete database schema for a single-tenant studio management application
(no sign-in screen). All tables use anon/authenticated RLS policies so the anon-key
frontend can read and write its own data.

## New Tables
1. `business_settings` - Single-row table for business branding, logo URL, UPI QR URL, and editable Hindi terms.
2. `clients` - Client/customer records with contact details.
3. `bookings` - Master booking/project ledger per client. Tracks grand total, received, balance, status.
4. `booking_work_entries` - Unlimited work log entries per booking (date, work type, description, qty, rate, total).
5. `payments` - Multiple dated advance/final payments per booking from clients.
6. `photographers` - Photographer profiles with rates, specialization, UPI/bank details.
7. `photographer_payments` - Payments made to photographers (tracked separately from client billing).
8. `booking_photographers` - Many-to-many: multiple photographers assigned per booking.
9. `studio_work` - Editing/mixing/design tasks assigned to studio workers with status and priority.
10. `users` - Admin/staff user accounts with role-based access control.

## Security
- RLS enabled on ALL tables.
- All policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because this is a single-tenant app with no sign-in screen — data is intentionally
  shared/public and accessed via the anon key.
- A storage bucket `invoice-assets` is created (public) for logo and UPI QR uploads.

## Important Notes
1. No `user_id` columns or `auth.users` foreign keys — single-tenant, no auth.
2. Currency stored as numeric; formatting done in the app (INR, no GST).
3. Grand total / received / balance are computed in-app from work entries and payments,
   but also cached on the bookings row for fast dashboard queries.
4. `business_settings` is enforced single-row via a unique constraint on a fixed key.
*/

-- ============================================================
-- BUSINESS SETTINGS (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS business_settings (
  id integer PRIMARY KEY DEFAULT 1,
  business_name text NOT NULL DEFAULT 'Bollywood Umang Production',
  tagline text NOT NULL DEFAULT 'Video • Photography • Design • Editing',
  head_office text NOT NULL DEFAULT 'Darbhanga',
  production_office text NOT NULL DEFAULT 'Kamtaul',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  logo_url text DEFAULT '',
  upi_id text DEFAULT '',
  upi_qr_url text DEFAULT '',
  terms_hindi jsonb NOT NULL DEFAULT '[
    "कृपया बिल की राशि समय पर जमा करें।",
    "एक बार भुगतान किया गया एडवांस सामान्यतः वापस नहीं किया जाएगा।",
    "किसी भी जानकारी के लिए हमारे कार्यालय से संपर्क करें।",
    "धन्यवाद! बॉलीवुड उमंग प्रोडक्शन को सेवा का अवसर देने के लिए धन्यवाद।"
  ]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_business_settings" ON business_settings;
CREATE POLICY "anon_select_business_settings" ON business_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_business_settings" ON business_settings;
CREATE POLICY "anon_insert_business_settings" ON business_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_business_settings" ON business_settings;
CREATE POLICY "anon_update_business_settings" ON business_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO business_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- USERS (admin/staff with roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  phone text DEFAULT '',
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'manager', 'staff')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text DEFAULT '',
  address text DEFAULT '',
  notes text DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_clients" ON clients;
CREATE POLICY "anon_select_clients" ON clients FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_clients" ON clients;
CREATE POLICY "anon_insert_clients" ON clients FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_clients" ON clients;
CREATE POLICY "anon_update_clients" ON clients FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_clients" ON clients;
CREATE POLICY "anon_delete_clients" ON clients FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);
CREATE INDEX IF NOT EXISTS idx_clients_archived ON clients (archived);

-- ============================================================
-- BOOKINGS (master project ledger)
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  event_date date,
  event_type text DEFAULT '',
  venue text DEFAULT '',
  notes text DEFAULT '',
  grand_total numeric NOT NULL DEFAULT 0,
  total_received numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Running Bill' CHECK (status IN ('Running Bill', 'Advance Paid', 'Balance Due', 'Final Settled')),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bookings" ON bookings;
CREATE POLICY "anon_select_bookings" ON bookings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bookings" ON bookings;
CREATE POLICY "anon_insert_bookings" ON bookings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bookings" ON bookings;
CREATE POLICY "anon_update_bookings" ON bookings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bookings" ON bookings;
CREATE POLICY "anon_delete_bookings" ON bookings FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings (client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings (event_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_archived ON bookings (archived);

-- ============================================================
-- BOOKING WORK ENTRIES (unlimited work log per booking)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  work_type text NOT NULL DEFAULT '',
  description text DEFAULT '',
  qty numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE booking_work_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_work_entries" ON booking_work_entries;
CREATE POLICY "anon_select_work_entries" ON booking_work_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_work_entries" ON booking_work_entries;
CREATE POLICY "anon_insert_work_entries" ON booking_work_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_work_entries" ON booking_work_entries;
CREATE POLICY "anon_update_work_entries" ON booking_work_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_work_entries" ON booking_work_entries;
CREATE POLICY "anon_delete_work_entries" ON booking_work_entries FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_work_entries_booking ON booking_work_entries (booking_id);

-- ============================================================
-- PAYMENTS (client payments per booking)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text DEFAULT 'Cash' CHECK (method IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other')),
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_payments" ON payments;
CREATE POLICY "anon_select_payments" ON payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_payments" ON payments;
CREATE POLICY "anon_insert_payments" ON payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_payments" ON payments;
CREATE POLICY "anon_update_payments" ON payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_payments" ON payments;
CREATE POLICY "anon_delete_payments" ON payments FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);

-- ============================================================
-- PHOTOGRAPHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS photographers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text DEFAULT '',
  specialization text DEFAULT '',
  daily_rate numeric NOT NULL DEFAULT 0,
  upi_id text DEFAULT '',
  bank_details text DEFAULT '',
  total_earned numeric NOT NULL DEFAULT 0,
  total_paid numeric NOT NULL DEFAULT 0,
  pending numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photographers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_photographers" ON photographers;
CREATE POLICY "anon_select_photographers" ON photographers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_photographers" ON photographers;
CREATE POLICY "anon_insert_photographers" ON photographers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_photographers" ON photographers;
CREATE POLICY "anon_update_photographers" ON photographers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_photographers" ON photographers;
CREATE POLICY "anon_delete_photographers" ON photographers FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- BOOKING PHOTOGRAPHERS (many-to-many assignments)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_photographers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  assigned_date date DEFAULT CURRENT_DATE,
  role text DEFAULT 'Photographer',
  fee numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE booking_photographers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_booking_photographers" ON booking_photographers;
CREATE POLICY "anon_select_booking_photographers" ON booking_photographers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_booking_photographers" ON booking_photographers;
CREATE POLICY "anon_insert_booking_photographers" ON booking_photographers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_booking_photographers" ON booking_photographers;
CREATE POLICY "anon_update_booking_photographers" ON booking_photographers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_booking_photographers" ON booking_photographers;
CREATE POLICY "anon_delete_booking_photographers" ON booking_photographers FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_bp_booking ON booking_photographers (booking_id);
CREATE INDEX IF NOT EXISTS idx_bp_photographer ON booking_photographers (photographer_id);

-- ============================================================
-- PHOTOGRAPHER PAYMENTS (separate from client billing)
-- ============================================================
CREATE TABLE IF NOT EXISTS photographer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text DEFAULT 'Cash' CHECK (method IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other')),
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photographer_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_photographer_payments" ON photographer_payments;
CREATE POLICY "anon_select_photographer_payments" ON photographer_payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_photographer_payments" ON photographer_payments;
CREATE POLICY "anon_insert_photographer_payments" ON photographer_payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_photographer_payments" ON photographer_payments;
CREATE POLICY "anon_update_photographer_payments" ON photographer_payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_photographer_payments" ON photographer_payments;
CREATE POLICY "anon_delete_photographer_payments" ON photographer_payments FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_pp_photographer ON photographer_payments (photographer_id);
CREATE INDEX IF NOT EXISTS idx_pp_date ON photographer_payments (payment_date);

-- ============================================================
-- STUDIO WORK (internal staff tasks)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  work_type text NOT NULL DEFAULT 'Editing' CHECK (work_type IN ('Editing', 'Color Grading', 'Album Design', 'Video Mixing', 'Printing', 'Other Studio Work')),
  assigned_to text DEFAULT '',
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Review', 'Completed', 'Delivered')),
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  due_date date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE studio_work ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_studio_work" ON studio_work;
CREATE POLICY "anon_select_studio_work" ON studio_work FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_studio_work" ON studio_work;
CREATE POLICY "anon_insert_studio_work" ON studio_work FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_studio_work" ON studio_work;
CREATE POLICY "anon_update_studio_work" ON studio_work FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_studio_work" ON studio_work;
CREATE POLICY "anon_delete_studio_work" ON studio_work FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_studio_work_status ON studio_work (status);
CREATE INDEX IF NOT EXISTS idx_studio_work_priority ON studio_work (priority);
CREATE INDEX IF NOT EXISTS idx_studio_work_due ON studio_work (due_date);

-- ============================================================
-- STORAGE BUCKET for invoice-assets (logo + UPI QR)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-assets', 'invoice-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_select_invoice_assets" ON storage.objects;
CREATE POLICY "anon_select_invoice_assets" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'invoice-assets');

DROP POLICY IF EXISTS "anon_insert_invoice_assets" ON storage.objects;
CREATE POLICY "anon_insert_invoice_assets" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'invoice-assets');

DROP POLICY IF EXISTS "anon_update_invoice_assets" ON storage.objects;
CREATE POLICY "anon_update_invoice_assets" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'invoice-assets') WITH CHECK (bucket_id = 'invoice-assets');

DROP POLICY IF EXISTS "anon_delete_invoice_assets" ON storage.objects;
CREATE POLICY "anon_delete_invoice_assets" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'invoice-assets');
