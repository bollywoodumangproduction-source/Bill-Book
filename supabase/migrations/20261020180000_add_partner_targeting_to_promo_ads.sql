ALTER TABLE public.promo_ads
  ADD COLUMN IF NOT EXISTS target_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

ALTER TABLE public.promo_ads
  DROP CONSTRAINT IF EXISTS promo_ads_target_scope_check;

ALTER TABLE public.promo_ads
  ADD CONSTRAINT promo_ads_target_scope_check
  CHECK (target_scope IN ('all', 'specific_client', 'specific_partner'));

CREATE INDEX IF NOT EXISTS idx_promo_ads_partner_target
  ON public.promo_ads (partner_id)
  WHERE partner_id IS NOT NULL;
