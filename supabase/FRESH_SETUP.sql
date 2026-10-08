-- FRESH Supabase setup bundle for Bollywood Umang Studio.
-- WARNING: Run only on a fresh/empty app database with no business data to preserve.
-- Contains the existing timestamped migrations in filename order.
-- Do not add credentials or service-role keys to this file.


-- ============================================================================
-- BEGIN MIGRATION: 20260813101235_create_studio_management_schema.sql
-- ============================================================================
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

-- END MIGRATION: 20260813101235_create_studio_management_schema.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260814205956_add_structured_booking_tables.sql
-- ============================================================================
/*
# Bollywood Umang Production - Structured Booking & KhataBook Schema Upgrade

## Overview
Adds structured booking detail tables (event functions, shoot schedules, video shoot checklist,
album work checklist, live setup items, studio items, deliverables, shoot assignments) and
new calculation columns on bookings (base_amount, discount, net_total). Also adds
independent storage for photographer payments (SET NULL on booking delete so photographer
accounts survive booking deletion).

## New Tables
1. `booking_functions` - Event function checkboxes (Haldi, Mehendi, Wedding, etc.) + custom functions, with include_in_bill flag.
2. `shoot_schedules` - Per-function shoot start/end date+time slots.
3. `video_shoots` - Video shoot checklist rows (capture type, quality, qty, rate, total).
4. `album_work` - Album work checklist rows (album type, size, paper, box, sheets, rate, total).
5. `live_setup_items` - Live setup items (TV, Projector, LED Wall, Broadcast) qty/rate/total.
6. `studio_items` - Other studio work items (custom title, qty, rate, total).
7. `deliverables` - Deliverables checklist (traditional/cinematic/reel/raw data flags).
8. `shoot_assignments` - Multi-staff assignment per booking/function with role tags.

## Modified Tables
- `bookings`: Added `base_amount`, `discount`, `net_total` columns for the calculation engine.
- `photographer_payments`: Changed `booking_id` FK to ON DELETE SET NULL (independent storage).
- `booking_photographers`: Changed `booking_id` FK to ON DELETE SET NULL (photographer records survive).

## Security
- RLS enabled on all new tables with anon/authenticated full CRUD (single-tenant, no auth).

## Important Notes
1. All new tables use ON DELETE CASCADE for booking_id (except photographer-related which use SET NULL).
2. The calculation engine runs in the frontend; these columns are cached for dashboard queries.
3. Photographer financial data (payments, assignments) survives booking deletion.
*/

-- ============================================================
-- ADD COLUMNS TO bookings
-- ============================================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS base_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS net_total numeric NOT NULL DEFAULT 0;

-- ============================================================
-- BOOKING FUNCTIONS (event function checkboxes)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  include_in_bill boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE booking_functions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_booking_functions" ON booking_functions;
CREATE POLICY "anon_select_booking_functions" ON booking_functions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_booking_functions" ON booking_functions;
CREATE POLICY "anon_insert_booking_functions" ON booking_functions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_booking_functions" ON booking_functions;
CREATE POLICY "anon_update_booking_functions" ON booking_functions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_booking_functions" ON booking_functions;
CREATE POLICY "anon_delete_booking_functions" ON booking_functions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_bf_booking ON booking_functions (booking_id);

-- ============================================================
-- SHOOT SCHEDULES (per-function date/time slots)
-- ============================================================
CREATE TABLE IF NOT EXISTS shoot_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  function_name text NOT NULL DEFAULT '',
  start_date date,
  start_time text DEFAULT '',
  end_date date,
  end_time text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shoot_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_shoot_schedules" ON shoot_schedules;
CREATE POLICY "anon_select_shoot_schedules" ON shoot_schedules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_shoot_schedules" ON shoot_schedules;
CREATE POLICY "anon_insert_shoot_schedules" ON shoot_schedules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_shoot_schedules" ON shoot_schedules;
CREATE POLICY "anon_update_shoot_schedules" ON shoot_schedules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_shoot_schedules" ON shoot_schedules;
CREATE POLICY "anon_delete_shoot_schedules" ON shoot_schedules FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ss_booking ON shoot_schedules (booking_id);

-- ============================================================
-- VIDEO SHOOTS (video shoot checklist)
-- ============================================================
CREATE TABLE IF NOT EXISTS video_shoots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  capture_type text NOT NULL DEFAULT 'Traditional Video',
  quality text NOT NULL DEFAULT '1080p',
  qty numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE video_shoots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_video_shoots" ON video_shoots;
CREATE POLICY "anon_select_video_shoots" ON video_shoots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_video_shoots" ON video_shoots;
CREATE POLICY "anon_insert_video_shoots" ON video_shoots FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_video_shoots" ON video_shoots;
CREATE POLICY "anon_update_video_shoots" ON video_shoots FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_video_shoots" ON video_shoots;
CREATE POLICY "anon_delete_video_shoots" ON video_shoots FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_vs_booking ON video_shoots (booking_id);

-- ============================================================
-- ALBUM WORK (album work checklist)
-- ============================================================
CREATE TABLE IF NOT EXISTS album_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  album_type text NOT NULL DEFAULT 'Karizma Album',
  size text NOT NULL DEFAULT '12x36',
  paper_quality text NOT NULL DEFAULT 'Glossy',
  box_bag text NOT NULL DEFAULT 'No',
  sheets numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE album_work ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_album_work" ON album_work;
CREATE POLICY "anon_select_album_work" ON album_work FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_album_work" ON album_work;
CREATE POLICY "anon_insert_album_work" ON album_work FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_album_work" ON album_work;
CREATE POLICY "anon_update_album_work" ON album_work FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_album_work" ON album_work;
CREATE POLICY "anon_delete_album_work" ON album_work FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_aw_booking ON album_work (booking_id);

-- ============================================================
-- LIVE SETUP ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS live_setup_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  setup_type text NOT NULL DEFAULT 'TV',
  qty numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE live_setup_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_live_setup" ON live_setup_items;
CREATE POLICY "anon_select_live_setup" ON live_setup_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_live_setup" ON live_setup_items;
CREATE POLICY "anon_insert_live_setup" ON live_setup_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_live_setup" ON live_setup_items;
CREATE POLICY "anon_update_live_setup" ON live_setup_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_live_setup" ON live_setup_items;
CREATE POLICY "anon_delete_live_setup" ON live_setup_items FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ls_booking ON live_setup_items (booking_id);

-- ============================================================
-- STUDIO ITEMS (other studio work)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  qty numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE studio_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_studio_items" ON studio_items;
CREATE POLICY "anon_select_studio_items" ON studio_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_studio_items" ON studio_items;
CREATE POLICY "anon_insert_studio_items" ON studio_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_studio_items" ON studio_items;
CREATE POLICY "anon_update_studio_items" ON studio_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_studio_items" ON studio_items;
CREATE POLICY "anon_delete_studio_items" ON studio_items FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_si_booking ON studio_items (booking_id);

-- ============================================================
-- DELIVERABLES (checklist for printed bill)
-- ============================================================
CREATE TABLE IF NOT EXISTS deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  album_delivery boolean NOT NULL DEFAULT false,
  traditional_full boolean NOT NULL DEFAULT false,
  traditional_highlight boolean NOT NULL DEFAULT false,
  cinematic_highlight boolean NOT NULL DEFAULT false,
  cinematic_reel boolean NOT NULL DEFAULT false,
  cinematic_reel_count integer NOT NULL DEFAULT 0,
  cinematic_story boolean NOT NULL DEFAULT false,
  raw_full_video boolean NOT NULL DEFAULT false,
  raw_selected_photos boolean NOT NULL DEFAULT false,
  raw_all_photos boolean NOT NULL DEFAULT false,
  raw_edited_photos boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_deliverables" ON deliverables;
CREATE POLICY "anon_select_deliverables" ON deliverables FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_deliverables" ON deliverables;
CREATE POLICY "anon_insert_deliverables" ON deliverables FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_deliverables" ON deliverables;
CREATE POLICY "anon_update_deliverables" ON deliverables FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_deliverables" ON deliverables;
CREATE POLICY "anon_delete_deliverables" ON deliverables FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_del_booking ON deliverables (booking_id);

-- ============================================================
-- SHOOT ASSIGNMENTS (multi-staff per booking/function)
-- ============================================================
CREATE TABLE IF NOT EXISTS shoot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  photographer_id uuid REFERENCES photographers(id) ON DELETE SET NULL,
  function_name text DEFAULT '',
  role text NOT NULL DEFAULT 'Photographer',
  gear_notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shoot_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_shoot_assignments" ON shoot_assignments;
CREATE POLICY "anon_select_shoot_assignments" ON shoot_assignments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_shoot_assignments" ON shoot_assignments;
CREATE POLICY "anon_insert_shoot_assignments" ON shoot_assignments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_shoot_assignments" ON shoot_assignments;
CREATE POLICY "anon_update_shoot_assignments" ON shoot_assignments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_shoot_assignments" ON shoot_assignments;
CREATE POLICY "anon_delete_shoot_assignments" ON shoot_assignments FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sa_booking ON shoot_assignments (booking_id);
CREATE INDEX IF NOT EXISTS idx_sa_photographer ON shoot_assignments (photographer_id);

-- ============================================================
-- MODIFY photographer_payments FK to SET NULL (independent storage)
-- ============================================================
ALTER TABLE photographer_payments DROP CONSTRAINT IF EXISTS photographer_payments_booking_id_fkey;
ALTER TABLE photographer_payments ADD CONSTRAINT photographer_payments_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- ============================================================
-- MODIFY booking_photographers FK to SET NULL (independent storage)
-- ============================================================
ALTER TABLE booking_photographers DROP CONSTRAINT IF EXISTS booking_photographers_booking_id_fkey;
ALTER TABLE booking_photographers ADD CONSTRAINT booking_photographers_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- END MIGRATION: 20260814205956_add_structured_booking_tables.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260816021933_reinitialize_studio_schema.sql
-- ============================================================================
/*
# Reinitialize Studio Management Schema

## Overview
Complete schema reset for the Bollywood Umang Studio Management & Billing app.
Drops all old tables and creates 4 new tables matching the new simplified data model.

## New Tables

### 1. studio_settings (single-row, id=1)
Unified settings table holding business profile, logos, stamp, and Hindi terms.
- films_title, films_subtitle — branding for the Films (B2C) unit
- production_title, production_subtitle — branding for the Production (B2B) unit
- address, phone, email — contact info
- films_insta, production_insta — Instagram handles
- bank_name, bank_details — payment info shown on bills
- stamp_image_url, films_logo_url, production_logo_url — image URLs
- terms_conditions — Hindi terms text shown on bills
- CHECK constraint enforces single row (id = 1)

### 2. bookings (B2C Films Hub)
Client-facing event bookings for photography/videography.
- booking_no — human-readable unique booking number
- client_name, client_mobile, client_address — client info
- event_function — type of event (Wedding, Birthday, etc.)
- shoot_date, shoot_time, venue — event logistics
- booking_status — CONFIRMED, COMPLETED, CANCELLED
- services (jsonb) — array of service line items
- deliverables (jsonb) — array of deliverable items
- total_amount, advance_paid — billing amounts
- net_due — generated column (total_amount - advance_paid)

### 3. studio_lab_orders (B2B Production Hub)
Lab work orders from other studios (B2B).
- order_no — unique order number
- studio_name, studio_mobile — client studio info
- project_name, work_type — work description
- today_work_amount, previous_back_due, advance_received — billing
- current_total_due — total outstanding
- order_status — Processing, Completed, Delivered
- delivery_mode, parcel_tracking_details — logistics

### 4. photographer_ledger (Two-Way Ledger)
Photographer financial ledger with debit/credit entries.
- photographer_name, mobile — photographer info
- entry_type — LAB_WORK_DEBIT, SHOOT_DUTY_CREDIT, PAYMENT_SETTLED
- description — entry description
- amount — entry amount

## Security
- RLS enabled on all 4 tables.
- Single-tenant no-auth app: all policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)` because the data is intentionally shared/public.
- 4 policies per table (SELECT, INSERT, UPDATE, DELETE).

## Notes
1. Old tables (bookings, studio_lab_orders, studio_settings, photographer_ledger, and all previously created tables) are dropped first with CASCADE.
2. The app has no sign-in screen, so anon-key access is required for all operations.
3. No user_id columns or auth.uid() references — this is a single-tenant shared-data app.
*/

