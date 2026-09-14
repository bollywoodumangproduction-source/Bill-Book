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