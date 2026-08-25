ALTER TABLE partners ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'Active';
ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_availability_status_check;
ALTER TABLE partners ADD CONSTRAINT partners_availability_status_check CHECK (availability_status IN ('Active', 'Busy', 'On Leave'));

ALTER TABLE photographers ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'Active';
ALTER TABLE photographers DROP CONSTRAINT IF EXISTS photographers_availability_status_check;
ALTER TABLE photographers ADD CONSTRAINT photographers_availability_status_check CHECK (availability_status IN ('Active', 'Busy', 'On Leave'));