-- ============================================================
-- DROP OLD TABLES
-- ============================================================
DROP TABLE IF EXISTS booking_work_entries CASCADE;
DROP TABLE IF EXISTS booking_functions CASCADE;
DROP TABLE IF EXISTS shoot_schedules CASCADE;
DROP TABLE IF EXISTS video_shoots CASCADE;
DROP TABLE IF EXISTS album_work CASCADE;
DROP TABLE IF EXISTS live_setup_items CASCADE;
DROP TABLE IF EXISTS studio_items CASCADE;
DROP TABLE IF EXISTS deliverables CASCADE;
DROP TABLE IF EXISTS shoot_assignments CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS photographers CASCADE;
DROP TABLE IF EXISTS booking_photographers CASCADE;
DROP TABLE IF EXISTS photographer_payments CASCADE;
DROP TABLE IF EXISTS studio_work CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS studio_lab_orders CASCADE;
DROP TABLE IF EXISTS studio_settings CASCADE;
DROP TABLE IF EXISTS photographer_ledger CASCADE;

-- ============================================================
-- 1. STUDIO SETTINGS (single row)
-- ============================================================
CREATE TABLE studio_settings (
  id int PRIMARY KEY DEFAULT 1,
  films_title text DEFAULT 'Bollywood Umang Films',
  films_subtitle text DEFAULT '(A Unit of Bollywood Umang Production) • Premium Photography & Cinematography Services',
  production_title text DEFAULT 'Bollywood Umang Production',
  production_subtitle text DEFAULT 'Video Mixing Lab & Post-Production Hub',
  address text DEFAULT 'Kamtaul, Darbhanga, Bihar',
  phone text DEFAULT '+91 9122441332',
  email text DEFAULT 'bollywoodumanginfo@gmail.com',
  films_insta text DEFAULT '@bollywoodumang_films',
  production_insta text DEFAULT '@bollywoodumang.production',
  bank_name text DEFAULT 'Bollywood Umang Production',
  bank_details text DEFAULT 'Cash / UPI / Bank Transfer',
  stamp_image_url text DEFAULT '',
  films_logo_url text DEFAULT '',
  production_logo_url text DEFAULT '',
  terms_conditions text DEFAULT '1. अग्रिम भुगतान (Advance Payment): शूट की निर्धारित तिथि से ठीक 7 दिन पूर्व कुल पैकेज राशि का न्यूनतम 50% भुगतान अनिवार्य है।
2. डेटा सुपुर्दगी (Data Collection): पूर्ण भुगतान कर 30 दिनों के भीतर समस्त डेटा, पेन ड्राइव व एल्बम प्राप्त करना अनिवार्य है।
3. डेटा सुरक्षा व दायित्व: डिलीवरी तैयार होने के 30 दिनों के बाद डेटा सुरक्षित रखने की कोई जिम्मेदारी स्टूडियो की नहीं होगी।
4. स्वीकृति (Agreement): बुकिंग अथवा अग्रिम भुगतान करते ही ग्राहक उपर्युक्त सभी शर्तों को पूर्णतः स्वीकार करता है।',
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO studio_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. BOOKINGS (B2C Films Hub)
-- ============================================================
CREATE TABLE bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_no text UNIQUE NOT NULL,
  client_name text NOT NULL,
  client_mobile text NOT NULL,
  client_address text DEFAULT '',
  event_function text NOT NULL,
  shoot_date text NOT NULL,
  shoot_time text DEFAULT '',
  venue text DEFAULT '',
  booking_status text DEFAULT 'CONFIRMED',
  services jsonb DEFAULT '[]'::jsonb,
  deliverables jsonb DEFAULT '[]'::jsonb,
  total_amount numeric DEFAULT 0,
  advance_paid numeric DEFAULT 0,
  net_due numeric GENERATED ALWAYS AS (total_amount - advance_paid) STORED,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 3. STUDIO LAB ORDERS (B2B Production Hub)
-- ============================================================
CREATE TABLE studio_lab_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_no text UNIQUE NOT NULL,
  studio_name text NOT NULL,
  studio_mobile text NOT NULL,
  project_name text NOT NULL,
  work_type text NOT NULL,
  today_work_amount numeric DEFAULT 0,
  previous_back_due numeric DEFAULT 0,
  advance_received numeric DEFAULT 0,
  current_total_due numeric DEFAULT 0,
  order_status text DEFAULT 'Processing',
  delivery_mode text DEFAULT 'By Hand',
  parcel_tracking_details text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 4. PHOTOGRAPHER LEDGER (Two-Way)
-- ============================================================
CREATE TABLE photographer_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  photographer_name text NOT NULL,
  mobile text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('LAB_WORK_DEBIT', 'SHOOT_DUTY_CREDIT', 'PAYMENT_SETTLED')),
  description text,
  amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- RLS POLICIES (single-tenant, no auth — anon + authenticated)
-- ============================================================

-- studio_settings
ALTER TABLE studio_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_settings" ON studio_settings;
CREATE POLICY "anon_select_settings" ON studio_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_settings" ON studio_settings;
CREATE POLICY "anon_insert_settings" ON studio_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_settings" ON studio_settings;
CREATE POLICY "anon_update_settings" ON studio_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_settings" ON studio_settings;
CREATE POLICY "anon_delete_settings" ON studio_settings FOR DELETE TO anon, authenticated USING (true);

-- bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_bookings" ON bookings;
CREATE POLICY "anon_select_bookings" ON bookings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bookings" ON bookings;
CREATE POLICY "anon_insert_bookings" ON bookings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_bookings" ON bookings;
CREATE POLICY "anon_update_bookings" ON bookings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_bookings" ON bookings;
CREATE POLICY "anon_delete_bookings" ON bookings FOR DELETE TO anon, authenticated USING (true);

-- studio_lab_orders
ALTER TABLE studio_lab_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_lab_orders" ON studio_lab_orders;
CREATE POLICY "anon_select_lab_orders" ON studio_lab_orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_lab_orders" ON studio_lab_orders;
CREATE POLICY "anon_insert_lab_orders" ON studio_lab_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_lab_orders" ON studio_lab_orders;
CREATE POLICY "anon_update_lab_orders" ON studio_lab_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_lab_orders" ON studio_lab_orders;
CREATE POLICY "anon_delete_lab_orders" ON studio_lab_orders FOR DELETE TO anon, authenticated USING (true);

-- photographer_ledger
ALTER TABLE photographer_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_ledger" ON photographer_ledger;
CREATE POLICY "anon_select_ledger" ON photographer_ledger FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ledger" ON photographer_ledger;
CREATE POLICY "anon_insert_ledger" ON photographer_ledger FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ledger" ON photographer_ledger;
CREATE POLICY "anon_update_ledger" ON photographer_ledger FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ledger" ON photographer_ledger;
CREATE POLICY "anon_delete_ledger" ON photographer_ledger FOR DELETE TO anon, authenticated USING (true);

-- END MIGRATION: 20260816021933_reinitialize_studio_schema.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260816041943_add_payments_table.sql
-- ============================================================================
-- Add payments / transactions table
create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  receipt_no text unique not null,
  source text not null default 'Booking',
  party_name text not null,
  party_mobile text default '',
  mode text not null default 'Cash',
  amount numeric default 0,
  date text not null,
  note text default '',
  created_at timestamp with time zone default now()
);

alter table payments enable row level security;

create policy "select_payments" on payments for select
  to anon, authenticated using (true);
create policy "insert_payments" on payments for insert
  to anon, authenticated with check (true);
create policy "update_payments" on payments for update
  to anon, authenticated using (true) with check (true);
create policy "delete_payments" on payments for delete
  to anon, authenticated using (true);

-- END MIGRATION: 20260816041943_add_payments_table.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260816102115_add_ledger_settlement_fields.sql
-- ============================================================================
/*
# Add Settlement Fields to Photographer Ledger

## Overview
Adds `payment_mode` and `payment_date` columns to the `photographer_ledger` table
so that PAYMENT_SETTLED entries can record the payment method (Cash/UPI/Bank)
and the date the settlement was made, alongside the existing `description` (notes)
and `amount` fields.

## Changes
1. Modified Tables
   - `photographer_ledger`
     - `payment_mode` (text, default '') — Cash, UPI, or Bank for settlement entries
     - `payment_date` (text, default '') — date of the settlement payment

## Security
- No RLS policy changes needed — existing policies already allow full CRUD for anon+authenticated.

## Notes
1. These columns are optional (default '') so existing rows are unaffected.
2. The `description` column continues to serve as the notes field for all entry types.
3. `payment_mode` and `payment_date` are only populated for PAYMENT_SETTLED entries.
*/

ALTER TABLE photographer_ledger
  ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';

ALTER TABLE photographer_ledger
  ADD COLUMN IF NOT EXISTS payment_date text DEFAULT '';

