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
