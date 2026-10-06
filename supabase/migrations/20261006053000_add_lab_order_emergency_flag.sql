-- Keep the production lab-order schema aligned with the app's save payload.
ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS is_emergency boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
