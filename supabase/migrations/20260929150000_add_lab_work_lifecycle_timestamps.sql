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
