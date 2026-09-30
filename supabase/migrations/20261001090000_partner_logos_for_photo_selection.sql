-- Store a replaceable logo on each partner profile for B2B selection galleries.
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';

ALTER TABLE public.photo_selection_sessions
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_photo_selection_sessions_partner_id
  ON public.photo_selection_sessions (partner_id);
