-- Allow existing announcements, popups, and coupons to target client and
-- partner portals without copying records into another table.
ALTER TABLE public.promo_banners
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';
ALTER TABLE public.promo_popups
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';
ALTER TABLE public.promo_coupons
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';

-- Preserve older broadcast rows that were created with the empty default.
UPDATE public.promo_broadcasts SET category = 'all' WHERE category IS NULL OR btrim(category) = '';
ALTER TABLE public.promo_broadcasts ALTER COLUMN category SET DEFAULT 'all';

GRANT SELECT ON TABLE public.promo_banners, public.promo_popups, public.promo_coupons, public.promo_broadcasts TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_banners_audience_check') THEN
    ALTER TABLE public.promo_banners ADD CONSTRAINT promo_banners_audience_check CHECK (audience IN ('all', 'clients', 'partners'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_popups_audience_check') THEN
    ALTER TABLE public.promo_popups ADD CONSTRAINT promo_popups_audience_check CHECK (audience IN ('all', 'clients', 'partners'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_coupons_audience_check') THEN
    ALTER TABLE public.promo_coupons ADD CONSTRAINT promo_coupons_audience_check CHECK (audience IN ('all', 'clients', 'partners'));
  END IF;
END $$;

-- Portal accounts may read active, audience-matched marketing items only.
-- Admin CRUD continues through the existing studio_admin_all policies.
DROP POLICY IF EXISTS portal_marketing_banners_read ON public.promo_banners;
CREATE POLICY portal_marketing_banners_read ON public.promo_banners
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('client_booking', 'client_lab', 'partner')
    AND (
      audience = 'all'
      OR (audience = 'clients' AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('client_booking', 'client_lab'))
      OR (audience = 'partners' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'partner')
    )
  );

DROP POLICY IF EXISTS portal_marketing_popups_read ON public.promo_popups;
CREATE POLICY portal_marketing_popups_read ON public.promo_popups
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('client_booking', 'client_lab', 'partner')
    AND (
      audience = 'all'
      OR (audience = 'clients' AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('client_booking', 'client_lab'))
      OR (audience = 'partners' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'partner')
    )
  );

DROP POLICY IF EXISTS portal_marketing_coupons_read ON public.promo_coupons;
CREATE POLICY portal_marketing_coupons_read ON public.promo_coupons
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('client_booking', 'client_lab', 'partner')
    AND (
      audience = 'all'
      OR (audience = 'clients' AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('client_booking', 'client_lab'))
      OR (audience = 'partners' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'partner')
    )
  );

DROP POLICY IF EXISTS portal_marketing_broadcasts_read ON public.promo_broadcasts;
CREATE POLICY portal_marketing_broadcasts_read ON public.promo_broadcasts
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('client_booking', 'client_lab', 'partner')
    AND (
      category = 'all'
      OR (category = 'clients' AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('client_booking', 'client_lab'))
      OR (category = 'partners' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'partner')
    )
  );
