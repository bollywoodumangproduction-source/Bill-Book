-- Each rental agreement may contain several pieces/types of equipment.
CREATE TABLE IF NOT EXISTS public.equipment_rental_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES public.equipment_rentals(id) ON DELETE RESTRICT,
  item_name text NOT NULL CHECK (length(trim(item_name)) > 0),
  category text NOT NULL DEFAULT 'Other',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_rental_items_rental_idx
  ON public.equipment_rental_items (rental_id, created_at);

ALTER TABLE public.equipment_rental_items ENABLE ROW LEVEL SECURITY;
