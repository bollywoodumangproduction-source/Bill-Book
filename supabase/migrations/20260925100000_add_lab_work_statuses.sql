-- Track Album and Video Live Station status independently.
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS album_status text DEFAULT 'Pending';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS video_status text DEFAULT 'Pending';