-- END MIGRATION: 20260816102115_add_ledger_settlement_fields.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260816122901_upgrade_booking_lab_schema.sql
-- ============================================================================
/*
# Upgrade Booking & Lab Order Schema

## Overview
Restructures the bookings and studio_lab_orders tables to support the new
detailed form structure: discount-based billing for bookings, and dynamic
video/album line-item rows for lab orders.

## Changes

### 1. bookings table
- Add `discount` (numeric, default 0) — discount amount deducted from total.
- Add `deliverables_data` (jsonb, default '{}') — structured deliverables object
  replacing the old flat `deliverables` array. Stores album notes, video flags,
  cinematic flags (with reel count), and raw data flags.
- The `net_due` generated column is recalculated as (total_amount - discount - advance_paid).
  Since we cannot ALTER a generated column in place, we drop and re-add it.
- The old `services` jsonb column and `deliverables` jsonb column are kept for
  backward compatibility (no data loss) but the app now uses `deliverables_data`
  and `total_amount` + `discount` instead.

### 2. studio_lab_orders table
- Add `video_rows` (jsonb, default '[]') — array of video mixing/editing line items.
  Each item: { video_type, quality, qty, rate, total }.
- Add `album_rows` (jsonb, default '[]') — array of album design/printing line items.
  Each item: { album_type, size, paper, box, sheets, qty, rate, total }.
- The `today_work_amount` column is now auto-calculated from the row totals in the
  app and stored directly (no schema change needed — it remains numeric).

## Security
- No RLS policy changes — existing policies allow full CRUD for anon+authenticated.

## Notes
1. All new columns have defaults so existing rows are unaffected.
2. The `net_due` generated column is dropped and recreated with the new formula.
3. Old `services` and `deliverables` columns are retained but no longer used by the app.
*/

-- ============================================================
-- BOOKINGS: add discount, deliverables_data, fix net_due
-- ============================================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deliverables_data jsonb DEFAULT '{}'::jsonb;

-- Recreate net_due generated column with discount
ALTER TABLE bookings DROP COLUMN IF EXISTS net_due;
ALTER TABLE bookings ADD COLUMN net_due numeric GENERATED ALWAYS AS (total_amount - discount - advance_paid) STORED;

-- ============================================================
-- STUDIO_LAB_ORDERS: add video_rows, album_rows
-- ============================================================
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS video_rows jsonb DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS album_rows jsonb DEFAULT '[]'::jsonb;

-- END MIGRATION: 20260816122901_upgrade_booking_lab_schema.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260816180037_add_base_amount_to_bookings.sql
-- ============================================================================
-- Add base_amount column to bookings — standalone reference field, does NOT participate in net_due calculation
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS base_amount numeric DEFAULT 0;

-- END MIGRATION: 20260816180037_add_base_amount_to_bookings.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260818011255_upgrade_lab_order_multi_client_schema.sql
-- ============================================================================
/*
# Upgrade Lab Work Order: Multi-Client, Partner Sync, Payment Engine

1. Overview
This migration upgrades the `studio_lab_orders` table to support:
- Partner profile auto-sync from the Ledger (partner_id, partner_name, studio_address).
- Multiple end-cllients per lab order (clients JSONB array), each with its own video & album repeaters.
- Master billing engine: total_album_bill, total_video_bill, current_order_total, master_total, advance_paid, net_final_due.
- Payment section: payment_mode, payment_date, payment_note.
- Backward-compatible: keeps existing video_rows/album_rows columns for legacy reads.

2. studio_lab_orders — new columns
- partner_id (uuid, nullable) — links to partners table
- partner_name (text) — synced partner name
- studio_address (text) — synced studio address
- clients (jsonb) — array of LabClientRow objects (multi-client repeaters)
- total_album_bill (numeric) — sum of all client album totals
- total_video_bill (numeric) — sum of all client video totals
- current_order_total (numeric) — total_album_bill + total_video_bill
- master_total (numeric) — current_order_total + previous_back_due
- advance_paid (numeric) — replaces advance_received (kept for compat)
- net_final_due (numeric) — master_total - advance_paid
- payment_mode (text) — Cash, UPI, Bank Transfer, etc.
- payment_date (text) — payment date
- payment_note (text) — transaction ID / UTR / payer name / note

3. studio_settings — new column
- whatsapp_number (text) — studio WhatsApp number for global sync

4. Security
- No new tables; RLS already enabled on both tables.
- No policy changes needed — existing anon/authenticated policies cover new columns.
*/

-- studio_lab_orders new columns
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS partner_id uuid;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS partner_name text DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS studio_address text DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS clients jsonb DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS total_album_bill numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS total_video_bill numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS current_order_total numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS master_total numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS advance_paid numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS net_final_due numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_date text DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_note text DEFAULT '';

-- studio_settings new column
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS whatsapp_number text DEFAULT '+91 9122441332';

-- END MIGRATION: 20260818011255_upgrade_lab_order_multi_client_schema.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260819050713_add_studio_profile_and_upi_fields.sql
-- ============================================================================
/*
# Add Studio Profile and UPI Fields to studio_settings

1. New Columns on `studio_settings`
- `alternate_phone` (text) — secondary contact number for the studio.
- `branch_address` (text) — branch office address (head office uses existing `address` column).
- `upi_id` (text) — UPI ID for dynamic QR payment generation (e.g. yourname@upi).

2. Notes
- All columns are nullable text with empty-string defaults so existing rows remain valid.
- No security changes — `studio_settings` already has RLS enabled with anon/authenticated CRUD policies.
- Idempotent: uses DO $$ ... IF NOT EXISTS ... END $$ so re-running is safe.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'studio_settings' AND column_name = 'alternate_phone') THEN
    ALTER TABLE studio_settings ADD COLUMN alternate_phone text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'studio_settings' AND column_name = 'branch_address') THEN
    ALTER TABLE studio_settings ADD COLUMN branch_address text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'studio_settings' AND column_name = 'upi_id') THEN
    ALTER TABLE studio_settings ADD COLUMN upi_id text DEFAULT '';
  END IF;
END $$;
-- END MIGRATION: 20260819050713_add_studio_profile_and_upi_fields.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260823193943_add_client_portal_login_fields.sql
-- ============================================================================
/*
# Add Client Portal Login Fields to Bookings

1. New Columns on `bookings`
- `is_login_allowed` (boolean, NOT NULL, default false) — admin toggle to enable/disable client portal access per booking
- `client_password` (text, NOT NULL, default '') — the password the client uses to log into the portal; defaults to the client's mobile number on insert
- `password_changed` (boolean, NOT NULL, default false) — tracks whether the password has been changed from the default (mobile number)

2. Backfill
- Existing rows get `is_login_allowed = false`, `client_password = client_mobile` (so the default password is their mobile), `password_changed = false`.

3. Security
- No RLS policy changes. The bookings table already has anon/authenticated CRUD policies (single-tenant app).
- The new columns are accessible via the same existing policies.

4. Important Notes
- The admin can toggle `is_login_allowed` at any time from the Bookings detail view.
- "Reset Password to Default" sets `client_password` back to `client_mobile` and `password_changed` to false.
- The client portal login checks `is_login_allowed` before allowing access.
*/
-- END MIGRATION: 20260823193943_add_client_portal_login_fields.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260827090000_add_staff_privacy_security.sql
-- ============================================================================
-- Staff lifecycle, duty assignments, settlements, and admin PIN support.
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS master_pin text DEFAULT '';

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text NOT NULL UNIQUE,
  studio_name text DEFAULT '',
  studio_address text DEFAULT '',
  category text NOT NULL DEFAULT 'Photographer Freelancer',
  status text NOT NULL DEFAULT 'Active',
  leave_start date,
  leave_end date,
  note text DEFAULT '',
  trashed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS leave_start date;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS leave_end date;

CREATE TABLE IF NOT EXISTS direct_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  partner_mobile text NOT NULL,
  txn_type text NOT NULL CHECK (txn_type IN ('Given', 'Received')),
  amount numeric NOT NULL DEFAULT 0,
  payment_mode text DEFAULT 'Cash',
  txn_date date DEFAULT CURRENT_DATE,
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shoot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id),
  function_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  reporting_time text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS petrol_allowance numeric DEFAULT 0;

ALTER TABLE studio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoot_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_partners" ON partners;
CREATE POLICY "anon_all_partners" ON partners FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_direct_transactions" ON direct_transactions;
CREATE POLICY "anon_all_direct_transactions" ON direct_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_shoot_assignments" ON shoot_assignments;
CREATE POLICY "anon_all_shoot_assignments" ON shoot_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- END MIGRATION: 20260827090000_add_staff_privacy_security.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260827100000_add_archive_recycle_metadata.sql
-- ============================================================================
-- Additive lifecycle metadata for 90-day recycle-bin retention.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- END MIGRATION: 20260827100000_add_archive_recycle_metadata.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260827110000_add_lab_payment_history.sql
-- ============================================================================
-- Additive lab order payment history and promised delivery date.
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_history jsonb DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS promised_delivery_date date;

-- END MIGRATION: 20260827110000_add_lab_payment_history.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260828100000_add_production_terms.sql
-- ============================================================================
-- Separate B2B Production/Lab terms from B2C Films terms.
ALTER TABLE studio_settings
  ADD COLUMN IF NOT EXISTS production_terms text DEFAULT '';

-- END MIGRATION: 20260828100000_add_production_terms.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260908125329_add_portal_password_and_partners.sql
-- ============================================================================
/*
# Add Client Portal Login Fields + Partner Portal with Password Management

This migration adds all missing portal login and partner management
infrastructure in one pass.

## 1. Client Portal Login Fields on `bookings`
- `client_password` (text, NOT NULL, default '') — password for client
  portal login; defaults to the client's mobile number.
- `password_changed` (boolean, NOT NULL, default false) — tracks whether
  the password has been changed from the default.
- `is_login_allowed` (boolean, NOT NULL, default false) — controls
  whether the client is permitted to log into the portal.
- Backfill: existing rows get `client_password = client_mobile`,
  `is_login_allowed = false`.

## 2. Partners Table (Staff/Crew Portal)
- `partners` table with columns: id, name, mobile (unique), studio_name,
  studio_address, category, status, leave_start, leave_end, note,
  trashed_at, created_at, updated_at.
- Portal password columns: `portal_password` (text, default ''),
  `password_changed` (boolean, default false),
  `is_login_allowed` (boolean, default false).
- Backfill: `portal_password = mobile` for any existing rows.

## 3. Direct Transactions Table
- Records money given to / received from partners.
- `partner_id` references `partners(id)` with cascade delete.

## 4. Shoot Assignments Table
- Links partners to bookings with function name, role, reporting time.
- `booking_id` references `bookings(id)` with cascade delete.
- `partner_id` references `partners(id)`.

## 5. Photographer Ledger Extensions
- Adds `payment_mode`, `payment_date`, `petrol_allowance` columns.

## 6. Studio Settings Extension
- Adds `master_pin` column for admin PIN protection.

## 7. Security (RLS)
- Enables RLS on all new tables.
- All tables use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because this is a single-admin app (no Supabase Auth sign-in) where the
  anon key client needs full CRUD access.
*/

-- 1. Client portal login fields on bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_password text NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  UPDATE bookings SET client_password = client_mobile WHERE client_password = '';
END $$;

-- 2. Partners table
CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text NOT NULL UNIQUE,
  studio_name text DEFAULT '',
  studio_address text DEFAULT '',
  category text NOT NULL DEFAULT 'Photographer Freelancer',
  status text NOT NULL DEFAULT 'Active',
  leave_start date,
  leave_end date,
  note text DEFAULT '',
  trashed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE partners ADD COLUMN IF NOT EXISTS portal_password text NOT NULL DEFAULT '';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  UPDATE partners SET portal_password = mobile WHERE portal_password = '';
