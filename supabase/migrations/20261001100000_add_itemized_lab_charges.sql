-- Keep order-level extra charges as explicit line items for billing and audit views.
ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS extra_items jsonb NOT NULL DEFAULT '[]'::jsonb;
