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