END $$;

-- 3. Direct transactions table
CREATE TABLE IF NOT EXISTS direct_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  partner_mobile text NOT NULL,
  txn_type text NOT NULL CHECK (txn_type IN ('Given', 'Received')),
  amount numeric NOT NULL DEFAULT 0,
  payment_mode text DEFAULT 'Cash',
  txn_date date DEFAULT CURRENT_DATE,
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 4. Shoot assignments table
CREATE TABLE IF NOT EXISTS shoot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id),
  function_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  reporting_time text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 5. Photographer ledger extensions
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS petrol_allowance numeric DEFAULT 0;

-- 6. Studio settings master PIN
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS master_pin text DEFAULT '';

-- 7. Enable RLS on new tables
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoot_assignments ENABLE ROW LEVEL SECURITY;

-- Partners policies (anon + authenticated — single-admin app)
DROP POLICY IF EXISTS "anon_all_partners" ON partners;
CREATE POLICY "anon_all_partners" ON partners FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Direct transactions policies
DROP POLICY IF EXISTS "anon_all_direct_transactions" ON direct_transactions;
CREATE POLICY "anon_all_direct_transactions" ON direct_transactions FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Shoot assignments policies
DROP POLICY IF EXISTS "anon_all_shoot_assignments" ON shoot_assignments;
CREATE POLICY "anon_all_shoot_assignments" ON shoot_assignments FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- END MIGRATION: 20260908125329_add_portal_password_and_partners.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260908143824_add_promo_ads_and_brand_contact_settings.sql
-- ============================================================================
/*
# Add Promo Ads Table + Brand/Contact Settings

1. New Table: `promo_ads`
   - `id` (uuid, PK)
   - `title` (text, NOT NULL) — promo card title
   - `description` (text, default '') — promo description
   - `image_url` (text, default '') — image/footage URL
   - `action_link` (text, default '') — optional clickable link
   - `audience` (text, NOT NULL, CHECK in 'clients'/'partners') — target audience
   - `is_active` (boolean, NOT NULL, default true) — active/inactive toggle
   - `sort_order` (integer, default 0) — display ordering
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

2. New Columns on `studio_settings`
   - `studio_name` (text, default '') — separate studio name for billings
   - `production_banner_name` (text, default '') — production banner name
   - `studio_whatsapp` (text, default '') — WhatsApp number for client contact hub
   - `studio_call_number` (text, default '') — phone number for tel: links
   - `studio_instagram_url` (text, default '') — Instagram profile URL

3. Security
   - RLS enabled on `promo_ads`.
   - Anon + authenticated full CRUD (single-admin app, no Supabase Auth sign-in).
*/

