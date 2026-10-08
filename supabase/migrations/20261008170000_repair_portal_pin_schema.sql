-- Keep PINs as text so newly entered leading zeroes are preserved. Existing
-- numeric values are converted to their decimal text representation.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.bookings
  ALTER COLUMN access_pin DROP DEFAULT;
ALTER TABLE public.bookings
  ALTER COLUMN access_pin TYPE text USING access_pin::text;
UPDATE public.bookings SET access_pin = '' WHERE access_pin IS NULL;
ALTER TABLE public.bookings
  ALTER COLUMN access_pin SET DEFAULT '',
  ALTER COLUMN access_pin SET NOT NULL;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS portal_password text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.partners
  ALTER COLUMN portal_password DROP DEFAULT;
ALTER TABLE public.partners
  ALTER COLUMN portal_password TYPE text USING portal_password::text;
UPDATE public.partners SET portal_password = '' WHERE portal_password IS NULL;
ALTER TABLE public.partners
  ALTER COLUMN portal_password SET DEFAULT '',
  ALTER COLUMN portal_password SET NOT NULL;

ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.studio_lab_orders
  ALTER COLUMN access_pin DROP DEFAULT;
ALTER TABLE public.studio_lab_orders
  ALTER COLUMN access_pin TYPE text USING access_pin::text;
UPDATE public.studio_lab_orders SET access_pin = '' WHERE access_pin IS NULL;
ALTER TABLE public.studio_lab_orders
  ALTER COLUMN access_pin SET DEFAULT '',
  ALTER COLUMN access_pin SET NOT NULL;

-- This intentionally does not create anon policies: portal-auth reads these
-- records with the service role, while authenticated access remains RLS-scoped.
