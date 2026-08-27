-- Additive lifecycle metadata for 90-day recycle-bin retention.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
