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
