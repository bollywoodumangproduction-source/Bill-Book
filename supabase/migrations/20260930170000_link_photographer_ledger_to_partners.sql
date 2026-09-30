-- Keep partner ledger history attached to the partner profile when a phone
-- number changes. Backfill existing rows using the current unique mobile.
ALTER TABLE public.photographer_ledger
  ADD COLUMN IF NOT EXISTS partner_id uuid;

UPDATE public.photographer_ledger AS ledger
SET partner_id = partner.id
FROM public.partners AS partner
WHERE ledger.partner_id IS NULL
  AND ledger.mobile = partner.mobile;

CREATE INDEX IF NOT EXISTS idx_photographer_ledger_partner_id
  ON public.photographer_ledger (partner_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photographer_ledger_partner_id_fkey'
      AND conrelid = 'public.photographer_ledger'::regclass
  ) THEN
    ALTER TABLE public.photographer_ledger
      ADD CONSTRAINT photographer_ledger_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;
  END IF;
END $$;
