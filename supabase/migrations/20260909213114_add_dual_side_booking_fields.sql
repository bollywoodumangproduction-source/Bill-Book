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
