-- Equipment rental agreements and their dated payment history.
-- RLS is enabled without public policies so these financial records stay
-- inaccessible until the app's Supabase authentication/policies are configured.

CREATE TABLE IF NOT EXISTS public.equipment_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('Rented Out', 'Rented In')),
  item_name text NOT NULL CHECK (length(trim(item_name)) > 0),
  category text NOT NULL DEFAULT 'Other',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  counterparty_name text NOT NULL CHECK (length(trim(counterparty_name)) > 0),
  counterparty_mobile text NOT NULL DEFAULT '',
  counterparty_type text NOT NULL DEFAULT 'Other' CHECK (counterparty_type IN ('Partner', 'Other')),
  rental_date date NOT NULL,
  expected_return_date date NOT NULL,
  delivered_at date,
  actual_return_date date,
  total_rent numeric(12, 2) NOT NULL CHECK (total_rent >= 0),
  status text NOT NULL DEFAULT 'Not Delivered' CHECK (status IN ('Not Delivered', 'Delivered', 'Complete', 'Cancelled')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_return_date >= rental_date)
);

CREATE TABLE IF NOT EXISTS public.equipment_rental_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES public.equipment_rentals(id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  payment_mode text NOT NULL CHECK (payment_mode IN ('Cash', 'UPI')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_rentals_counterparty_idx
  ON public.equipment_rentals (lower(counterparty_name), counterparty_mobile);
CREATE INDEX IF NOT EXISTS equipment_rentals_date_idx
  ON public.equipment_rentals (rental_date DESC);
CREATE INDEX IF NOT EXISTS equipment_rentals_status_idx
  ON public.equipment_rentals (status, direction);
CREATE INDEX IF NOT EXISTS equipment_rental_payments_rental_date_idx
  ON public.equipment_rental_payments (rental_id, payment_date DESC);

ALTER TABLE public.equipment_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_rental_payments ENABLE ROW LEVEL SECURITY;