CREATE TABLE IF NOT EXISTS promo_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  action_link text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'clients' CHECK (audience IN ('clients', 'partners')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE promo_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_promo_ads" ON promo_ads;
CREATE POLICY "anon_all_promo_ads" ON promo_ads FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_name text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS production_banner_name text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_whatsapp text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_call_number text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_instagram_url text NOT NULL DEFAULT '';

-- END MIGRATION: 20260908143824_add_promo_ads_and_brand_contact_settings.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260909213114_add_dual_side_booking_fields.sql
-- ============================================================================
/*
# Add Dual Side (Groom & Bride) Booking Fields

1. New Columns on `bookings`
- `bride_name` (text, nullable) — optional bride name for dual-side bookings
- `bride_mobile` (text, nullable) — optional bride mobile/WhatsApp
- `is_dual_side` (boolean, default false) — toggle for combined groom+bride booking

2. Notes
- All columns are nullable / have defaults so existing rows are unaffected.
- The `events` JSONB array already supports a `side` key per function; no schema change needed there.
- No RLS changes — existing policies already cover the new columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'bride_name') THEN
    ALTER TABLE bookings ADD COLUMN bride_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'bride_mobile') THEN
    ALTER TABLE bookings ADD COLUMN bride_mobile text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'is_dual_side') THEN
    ALTER TABLE bookings ADD COLUMN is_dual_side boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- END MIGRATION: 20260909213114_add_dual_side_booking_fields.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260909233739_20260909150000_add_music_selection_portal.sql.sql
-- ============================================================================
/*
# Add Music Selection Portal

1. New Table: `music_projects`
- `id` (uuid, primary key) — project identifier.
- `client_name` (text) — party or lab client name shown in the portal.
- `booking_id` (uuid, nullable) — optional link to an existing booking.
- `mode` (text) — `b2c` for direct parties or `b2b` for lab/photographer projects.
- `status` (text) — `draft`, `submitted`, or `locked`.
- `locked_at` (timestamptz, nullable) — time the client finalized the selection.
- `created_at`, `updated_at` (timestamptz) — record timestamps.

2. New Table: `music_cues`
- `id` (uuid, primary key) — cue identifier.
- `project_id` (uuid) — parent music project.
- `category` (text) — event use such as Teaser, Entry, or Reception.
- `track_title` (text) — chosen track name.
- `track_url` (text) — optional YouTube, Spotify, Instagram, or audio preview link.
- `start_time` (text) — timestamp or timecode instruction.
- `usage_notes` (text) — editing direction from the client.
- `priority` (text) — `must_use`, `preferred`, or `reference`.
- `created_at`, `updated_at` (timestamptz) — record timestamps.

3. Security
- Enable row-level security on both tables.
- This is a single-studio portal without Supabase Auth, so anon and authenticated users receive separate CRUD policies for the shared studio workspace.
- Deleting a project also deletes its cue rows through the foreign key.

4. Notes
- Existing bookings and data are not changed.
- The frontend keeps the same fields in its local fallback store so the module works in the current offline-capable app too.
*/

CREATE TABLE IF NOT EXISTS music_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  booking_id uuid,
  mode text NOT NULL DEFAULT 'b2c' CHECK (mode IN ('b2c', 'b2b')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'locked')),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS music_cues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES music_projects(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'Teaser',
  track_title text NOT NULL DEFAULT '',
  track_url text NOT NULL DEFAULT '',
  start_time text NOT NULL DEFAULT '',
  usage_notes text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'preferred' CHECK (priority IN ('must_use', 'preferred', 'reference')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Studio-only master references are independent from client-selected music_cues.
CREATE TABLE IF NOT EXISTS music_master_cues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES music_projects(id) ON DELETE RESTRICT,
  song_title text NOT NULL DEFAULT '',
  singer_artist text NOT NULL DEFAULT '',
  genre_mood text NOT NULL DEFAULT '',
  event_tag text NOT NULL DEFAULT '',
  audio_url text NOT NULL DEFAULT '',
  cue_timestamps text NOT NULL DEFAULT '',
  special_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_master_cues_song_title_nonempty CHECK (length(btrim(song_title)) > 0)
);

CREATE INDEX IF NOT EXISTS music_projects_client_name_idx ON music_projects (lower(client_name));
CREATE INDEX IF NOT EXISTS music_cues_project_id_idx ON music_cues (project_id);
CREATE INDEX IF NOT EXISTS music_master_cues_project_id_idx ON music_master_cues (project_id, created_at);

ALTER TABLE music_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_master_cues ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_cues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON music_master_cues FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON music_master_cues TO authenticated;

DROP POLICY IF EXISTS "anon_select_music_projects" ON music_projects;
CREATE POLICY "anon_select_music_projects" ON music_projects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_music_projects" ON music_projects;
CREATE POLICY "anon_insert_music_projects" ON music_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_music_projects" ON music_projects;
CREATE POLICY "anon_update_music_projects" ON music_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_music_projects" ON music_projects;
CREATE POLICY "anon_delete_music_projects" ON music_projects FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_music_cues" ON music_cues;
CREATE POLICY "anon_select_music_cues" ON music_cues FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_music_cues" ON music_cues;
CREATE POLICY "anon_insert_music_cues" ON music_cues FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_music_cues" ON music_cues;
CREATE POLICY "anon_update_music_cues" ON music_cues FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_music_cues" ON music_cues;
CREATE POLICY "anon_delete_music_cues" ON music_cues FOR DELETE TO anon, authenticated USING (true);

-- END MIGRATION: 20260909233739_20260909150000_add_music_selection_portal.sql.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260910011809_20260910010000_add_teaser_and_invitation_tables.sql.sql
-- ============================================================================
/*
# Add Teaser Preview & Invitation Hub Tables

1. New Table: `teaser_projects`
   - Stores teaser reel preview data for each booking.
   - `id` (uuid PK), `booking_id` (text), `client_name` (text), `video_url` (text),
     `status` (text: editing/complete/delivered), `watermark_text` (text),
     `drive_url` (text), `created_at`, `updated_at`.

2. New Table: `invitation_projects`
   - Stores wedding invitation digital assets.
   - `id` (uuid PK), `booking_id` (text), `client_name` (text),
     `video_url` (text), `pdf_url` (text),
     `groom_name` (text), `bride_name` (text),
     `event_date` (text), `venue_url` (text),
     `created_at`, `updated_at`.

3. Security
   - Single-tenant app with admin login only (no Supabase Auth sign-in).
   - RLS enabled on both tables.
   - Anon + authenticated full CRUD via separate policies per verb.
*/

CREATE TABLE IF NOT EXISTS teaser_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'editing' CHECK (status IN ('editing', 'complete', 'delivered')),
  watermark_text text NOT NULL DEFAULT '',
  drive_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitation_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  pdf_url text NOT NULL DEFAULT '',
  groom_name text NOT NULL DEFAULT '',
  bride_name text NOT NULL DEFAULT '',
  event_date text NOT NULL DEFAULT '',
  venue_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teaser_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_teaser" ON teaser_projects;
CREATE POLICY "anon_select_teaser" ON teaser_projects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_teaser" ON teaser_projects;
CREATE POLICY "anon_insert_teaser" ON teaser_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_teaser" ON teaser_projects;
CREATE POLICY "anon_update_teaser" ON teaser_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_teaser" ON teaser_projects;
CREATE POLICY "anon_delete_teaser" ON teaser_projects FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_invitations" ON invitation_projects;
CREATE POLICY "anon_select_invitations" ON invitation_projects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_invitations" ON invitation_projects;
CREATE POLICY "anon_insert_invitations" ON invitation_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_invitations" ON invitation_projects;
CREATE POLICY "anon_update_invitations" ON invitation_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_invitations" ON invitation_projects;
CREATE POLICY "anon_delete_invitations" ON invitation_projects FOR DELETE TO anon, authenticated USING (true);

-- END MIGRATION: 20260910011809_20260910010000_add_teaser_and_invitation_tables.sql.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260912060729_20260912120000_replace_password_with_access_pin.sql.sql
-- ============================================================================
/*
# Replace client_password with 4-digit access_pin

## Summary
This migration replaces the old password-based client portal authentication
with a 4-digit PIN system. The `client_password` column is renamed to
`access_pin`, and all existing values are backfilled to the last 4 digits of
the client's mobile number. The `password_changed` column is renamed to
`pin_changed`.

## Changes
1. Rename `bookings.client_password` → `bookings.access_pin` (text, NOT NULL, default '')
2. Rename `bookings.password_changed` → `bookings.pin_changed` (boolean, NOT NULL, default false)
3. Backfill `access_pin` with the last 4 digits of `client_mobile` for all
   existing rows where `access_pin` is empty or still looks like a full
   phone number (length > 4).
4. Set `pin_changed = false` for all backfilled rows.

## Security
- No RLS policy changes. Existing policies on `bookings` remain unchanged.
- The `access_pin` column stores a 4-digit numeric string, not a hashed
  password — this is intentional for the client portal's simplified PIN
  authentication flow.

## Important Notes
1. The `access_pin` defaults to the last 4 digits of `client_mobile`.
2. When a new booking is created, the application sets `access_pin` to the
   last 4 digits of the client's mobile number.
3. The "Reset to Default PIN" button in the admin panel sets `access_pin`
   back to the last 4 digits of `client_mobile` and `pin_changed` to false.
*/

-- Step 1: Add new columns if they don't exist (idempotent)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false;

-- Step 2: Copy data from old columns to new columns
UPDATE bookings
SET access_pin = client_password,
    pin_changed = password_changed
WHERE access_pin = '' AND client_password IS NOT NULL;

-- Step 3: Backfill access_pin with last 4 digits of client_mobile
-- This handles: empty access_pin, or access_pin that is still a full phone number (length > 4)
UPDATE bookings
SET access_pin = RIGHT(regexp_replace(client_mobile, '\D', '', 'g'), 4),
    pin_changed = false
WHERE access_pin = ''
   OR length(access_pin) > 4;

-- Step 4: Drop old columns
ALTER TABLE bookings DROP COLUMN IF EXISTS client_password;
ALTER TABLE bookings DROP COLUMN IF EXISTS password_changed;
-- END MIGRATION: 20260912060729_20260912120000_replace_password_with_access_pin.sql.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260912095854_sync_full_studio_schema.sql
-- ============================================================================
/*
# Sync Full Studio Management Schema

## Overview
This migration brings the database up to match the application's complete data model
defined in src/lib/types.ts. It is purely additive and idempotent — every statement
uses IF NOT EXISTS or ADD COLUMN IF NOT EXISTS so it is safe to re-run.

The app has no sign-in screen (single-tenant, anon-key access), so all policies
use TO anon, authenticated.

## What This Does
1. Adds missing columns to existing tables (bookings, studio_lab_orders, partners,
   photographer_ledger, payments, studio_settings, studio_lab_orders).
2. Creates tables that don't exist yet: booking_notifications, promo_banners,
   promo_popups, promo_coupons, promo_broadcasts, photo_selection_sessions.
3. Adds RLS + policies to any newly created tables.
4. Adds missing RLS policies to tables that may lack them.
5. Adds missing indexes.

## Tables Modified
- bookings: adds events, deliverables_data, work_status, access_pin, pin_changed,
  is_login_allowed, bride_name, bride_mobile, is_dual_side, archived_at, deleted_at
- studio_lab_orders: adds all multi-client/payment columns
- partners: adds portal_password, password_changed, is_login_allowed
- photographer_ledger: adds payment_mode, payment_date, deleted_at
- payments: adds deleted_at
- studio_settings: adds whatsapp_number, alternate_phone, branch_address, upi_id,
  production_terms, master_pin, studio_name, production_banner_name, studio_whatsapp,
  studio_call_number, studio_instagram_url

## Tables Created
- booking_notifications
- promo_banners
- promo_popups
- promo_coupons
- promo_broadcasts
- photo_selection_sessions
*/

-- ============================================================
-- BOOKINGS: add all missing columns
-- ============================================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deliverables_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS work_status text NOT NULL DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS bride_name text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS bride_mobile text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_dual_side boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS base_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;

-- Backfill access_pin from client_mobile last 4 digits if empty
DO $$
BEGIN
  UPDATE bookings
  SET access_pin = RIGHT(regexp_replace(client_mobile, '\D', '', 'g'), 4),
      pin_changed = false
  WHERE access_pin = '' OR length(access_pin) > 4;
END $$;

-- ============================================================
-- STUDIO_LAB_ORDERS: add all missing columns
-- ============================================================
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS partner_id uuid;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS partner_name text NOT NULL DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS studio_address text NOT NULL DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS clients jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS total_album_bill numeric NOT NULL DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS total_video_bill numeric NOT NULL DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS current_order_total numeric NOT NULL DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS master_total numeric NOT NULL DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS advance_paid numeric NOT NULL DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS net_final_due numeric NOT NULL DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_date text NOT NULL DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_note text NOT NULL DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS promised_delivery_date text;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS parcel_tracking_details text NOT NULL DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS video_rows jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS album_rows jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ============================================================
-- PARTNERS: add missing columns
-- ============================================================
ALTER TABLE partners ADD COLUMN IF NOT EXISTS portal_password text NOT NULL DEFAULT '';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false;

-- Backfill portal_password from mobile
DO $$
BEGIN
  UPDATE partners SET portal_password = mobile WHERE portal_password = '';
END $$;

-- ============================================================
-- PHOTOGRAPHER_LEDGER: add missing columns
-- ============================================================
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT '';
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_date text NOT NULL DEFAULT '';
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ============================================================
-- PAYMENTS: add missing columns
-- ============================================================
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ============================================================
-- STUDIO_SETTINGS: add all missing columns
-- ============================================================
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS whatsapp_number text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS alternate_phone text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS branch_address text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS upi_id text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS production_terms text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS master_pin text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_name text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS production_banner_name text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_whatsapp text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_call_number text;
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_instagram_url text;

-- Ensure the single settings row exists
INSERT INTO studio_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- BOOKING NOTIFICATIONS (new table)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'reminder',
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_notifications_booking_id ON booking_notifications (booking_id);

ALTER TABLE booking_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_booking_notifications" ON booking_notifications;
CREATE POLICY "anon_select_booking_notifications" ON booking_notifications FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_booking_notifications" ON booking_notifications;
CREATE POLICY "anon_insert_booking_notifications" ON booking_notifications FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_booking_notifications" ON booking_notifications;
CREATE POLICY "anon_update_booking_notifications" ON booking_notifications FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_booking_notifications" ON booking_notifications;
CREATE POLICY "anon_delete_booking_notifications" ON booking_notifications FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- PROMO BANNERS (new table)
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  link text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promo_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_promo_banners" ON promo_banners;
CREATE POLICY "anon_select_promo_banners" ON promo_banners FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_promo_banners" ON promo_banners;
CREATE POLICY "anon_insert_promo_banners" ON promo_banners FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_promo_banners" ON promo_banners;
CREATE POLICY "anon_update_promo_banners" ON promo_banners FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_promo_banners" ON promo_banners;
CREATE POLICY "anon_delete_promo_banners" ON promo_banners FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- PROMO POPUPS (new table)
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promo_popups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_promo_popups" ON promo_popups;
CREATE POLICY "anon_select_promo_popups" ON promo_popups FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_promo_popups" ON promo_popups;
CREATE POLICY "anon_insert_promo_popups" ON promo_popups FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_promo_popups" ON promo_popups;
CREATE POLICY "anon_update_promo_popups" ON promo_popups FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_promo_popups" ON promo_popups;
CREATE POLICY "anon_delete_promo_popups" ON promo_popups FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- PROMO COUPONS (new table)
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  percentage numeric NOT NULL DEFAULT 0,
  valid_until text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promo_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_promo_coupons" ON promo_coupons;
CREATE POLICY "anon_select_promo_coupons" ON promo_coupons FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_promo_coupons" ON promo_coupons;
CREATE POLICY "anon_insert_promo_coupons" ON promo_coupons FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_promo_coupons" ON promo_coupons;
CREATE POLICY "anon_update_promo_coupons" ON promo_coupons FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_promo_coupons" ON promo_coupons;
CREATE POLICY "anon_delete_promo_coupons" ON promo_coupons FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- PROMO BROADCASTS (new table)
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promo_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_promo_broadcasts" ON promo_broadcasts;
CREATE POLICY "anon_select_promo_broadcasts" ON promo_broadcasts FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_promo_broadcasts" ON promo_broadcasts;
CREATE POLICY "anon_insert_promo_broadcasts" ON promo_broadcasts FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_promo_broadcasts" ON promo_broadcasts;
CREATE POLICY "anon_update_promo_broadcasts" ON promo_broadcasts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_promo_broadcasts" ON promo_broadcasts;
CREATE POLICY "anon_delete_promo_broadcasts" ON promo_broadcasts FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- PHOTO SELECTION SESSIONS (new table)
-- ============================================================
CREATE TABLE IF NOT EXISTS photo_selection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  pin_code text NOT NULL DEFAULT '',
  client_type text NOT NULL DEFAULT 'B2C',
  package_sheets integer NOT NULL DEFAULT 0,
  extra_sheet_rate numeric NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  pdf_download_allowed boolean NOT NULL DEFAULT false,
  shareable_url text NOT NULL DEFAULT '',
  folders jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  proof_sheets jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_selection_sessions_bill_id ON photo_selection_sessions (bill_id);
CREATE INDEX IF NOT EXISTS idx_photo_selection_sessions_phone ON photo_selection_sessions (phone);

ALTER TABLE photo_selection_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_photo_selection_sessions" ON photo_selection_sessions;
CREATE POLICY "anon_select_photo_selection_sessions" ON photo_selection_sessions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_photo_selection_sessions" ON photo_selection_sessions;
CREATE POLICY "anon_insert_photo_selection_sessions" ON photo_selection_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_photo_selection_sessions" ON photo_selection_sessions;
CREATE POLICY "anon_update_photo_selection_sessions" ON photo_selection_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_photo_selection_sessions" ON photo_selection_sessions;
CREATE POLICY "anon_delete_photo_selection_sessions" ON photo_selection_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- Ensure RLS policies exist on all existing tables
-- (some may have been created without separate per-verb policies)
-- ============================================================

-- studio_settings
ALTER TABLE studio_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_studio_settings" ON studio_settings;
CREATE POLICY "anon_select_studio_settings" ON studio_settings FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_studio_settings" ON studio_settings;
CREATE POLICY "anon_insert_studio_settings" ON studio_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_studio_settings" ON studio_settings;
CREATE POLICY "anon_update_studio_settings" ON studio_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_studio_settings" ON studio_settings;
CREATE POLICY "anon_delete_studio_settings" ON studio_settings FOR DELETE
  TO anon, authenticated USING (true);

-- bookings
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

-- studio_lab_orders
ALTER TABLE studio_lab_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_studio_lab_orders" ON studio_lab_orders;
CREATE POLICY "anon_select_studio_lab_orders" ON studio_lab_orders FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_studio_lab_orders" ON studio_lab_orders;
CREATE POLICY "anon_insert_studio_lab_orders" ON studio_lab_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_studio_lab_orders" ON studio_lab_orders;
CREATE POLICY "anon_update_studio_lab_orders" ON studio_lab_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_studio_lab_orders" ON studio_lab_orders;
CREATE POLICY "anon_delete_studio_lab_orders" ON studio_lab_orders FOR DELETE
  TO anon, authenticated USING (true);

-- photographer_ledger
ALTER TABLE photographer_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_photographer_ledger" ON photographer_ledger;
CREATE POLICY "anon_select_photographer_ledger" ON photographer_ledger FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_photographer_ledger" ON photographer_ledger;
CREATE POLICY "anon_insert_photographer_ledger" ON photographer_ledger FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_photographer_ledger" ON photographer_ledger;
CREATE POLICY "anon_update_photographer_ledger" ON photographer_ledger FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_photographer_ledger" ON photographer_ledger;
CREATE POLICY "anon_delete_photographer_ledger" ON photographer_ledger FOR DELETE
  TO anon, authenticated USING (true);

-- payments
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

-- partners
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_partners" ON partners;
CREATE POLICY "anon_select_partners" ON partners FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_partners" ON partners;
CREATE POLICY "anon_insert_partners" ON partners FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_partners" ON partners;
CREATE POLICY "anon_update_partners" ON partners FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_partners" ON partners;
CREATE POLICY "anon_delete_partners" ON partners FOR DELETE
  TO anon, authenticated USING (true);

-- direct_transactions
ALTER TABLE direct_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_direct_transactions" ON direct_transactions;
CREATE POLICY "anon_select_direct_transactions" ON direct_transactions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_direct_transactions" ON direct_transactions;
CREATE POLICY "anon_insert_direct_transactions" ON direct_transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_direct_transactions" ON direct_transactions;
CREATE POLICY "anon_update_direct_transactions" ON direct_transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_direct_transactions" ON direct_transactions;
CREATE POLICY "anon_delete_direct_transactions" ON direct_transactions FOR DELETE
  TO anon, authenticated USING (true);

-- promo_ads
ALTER TABLE promo_ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_promo_ads" ON promo_ads;
CREATE POLICY "anon_select_promo_ads" ON promo_ads FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_promo_ads" ON promo_ads;
CREATE POLICY "anon_insert_promo_ads" ON promo_ads FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_promo_ads" ON promo_ads;
CREATE POLICY "anon_update_promo_ads" ON promo_ads FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_promo_ads" ON promo_ads;
CREATE POLICY "anon_delete_promo_ads" ON promo_ads FOR DELETE
  TO anon, authenticated USING (true);

-- music_projects
ALTER TABLE music_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_music_projects" ON music_projects;
CREATE POLICY "anon_select_music_projects" ON music_projects FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_music_projects" ON music_projects;
CREATE POLICY "anon_insert_music_projects" ON music_projects FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_music_projects" ON music_projects;
CREATE POLICY "anon_update_music_projects" ON music_projects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_music_projects" ON music_projects;
CREATE POLICY "anon_delete_music_projects" ON music_projects FOR DELETE
  TO anon, authenticated USING (true);

-- music_cues
ALTER TABLE music_cues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_music_cues" ON music_cues;
CREATE POLICY "anon_select_music_cues" ON music_cues FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_music_cues" ON music_cues;
CREATE POLICY "anon_insert_music_cues" ON music_cues FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_music_cues" ON music_cues;
CREATE POLICY "anon_update_music_cues" ON music_cues FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_music_cues" ON music_cues;
CREATE POLICY "anon_delete_music_cues" ON music_cues FOR DELETE
  TO anon, authenticated USING (true);

-- teaser_projects
ALTER TABLE teaser_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_teaser_projects" ON teaser_projects;
CREATE POLICY "anon_select_teaser_projects" ON teaser_projects FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_teaser_projects" ON teaser_projects;
CREATE POLICY "anon_insert_teaser_projects" ON teaser_projects FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_teaser_projects" ON teaser_projects;
CREATE POLICY "anon_update_teaser_projects" ON teaser_projects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_teaser_projects" ON teaser_projects;
CREATE POLICY "anon_delete_teaser_projects" ON teaser_projects FOR DELETE
  TO anon, authenticated USING (true);

-- invitation_projects
ALTER TABLE invitation_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_invitation_projects" ON invitation_projects;
CREATE POLICY "anon_select_invitation_projects" ON invitation_projects FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_invitation_projects" ON invitation_projects;
CREATE POLICY "anon_insert_invitation_projects" ON invitation_projects FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_invitation_projects" ON invitation_projects;
CREATE POLICY "anon_update_invitation_projects" ON invitation_projects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_invitation_projects" ON invitation_projects;
CREATE POLICY "anon_delete_invitation_projects" ON invitation_projects FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_booking_no ON bookings (booking_no);
CREATE INDEX IF NOT EXISTS idx_bookings_client_mobile ON bookings (client_mobile);
CREATE INDEX IF NOT EXISTS idx_bookings_work_status ON bookings (work_status);
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON bookings (deleted_at);
CREATE INDEX IF NOT EXISTS idx_studio_lab_orders_order_no ON studio_lab_orders (order_no);
CREATE INDEX IF NOT EXISTS idx_studio_lab_orders_partner_id ON studio_lab_orders (partner_id);
CREATE INDEX IF NOT EXISTS idx_studio_lab_orders_deleted_at ON studio_lab_orders (deleted_at);
CREATE INDEX IF NOT EXISTS idx_partners_category ON partners (category);
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners (status);
CREATE INDEX IF NOT EXISTS idx_partners_mobile ON partners (mobile);
CREATE INDEX IF NOT EXISTS idx_photographer_ledger_deleted_at ON photographer_ledger (deleted_at);
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON payments (deleted_at);
CREATE INDEX IF NOT EXISTS idx_promo_ads_audience ON promo_ads (audience);
CREATE INDEX IF NOT EXISTS idx_promo_ads_is_active ON promo_ads (is_active);
-- END MIGRATION: 20260912095854_sync_full_studio_schema.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260913031103_20260913120000_add_access_pin_to_lab_orders.sql.sql
-- ============================================================================
/*
# Add 4-digit Access PIN to Lab Orders

## Summary
Adds the same 4-digit access PIN system to `studio_lab_orders` that `bookings`
already has, giving lab orders full parity for client portal authentication.

## Changes
1. Add `access_pin` (text, NOT NULL, default '') to `studio_lab_orders`.
2. Add `pin_changed` (boolean, NOT NULL, default false) to `studio_lab_orders`.
3. Add `is_login_allowed` (boolean, NOT NULL, default false) to `studio_lab_orders`.
4. Backfill `access_pin` with the last 4 digits of `studio_mobile` for all
   existing rows where `access_pin` is empty.

## Security
- No RLS policy changes needed — `studio_lab_orders` already has RLS enabled
  with anon/authenticated policies from the original schema.
- The `access_pin` column stores a 4-digit numeric string for simplified
  portal authentication, matching the `bookings` table pattern.

## Important Notes
1. The `access_pin` defaults to the last 4 digits of `studio_mobile`.
2. When a new lab order is created, the application sets `access_pin` to the
   last 4 digits of `studio_mobile`.
3. The admin panel can reset the PIN to default at any time.
*/

ALTER TABLE studio_lab_orders
  ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false;

UPDATE studio_lab_orders
SET access_pin = RIGHT(regexp_replace(studio_mobile, '\D', '', 'g'), 4),
    pin_changed = false
WHERE access_pin = '';

-- END MIGRATION: 20260913031103_20260913120000_add_access_pin_to_lab_orders.sql.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260914221349_add_dairy_book_module.sql
-- ============================================================================
/*
# Dairy Book Module

## Overview
Creates a comprehensive daily cash-flow ledger ("Dairy Book") for the studio.
Tracks automatic entries synced from Bookings (B2C Cash In) and Lab Orders (B2B Cash Out),
plus manual extra expenses and income entries. Includes opening balance tracking.

## New Tables

### 1. dairy_book_entries
Unified ledger for all cash flow entries — both automatic (from bookings/lab orders) and manual.
- entry_type: 'B2C_CASH_IN' (booking payments), 'B2B_CASH_OUT' (lab/vendor payments), 'MANUAL_EXPENSE', 'MANUAL_INCOME'
- source_table: which table the entry was auto-synced from ('bookings', 'studio_lab_orders', or null for manual)
- source_id: the ID of the originating booking/lab order (null for manual entries)
- party_name: client name (for B2C) or vendor name (for B2B) or description (for manual)
- source_ref: booking_no or order_no for auto entries
- amount: the transaction amount
- category: expense category tag for manual entries (e.g. 'Fuel', 'Tea/Snacks', 'Helper Wage', 'Studio Maintenance')
- payment_mode: 'Cash', 'UPI', 'Bank'
- note: free-text description
- entry_date: the date of the transaction (for filtering by day/month/year)
- is_auto: true for auto-synced entries, false for manual entries

### 2. dairy_book_opening_balance
Single-row table tracking the daily opening balance with a lock toggle.
- opening_amount: the opening balance amount
- is_locked: whether the opening balance is locked (true) or editable (false)
- effective_date: the date this opening balance applies from
- updated_at: last modification timestamp

## Security
- RLS enabled on both tables.
- Single-tenant no-auth app: all policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`.
- 4 policies per table (SELECT, INSERT, UPDATE, DELETE).

## Triggers
- `sync_booking_payment_to_dairy`: AFTER INSERT on `payments` where source = 'Booking' — auto-creates a B2C_CASH_IN entry.
- `sync_lab_payment_to_dairy`: AFTER INSERT on `payments` where source = 'Lab Order' — auto-creates a B2B_CASH_OUT entry.

## Notes
1. The app has no sign-in screen, so anon-key access is required for all operations.
2. Auto-sync hooks fire when a payment record is inserted (which is how the Bill Book and Lab Order modules record payments).
3. Manual entries are inserted directly by the Dairy Book UI.
4. Opening balance is a single-row table enforced by CHECK constraint.
*/

-- ============================================================
-- 1. DAIRY BOOK ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS dairy_book_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type text NOT NULL CHECK (entry_type IN ('B2C_CASH_IN', 'B2B_CASH_OUT', 'MANUAL_EXPENSE', 'MANUAL_INCOME')),
  is_auto boolean DEFAULT false,
  source_table text DEFAULT NULL,
  source_id text DEFAULT NULL,
  source_ref text DEFAULT NULL,
  party_name text DEFAULT '',
  amount numeric DEFAULT 0,
  category text DEFAULT '',
  payment_mode text DEFAULT 'Cash',
  note text DEFAULT '',
  entry_date text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dairy_entries_date ON dairy_book_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_dairy_entries_type ON dairy_book_entries (entry_type);
CREATE INDEX IF NOT EXISTS idx_dairy_entries_category ON dairy_book_entries (category);

-- ============================================================
-- 2. DAIRY BOOK OPENING BALANCE (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS dairy_book_opening_balance (
  id int PRIMARY KEY DEFAULT 1,
  opening_amount numeric DEFAULT 0,
  is_locked boolean DEFAULT false,
  effective_date text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row_dairy CHECK (id = 1)
);

INSERT INTO dairy_book_opening_balance (id, opening_amount, is_locked, effective_date)
VALUES (1, 0, false, '')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- dairy_book_entries
ALTER TABLE dairy_book_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_dairy_entries" ON dairy_book_entries;
CREATE POLICY "anon_select_dairy_entries" ON dairy_book_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dairy_entries" ON dairy_book_entries;
CREATE POLICY "anon_insert_dairy_entries" ON dairy_book_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dairy_entries" ON dairy_book_entries;
CREATE POLICY "anon_update_dairy_entries" ON dairy_book_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dairy_entries" ON dairy_book_entries;
CREATE POLICY "anon_delete_dairy_entries" ON dairy_book_entries FOR DELETE
  TO anon, authenticated USING (true);

-- dairy_book_opening_balance
ALTER TABLE dairy_book_opening_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_dairy_opening" ON dairy_book_opening_balance;
CREATE POLICY "anon_select_dairy_opening" ON dairy_book_opening_balance FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dairy_opening" ON dairy_book_opening_balance;
CREATE POLICY "anon_insert_dairy_opening" ON dairy_book_opening_balance FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dairy_opening" ON dairy_book_opening_balance;
CREATE POLICY "anon_update_dairy_opening" ON dairy_book_opening_balance FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dairy_opening" ON dairy_book_opening_balance;
CREATE POLICY "anon_delete_dairy_opening" ON dairy_book_opening_balance FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- TRIGGERS: Auto-sync from payments table
-- ============================================================

-- Function: sync booking payment to dairy book as B2C_CASH_IN
CREATE OR REPLACE FUNCTION sync_booking_payment_to_dairy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'Booking' AND NEW.deleted_at IS NULL THEN
    INSERT INTO dairy_book_entries (
      entry_type, is_auto, source_table, source_id, source_ref,
      party_name, amount, payment_mode, note, entry_date
    )
    VALUES (
      'B2C_CASH_IN', true, 'bookings', NULL, NEW.note,
      NEW.party_name, NEW.amount, NEW.mode, COALESCE(NEW.note, ''), NEW.date
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: sync lab order payment to dairy book as B2B_CASH_OUT
CREATE OR REPLACE FUNCTION sync_lab_payment_to_dairy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'Lab Order' AND NEW.deleted_at IS NULL THEN
    INSERT INTO dairy_book_entries (
      entry_type, is_auto, source_table, source_id, source_ref,
      party_name, amount, payment_mode, note, entry_date
    )
    VALUES (
      'B2B_CASH_OUT', true, 'studio_lab_orders', NULL, NEW.note,
      NEW.party_name, NEW.amount, NEW.mode, COALESCE(NEW.note, ''), NEW.date
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_booking_payment_dairy ON payments;
CREATE TRIGGER trg_sync_booking_payment_dairy
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_booking_payment_to_dairy();

DROP TRIGGER IF EXISTS trg_sync_lab_payment_dairy ON payments;
CREATE TRIGGER trg_sync_lab_payment_dairy
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_lab_payment_to_dairy();

-- END MIGRATION: 20260914221349_add_dairy_book_module.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260920201344_add_storage_locations_to_lab_orders.sql
-- ============================================================================
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS storage_locations jsonb NOT NULL DEFAULT '[]'::jsonb;
-- END MIGRATION: 20260920201344_add_storage_locations_to_lab_orders.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260921120000_add_photo_selection_lab_metadata.sql
-- ============================================================================
-- Store B2B lab attribution on photo selection sessions.
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS partner_name text;
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS lab_order_no text;

CREATE INDEX IF NOT EXISTS idx_photo_selection_sessions_lab_order_no ON photo_selection_sessions (lab_order_no);
-- END MIGRATION: 20260921120000_add_photo_selection_lab_metadata.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260922090000_add_photo_selection_billing_totals.sql
-- ============================================================================
-- Persist calculated proofing totals for photo selection session billing.
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS total_sheets integer NOT NULL DEFAULT 0;
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS extra_sheets integer NOT NULL DEFAULT 0;
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS extra_amount numeric NOT NULL DEFAULT 0;
-- END MIGRATION: 20260922090000_add_photo_selection_billing_totals.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260925100000_add_lab_work_statuses.sql
-- ============================================================================
-- Track Album and Video Live Station status independently.
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS album_status text DEFAULT 'Pending';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS video_status text DEFAULT 'Pending';

-- END MIGRATION: 20260925100000_add_lab_work_statuses.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260929150000_add_lab_work_lifecycle_timestamps.sql
-- ============================================================================
ALTER TABLE studio_lab_orders
  ADD COLUMN IF NOT EXISTS album_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS album_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Backfill lifecycle dates for existing work without changing any order,
-- payment, ledger, or client data.
UPDATE studio_lab_orders
SET album_started_at = COALESCE(album_started_at, created_at)
WHERE album_status IS NOT NULL AND album_status <> 'Pending';

UPDATE studio_lab_orders
SET video_started_at = COALESCE(video_started_at, created_at)
WHERE video_status IS NOT NULL AND video_status <> 'Pending';

UPDATE studio_lab_orders
SET album_completed_at = COALESCE(album_completed_at, archived_at, created_at, now())
WHERE album_status = 'Complete';

UPDATE studio_lab_orders
SET video_completed_at = COALESCE(video_completed_at, archived_at, created_at, now())
WHERE video_status = 'Complete';

UPDATE studio_lab_orders
SET delivered_at = COALESCE(delivered_at, archived_at, created_at, now())
WHERE order_status = 'Delivered';

-- END MIGRATION: 20260929150000_add_lab_work_lifecycle_timestamps.sql

-- ============================================================================
-- BEGIN MIGRATION: 20260930170000_link_photographer_ledger_to_partners.sql
-- ============================================================================
-- Keep partner ledger history attached to the partner profile when a phone
-- number changes. Backfill existing rows using the current unique mobile.
ALTER TABLE public.photographer_ledger
  ADD COLUMN IF NOT EXISTS partner_id uuid;

UPDATE public.photographer_ledger AS ledger
SET partner_id = partner.id
FROM public.partners AS partner
WHERE ledger.partner_id IS NULL
  AND ledger.mobile = partner.mobile;

CREATE INDEX IF NOT EXISTS idx_photographer_ledger_partner_id
  ON public.photographer_ledger (partner_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photographer_ledger_partner_id_fkey'
      AND conrelid = 'public.photographer_ledger'::regclass
  ) THEN
    ALTER TABLE public.photographer_ledger
      ADD CONSTRAINT photographer_ledger_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;
  END IF;
END $$;

-- END MIGRATION: 20260930170000_link_photographer_ledger_to_partners.sql

-- ============================================================================
-- BEGIN MIGRATION: 20261001090000_partner_logos_for_photo_selection.sql
-- ============================================================================
-- Store a replaceable logo on each partner profile for B2B selection galleries.
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';

ALTER TABLE public.photo_selection_sessions
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_photo_selection_sessions_partner_id
  ON public.photo_selection_sessions (partner_id);

-- END MIGRATION: 20261001090000_partner_logos_for_photo_selection.sql

-- ============================================================================
-- BEGIN MIGRATION: 20261001100000_add_itemized_lab_charges.sql
-- ============================================================================
-- Keep order-level extra charges as explicit line items for billing and audit views.
ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS extra_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- END MIGRATION: 20261001100000_add_itemized_lab_charges.sql

-- ============================================================================
-- BEGIN MIGRATION: 20261005110000_add_equipment_rentals.sql
-- ============================================================================
-- Equipment rental agreements and their dated payment history.
-- RLS is enabled without public policies so these financial records stay
-- inaccessible until the app's Supabase authentication/policies are configured.

CREATE TABLE IF NOT EXISTS public.equipment_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('Rented Out', 'Rented In')),
  item_name text NOT NULL CHECK (length(trim(item_name)) > 0),
  category text NOT NULL DEFAULT 'Other',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  counterparty_name text NOT NULL CHECK (length(trim(counterparty_name)) > 0),
  counterparty_mobile text NOT NULL DEFAULT '',
  counterparty_type text NOT NULL DEFAULT 'Other' CHECK (counterparty_type IN ('Partner', 'Other')),
  rental_date date NOT NULL,
  expected_return_date date NOT NULL,
  delivered_at date,
  actual_return_date date,
  total_rent numeric(12, 2) NOT NULL CHECK (total_rent >= 0),
  status text NOT NULL DEFAULT 'Not Delivered' CHECK (status IN ('Not Delivered', 'Delivered', 'Complete', 'Cancelled')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_return_date >= rental_date)
);

CREATE TABLE IF NOT EXISTS public.equipment_rental_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES public.equipment_rentals(id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  payment_mode text NOT NULL CHECK (payment_mode IN ('Cash', 'UPI')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_rentals_counterparty_idx
  ON public.equipment_rentals (lower(counterparty_name), counterparty_mobile);
CREATE INDEX IF NOT EXISTS equipment_rentals_date_idx
  ON public.equipment_rentals (rental_date DESC);
CREATE INDEX IF NOT EXISTS equipment_rentals_status_idx
  ON public.equipment_rentals (status, direction);
CREATE INDEX IF NOT EXISTS equipment_rental_payments_rental_date_idx
  ON public.equipment_rental_payments (rental_id, payment_date DESC);

ALTER TABLE public.equipment_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_rental_payments ENABLE ROW LEVEL SECURITY;

-- END MIGRATION: 20261005110000_add_equipment_rentals.sql

-- ============================================================================
-- BEGIN MIGRATION: 20261005120000_add_equipment_rental_items.sql
-- ============================================================================
-- Each rental agreement may contain several pieces/types of equipment.
CREATE TABLE IF NOT EXISTS public.equipment_rental_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES public.equipment_rentals(id) ON DELETE RESTRICT,
  item_name text NOT NULL CHECK (length(trim(item_name)) > 0),
  category text NOT NULL DEFAULT 'Other',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_rental_items_rental_idx
  ON public.equipment_rental_items (rental_id, created_at);

ALTER TABLE public.equipment_rental_items ENABLE ROW LEVEL SECURITY;

-- END MIGRATION: 20261005120000_add_equipment_rental_items.sql

-- ============================================================================
-- BEGIN MIGRATION: 20261005130000_add_equipment_rental_delivery_status.sql
-- ============================================================================
-- Rental lifecycle: not yet handed over, handed over/received, and completed.
ALTER TABLE public.equipment_rentals
  ADD COLUMN IF NOT EXISTS delivered_at date;

ALTER TABLE public.equipment_rentals
  DROP CONSTRAINT IF EXISTS equipment_rentals_status_check;

UPDATE public.equipment_rentals
SET status = CASE
  WHEN status = 'Returned' THEN 'Complete'
  WHEN status = 'Active' THEN 'Delivered'
  ELSE status
END
WHERE status IN ('Returned', 'Active');

UPDATE public.equipment_rentals
SET delivered_at = COALESCE(delivered_at, rental_date)
WHERE status = 'Delivered' AND delivered_at IS NULL;

ALTER TABLE public.equipment_rentals
  ADD CONSTRAINT equipment_rentals_status_check
  CHECK (status IN ('Not Delivered', 'Delivered', 'Complete', 'Cancelled'));

ALTER TABLE public.equipment_rentals
  ALTER COLUMN status SET DEFAULT 'Not Delivered';

-- END MIGRATION: 20261005130000_add_equipment_rental_delivery_status.sql

-- ============================================================================
-- BEGIN MIGRATION: 20261005135000_add_ledger_entries.sql
-- ============================================================================
-- The app's client and partner history already targets this table. Reuse it
-- when present and create it only for Supabase projects missing the table.
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Client IDs in this app are grouped keys (e.g. phone:<number>), not UUIDs.
  client_id text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  entity_type text,
  entry_type text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  reference_order_id text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- If this table was created manually or by a partial setup, fill in only the
-- columns used by the existing app. This is additive and preserves its rows.
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entry_type text,
  ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reference_order_id text,
  ADD COLUMN IF NOT EXISTS date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- App client IDs are grouped keys (e.g. "phone:<number>"), not UUIDs.
-- Converting an empty or UUID-backed existing column to text is lossless.
ALTER TABLE public.ledger_entries
  ALTER COLUMN client_id TYPE text USING client_id::text;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_client_date
  ON public.ledger_entries (client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_booking_date
  ON public.ledger_entries (booking_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_partner_date
  ON public.ledger_entries (partner_id, date DESC);

-- END MIGRATION: 20261005135000_add_ledger_entries.sql

-- ============================================================================
-- BEGIN MIGRATION: 20261005140000_secure_portal_auth_and_rls.sql
-- ============================================================================
-- Secure the existing client and partner PIN flows with Supabase Auth and RLS.
-- This is an additive hardening migration: it reuses the existing PIN columns
-- during account migration and does not recreate application tables.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS client_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.partners ALTER COLUMN portal_password SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_bookings_client_auth_user_id
  ON public.bookings (client_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_client_auth_user_id
  ON public.studio_lab_orders (client_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_partners_auth_user_id
  ON public.partners (auth_user_id);

CREATE OR REPLACE FUNCTION public.studio_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

REVOKE ALL ON FUNCTION public.studio_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_is_admin() TO authenticated;

-- Partner access checks run as this narrowly scoped helper so partner
-- sessions do not need SELECT access to the raw partners profile row.
CREATE OR REPLACE FUNCTION public.studio_partner_can_access(target_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partners p
    WHERE p.id = target_partner_id
      AND p.auth_user_id = auth.uid()
      AND p.is_login_allowed = true
      AND (p.status IS NULL OR p.status = 'Active')
  )
$$;

REVOKE ALL ON FUNCTION public.studio_partner_can_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_partner_can_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.studio_partner_owns_lab_order(target_order_no text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.studio_lab_orders lo
    WHERE lo.order_no = target_order_no
      AND public.studio_partner_can_access(lo.partner_id)
  )
$$;

REVOKE ALL ON FUNCTION public.studio_partner_owns_lab_order(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_partner_owns_lab_order(text) TO authenticated;

-- Branding assets (logos/stamps) stay in Supabase Storage. Gallery photo
-- binaries are handled separately by the Cloudflare R2 upload API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('studio-branding', 'studio-branding', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS studio_branding_public_read ON storage.objects;
CREATE POLICY studio_branding_public_read ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'studio-branding');
DROP POLICY IF EXISTS studio_branding_admin_insert ON storage.objects;
CREATE POLICY studio_branding_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'studio-branding' AND public.studio_is_admin());
DROP POLICY IF EXISTS studio_branding_admin_update ON storage.objects;
CREATE POLICY studio_branding_admin_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'studio-branding' AND public.studio_is_admin())
  WITH CHECK (bucket_id = 'studio-branding' AND public.studio_is_admin());
DROP POLICY IF EXISTS studio_branding_admin_delete ON storage.objects;
CREATE POLICY studio_branding_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'studio-branding' AND public.studio_is_admin());

-- Remove the old anon-wide policies before granting role-specific access.
DO $$
DECLARE
  policy_row record;
  table_row record;
BEGIN
  FOR table_row IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_row.schemaname, table_row.tablename);
    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = table_row.schemaname AND tablename = table_row.tablename
    LOOP
      EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, table_row.schemaname, table_row.tablename);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY studio_admin_all ON %I.%I FOR ALL TO authenticated USING (public.studio_is_admin()) WITH CHECK (public.studio_is_admin())',
      table_row.schemaname, table_row.tablename
    );
  END LOOP;
END $$;

-- Client and partner accounts can read only their own primary records.
CREATE POLICY portal_client_booking_select ON public.bookings
  FOR SELECT TO authenticated
  USING (client_auth_user_id = auth.uid() AND is_login_allowed = true);

CREATE POLICY portal_client_lab_order_select ON public.studio_lab_orders
  FOR SELECT TO authenticated
  USING (client_auth_user_id = auth.uid() AND is_login_allowed = true);

CREATE POLICY portal_partner_assignment_select ON public.shoot_assignments
  FOR SELECT TO authenticated
  USING (public.studio_partner_can_access(partner_id));

CREATE POLICY portal_partner_ledger_select ON public.photographer_ledger
  FOR SELECT TO authenticated
  USING (public.studio_partner_can_access(partner_id));

CREATE POLICY portal_partner_transactions_select ON public.direct_transactions
  FOR SELECT TO authenticated
  USING (public.studio_partner_can_access(partner_id));

CREATE POLICY portal_client_photo_session_select ON public.photo_selection_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.booking_no = photo_selection_sessions.bill_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true)
    OR EXISTS (SELECT 1 FROM public.studio_lab_orders lo WHERE lo.order_no = photo_selection_sessions.bill_id AND lo.client_auth_user_id = auth.uid() AND lo.is_login_allowed = true)
  );

CREATE POLICY portal_partner_photo_session_select ON public.photo_selection_sessions
  FOR SELECT TO authenticated
  USING (public.studio_partner_owns_lab_order(bill_id));

-- Booking-linked detail tables inherit access only from an owned booking or
-- a booking assigned to the authenticated partner.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'booking_functions', 'booking_work_entries', 'booking_photographers',
    'shoot_schedules', 'video_shoots', 'album_work', 'live_setup_items',
    'studio_items', 'deliverables'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY portal_related_booking_select ON public.%I FOR SELECT TO authenticated USING (
          EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = %1$I.booking_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true)
          OR EXISTS (SELECT 1 FROM public.shoot_assignments sa WHERE sa.booking_id = %1$I.booking_id AND public.studio_partner_can_access(sa.partner_id))
        )',
        table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE POLICY portal_client_teaser_select ON public.teaser_projects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id::text = teaser_projects.booking_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true));

