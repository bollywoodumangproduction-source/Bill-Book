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
