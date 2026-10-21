-- Restore public access to the intentionally limited settings view while
-- keeping studio_settings private to the anon role and admin users.
ALTER VIEW public.public_studio_settings
  SET (security_invoker = on, security_barrier = on);

REVOKE ALL ON public.public_studio_settings FROM PUBLIC;
GRANT SELECT ON public.public_studio_settings TO anon, authenticated;

-- Remove legacy policies that allowed every anon/authenticated user to read
-- studio_settings directly. The view exposes only the public branding fields.
DROP POLICY IF EXISTS "anon_select_settings" ON public.studio_settings;
DROP POLICY IF EXISTS "anon_select_studio_settings" ON public.studio_settings;
DROP POLICY IF EXISTS public_studio_settings_anon_select ON public.studio_settings;
DROP POLICY IF EXISTS public_studio_settings_authenticated_select ON public.studio_settings;

CREATE POLICY public_studio_settings_anon_select
  ON public.studio_settings
  FOR SELECT TO anon
  USING (id = 1);

-- Admin screens read the base settings row directly; authenticated non-admin
-- users may not use the security-invoker view to reach private settings.
CREATE POLICY public_studio_settings_authenticated_select
  ON public.studio_settings
  FOR SELECT TO authenticated
  USING (
    id = 1
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- A security-invoker view checks privileges on the underlying table. Keep anon
-- access limited to the columns explicitly projected by this public view.
REVOKE SELECT ON public.studio_settings FROM PUBLIC, anon;
GRANT SELECT (
  id, films_title, films_subtitle, production_title, production_subtitle,
  address, phone, email, films_insta, production_insta, whatsapp_number,
  alternate_phone, branch_address, films_logo_url, production_logo_url,
  production_terms, stamp_image_url, terms_conditions, studio_name,
  production_banner_name, studio_whatsapp, studio_call_number, upi_id,
  studio_instagram_url
) ON public.studio_settings TO anon;

-- Grant the view's projected columns to authenticated so its SELECT privilege
-- is complete for admin users; RLS above still limits the underlying row.
GRANT SELECT (
  id, films_title, films_subtitle, production_title, production_subtitle,
  address, phone, email, films_insta, production_insta, whatsapp_number,
  alternate_phone, branch_address, films_logo_url, production_logo_url,
  production_terms, stamp_image_url, terms_conditions, studio_name,
  production_banner_name, studio_whatsapp, studio_call_number, upi_id,
  studio_instagram_url
) ON public.studio_settings TO authenticated;