CREATE POLICY portal_client_invitation_select ON public.invitation_projects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id::text = invitation_projects.booking_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true));

CREATE POLICY portal_client_music_select ON public.music_projects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = music_projects.booking_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true));

CREATE POLICY portal_client_music_cues_select ON public.music_cues
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.music_projects mp
    JOIN public.bookings b ON b.id = mp.booking_id
    WHERE mp.id = music_cues.project_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true
  ));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'music_projects') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.music_projects;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'music_cues') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.music_cues;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'music_master_cues') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.music_master_cues;
    END IF;
  END IF;
END;
$$;

CREATE POLICY portal_active_promo_ads_select ON public.promo_ads
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Public pages may read branding and the UPI payment address, but never bank
-- details, studio PINs, or other private settings.
CREATE OR REPLACE VIEW public.public_studio_settings
WITH (security_barrier = true)
AS
SELECT id, films_title, films_subtitle, production_title, production_subtitle,
       address, phone, email, films_insta, production_insta, whatsapp_number,
       alternate_phone, branch_address, films_logo_url, production_logo_url,
       production_terms, stamp_image_url, terms_conditions, studio_name,
       production_banner_name, studio_whatsapp, studio_call_number, upi_id,
       studio_instagram_url
FROM public.studio_settings
WHERE id = 1;

