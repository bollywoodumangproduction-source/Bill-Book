-- The portal-auth Edge Function uses Supabase's service_role client to
-- read account records and update PIN/auth links. Keep these grants limited
-- to the server role; RLS continues to control browser roles.
GRANT SELECT ON TABLE
  public.partners,
  public.bookings,
  public.studio_lab_orders
TO service_role;

GRANT UPDATE (portal_password, auth_user_id, password_changed)
  ON TABLE public.partners TO service_role;
GRANT UPDATE (access_pin, client_auth_user_id, pin_changed)
  ON TABLE public.bookings, public.studio_lab_orders TO service_role;

GRANT SELECT ON TABLE public.shoot_assignments TO service_role;

NOTIFY pgrst, 'reload schema';
