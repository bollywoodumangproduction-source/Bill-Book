-- Additive lab order payment history and promised delivery date.
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_history jsonb DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS promised_delivery_date date;
