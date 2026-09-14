-- Add base_amount column to bookings — standalone reference field, does NOT participate in net_due calculation
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS base_amount numeric DEFAULT 0;
