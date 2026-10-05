-- Rental lifecycle: not yet handed over, handed over/received, and completed.
ALTER TABLE public.equipment_rentals
  ADD COLUMN IF NOT EXISTS delivered_at date;

ALTER TABLE public.equipment_rentals
  DROP CONSTRAINT IF EXISTS equipment_rentals_status_check;

UPDATE public.equipment_rentals
SET status = CASE
  WHEN status = 'Returned' THEN 'Complete'
  WHEN status = 'Active' THEN 'Delivered'
  ELSE status
END
WHERE status IN ('Returned', 'Active');

UPDATE public.equipment_rentals
SET delivered_at = COALESCE(delivered_at, rental_date)
WHERE status = 'Delivered' AND delivered_at IS NULL;

ALTER TABLE public.equipment_rentals
  ADD CONSTRAINT equipment_rentals_status_check
  CHECK (status IN ('Not Delivered', 'Delivered', 'Complete', 'Cancelled'));

ALTER TABLE public.equipment_rentals
  ALTER COLUMN status SET DEFAULT 'Not Delivered';