REVOKE ALL ON public.public_studio_settings FROM PUBLIC;
GRANT SELECT ON public.public_studio_settings TO anon, authenticated;

-- Private failed-login tracking; Edge Functions use service role only.
CREATE TABLE IF NOT EXISTS public.portal_auth_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identifier_hash text NOT NULL,
  ip_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_portal_auth_attempts_window
  ON public.portal_auth_attempts (identifier_hash, ip_hash, attempted_at DESC);
ALTER TABLE public.portal_auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_auth_attempts FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.portal_auth_attempts TO service_role;

-- END MIGRATION: 20261005140000_secure_portal_auth_and_rls.sql

-- BEGIN MIGRATION: 20261008170000_repair_portal_pin_schema.sql
-- Keep PINs as text so newly entered leading zeroes are preserved. Existing
-- numeric values are converted to their decimal text representation.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.bookings
  ALTER COLUMN access_pin DROP DEFAULT;
ALTER TABLE public.bookings
  ALTER COLUMN access_pin TYPE text USING access_pin::text;
UPDATE public.bookings SET access_pin = '' WHERE access_pin IS NULL;
ALTER TABLE public.bookings
  ALTER COLUMN access_pin SET DEFAULT '',
  ALTER COLUMN access_pin SET NOT NULL;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS portal_password text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.partners
  ALTER COLUMN portal_password DROP DEFAULT;
ALTER TABLE public.partners
  ALTER COLUMN portal_password TYPE text USING portal_password::text;
UPDATE public.partners SET portal_password = '' WHERE portal_password IS NULL;
ALTER TABLE public.partners
  ALTER COLUMN portal_password SET DEFAULT '',
  ALTER COLUMN portal_password SET NOT NULL;

ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.studio_lab_orders
  ALTER COLUMN access_pin DROP DEFAULT;
ALTER TABLE public.studio_lab_orders
  ALTER COLUMN access_pin TYPE text USING access_pin::text;
UPDATE public.studio_lab_orders SET access_pin = '' WHERE access_pin IS NULL;
ALTER TABLE public.studio_lab_orders
  ALTER COLUMN access_pin SET DEFAULT '',
  ALTER COLUMN access_pin SET NOT NULL;

-- This intentionally does not create anon policies: portal-auth reads these
-- records with the service role, while authenticated access remains RLS-scoped.
-- END MIGRATION: 20261008170000_repair_portal_pin_schema.sql

-- ============================================================================
-- Verify the app tables created by the migration chain.
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
