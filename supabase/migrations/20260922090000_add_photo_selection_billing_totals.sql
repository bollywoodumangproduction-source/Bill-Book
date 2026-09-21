-- Persist calculated proofing totals for photo selection session billing.
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS total_sheets integer NOT NULL DEFAULT 0;
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS extra_sheets integer NOT NULL DEFAULT 0;
ALTER TABLE photo_selection_sessions ADD COLUMN IF NOT EXISTS extra_amount numeric NOT NULL DEFAULT 0;