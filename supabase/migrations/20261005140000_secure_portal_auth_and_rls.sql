-- Secure the existing client and partner PIN flows with Supabase Auth and RLS.
-- This is an additive hardening migration: it reuses the existing PIN columns
-- during account migration and does not recreate application tables.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS client_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.partners ALTER COLUMN portal_password SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_bookings_client_auth_user_id
  ON public.bookings (client_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_client_auth_user_id
  ON public.studio_lab_orders (client_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_partners_auth_user_id
  ON public.partners (auth_user_id);

CREATE OR REPLACE FUNCTION public.studio_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

REVOKE ALL ON FUNCTION public.studio_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_is_admin() TO authenticated;

-- Partner access checks run as this narrowly scoped helper so partner
-- sessions do not need SELECT access to the raw partners profile row.
CREATE OR REPLACE FUNCTION public.studio_partner_can_access(target_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partners p
    WHERE p.id = target_partner_id
      AND p.auth_user_id = auth.uid()
      AND p.is_login_allowed = true
      AND (p.status IS NULL OR p.status = 'Active')
  )
$$;

REVOKE ALL ON FUNCTION public.studio_partner_can_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_partner_can_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.studio_partner_owns_lab_order(target_order_no text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.studio_lab_orders lo
    WHERE lo.order_no = target_order_no
      AND public.studio_partner_can_access(lo.partner_id)
  )
$$;

REVOKE ALL ON FUNCTION public.studio_partner_owns_lab_order(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_partner_owns_lab_order(text) TO authenticated;

-- Branding assets (logos/stamps) stay in Supabase Storage. Gallery photo
-- binaries are handled separately by the Cloudflare R2 upload API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('studio-branding', 'studio-branding', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS studio_branding_public_read ON storage.objects;
CREATE POLICY studio_branding_public_read ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'studio-branding');
DROP POLICY IF EXISTS studio_branding_admin_insert ON storage.objects;
CREATE POLICY studio_branding_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'studio-branding' AND public.studio_is_admin());
DROP POLICY IF EXISTS studio_branding_admin_update ON storage.objects;
CREATE POLICY studio_branding_admin_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'studio-branding' AND public.studio_is_admin())
  WITH CHECK (bucket_id = 'studio-branding' AND public.studio_is_admin());
DROP POLICY IF EXISTS studio_branding_admin_delete ON storage.objects;
CREATE POLICY studio_branding_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'studio-branding' AND public.studio_is_admin());

-- Remove the old anon-wide policies before granting role-specific access.
DO $$
DECLARE
  policy_row record;
  table_row record;
BEGIN
  FOR table_row IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_row.schemaname, table_row.tablename);
    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = table_row.schemaname AND tablename = table_row.tablename
    LOOP
      EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, table_row.schemaname, table_row.tablename);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY studio_admin_all ON %I.%I FOR ALL TO authenticated USING (public.studio_is_admin()) WITH CHECK (public.studio_is_admin())',
      table_row.schemaname, table_row.tablename
    );
  END LOOP;
END $$;

-- Client and partner accounts can read only their own primary records.
CREATE POLICY portal_client_booking_select ON public.bookings
  FOR SELECT TO authenticated
  USING (client_auth_user_id = auth.uid() AND is_login_allowed = true);

CREATE POLICY portal_client_lab_order_select ON public.studio_lab_orders
  FOR SELECT TO authenticated
  USING (client_auth_user_id = auth.uid() AND is_login_allowed = true);

CREATE POLICY portal_partner_assignment_select ON public.shoot_assignments
  FOR SELECT TO authenticated
  USING (public.studio_partner_can_access(partner_id));

CREATE POLICY portal_partner_ledger_select ON public.photographer_ledger
  FOR SELECT TO authenticated
  USING (public.studio_partner_can_access(partner_id));

CREATE POLICY portal_partner_transactions_select ON public.direct_transactions
  FOR SELECT TO authenticated
  USING (public.studio_partner_can_access(partner_id));

CREATE POLICY portal_client_photo_session_select ON public.photo_selection_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.booking_no = photo_selection_sessions.bill_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true)
    OR EXISTS (SELECT 1 FROM public.studio_lab_orders lo WHERE lo.order_no = photo_selection_sessions.bill_id AND lo.client_auth_user_id = auth.uid() AND lo.is_login_allowed = true)
  );

CREATE POLICY portal_partner_photo_session_select ON public.photo_selection_sessions
  FOR SELECT TO authenticated
  USING (public.studio_partner_owns_lab_order(bill_id));

-- Booking-linked detail tables inherit access only from an owned booking or
-- a booking assigned to the authenticated partner.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'booking_functions', 'booking_work_entries', 'booking_photographers',
    'shoot_schedules', 'video_shoots', 'album_work', 'live_setup_items',
    'studio_items', 'deliverables'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY portal_related_booking_select ON public.%I FOR SELECT TO authenticated USING (
          EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = %1$I.booking_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true)
          OR EXISTS (SELECT 1 FROM public.shoot_assignments sa WHERE sa.booking_id = %1$I.booking_id AND public.studio_partner_can_access(sa.partner_id))
        )',
        table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE POLICY portal_client_teaser_select ON public.teaser_projects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id::text = teaser_projects.booking_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true));

CREATE POLICY portal_client_invitation_select ON public.invitation_projects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id::text = invitation_projects.booking_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true));

CREATE POLICY portal_client_music_select ON public.music_projects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = music_projects.booking_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true));

CREATE POLICY portal_client_music_cues_select ON public.music_cues
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.music_projects mp
    JOIN public.bookings b ON b.id = mp.booking_id
    WHERE mp.id = music_cues.project_id AND b.client_auth_user_id = auth.uid() AND b.is_login_allowed = true
  ));

CREATE POLICY portal_active_promo_ads_select ON public.promo_ads
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Public pages may read branding and the UPI payment address, but never bank
-- details, studio PINs, or other private settings.
CREATE OR REPLACE VIEW public.public_studio_settings
WITH (security_barrier = true)
AS
SELECT id, films_title, films_subtitle, production_title, production_subtitle,
       address, phone, email, films_insta, production_insta, whatsapp_number,
       alternate_phone, branch_address, films_logo_url, production_logo_url,
       production_terms, stamp_image_url, terms_conditions, studio_name,
       production_banner_name, studio_whatsapp, studio_call_number, upi_id,
       studio_instagram_url
FROM public.studio_settings
WHERE id = 1;

REVOKE ALL ON public.public_studio_settings FROM PUBLIC;
GRANT SELECT ON public.public_studio_settings TO anon, authenticated;

-- Private failed-login tracking; Edge Functions use service role only.
CREATE TABLE IF NOT EXISTS public.portal_auth_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identifier_hash text NOT NULL,
  ip_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_portal_auth_attempts_window
  ON public.portal_auth_attempts (identifier_hash, ip_hash, attempted_at DESC);
ALTER TABLE public.portal_auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_auth_attempts FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.portal_auth_attempts TO service_role;
