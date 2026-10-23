ALTER TABLE public.studio_settings
  ADD COLUMN IF NOT EXISTS upi_qr_image_url text NOT NULL DEFAULT '';

CREATE OR REPLACE VIEW public.public_studio_settings AS
SELECT id, films_title, films_subtitle, production_title, production_subtitle,
       address, phone, email, films_insta, production_insta, whatsapp_number,
       alternate_phone, branch_address, films_logo_url, production_logo_url,
       production_terms, stamp_image_url, terms_conditions, studio_name,
       production_banner_name, studio_whatsapp, studio_call_number, upi_id,
       studio_instagram_url, upi_qr_image_url
FROM public.studio_settings
WHERE id = 1;

ALTER VIEW public.public_studio_settings
  SET (security_invoker = on, security_barrier = on);

GRANT SELECT (upi_qr_image_url)
  ON public.studio_settings TO anon, authenticated;
