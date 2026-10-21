-- Keep the public branding view behind base-table RLS and column privileges.
-- Public pages use the anon role; authenticated portal users must not inherit
-- broader access to studio_settings through this view.
ALTER VIEW public.public_studio_settings
  SET (security_invoker = true, security_barrier = true);

REVOKE ALL ON public.public_studio_settings FROM PUBLIC, authenticated;
GRANT SELECT ON public.public_studio_settings TO anon;

DROP POLICY IF EXISTS public_studio_settings_anon_select ON public.studio_settings;
CREATE POLICY public_studio_settings_anon_select ON public.studio_settings
  FOR SELECT TO anon
  USING (id = 1);

-- Invoker views require the caller to have privileges on the underlying table.
-- Grant anon only the columns exposed by the public view, never private fields
-- such as bank details or portal PINs.
REVOKE SELECT ON public.studio_settings FROM PUBLIC, anon;
GRANT SELECT (
  id, films_title, films_subtitle, production_title, production_subtitle,
  address, phone, email, films_insta, production_insta, whatsapp_number,
  alternate_phone, branch_address, films_logo_url, production_logo_url,
  production_terms, stamp_image_url, terms_conditions, studio_name,
  production_banner_name, studio_whatsapp, studio_call_number, upi_id,
  studio_instagram_url
) ON public.studio_settings TO anon;
