-- Store B2B lab attribution on photo selection sessions.
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS partner_name text;
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS lab_order_no text;

CREATE INDEX IF NOT EXISTS idx_photo_selection_sessions_lab_order_no ON photo_selection_sessions (lab_order_no);