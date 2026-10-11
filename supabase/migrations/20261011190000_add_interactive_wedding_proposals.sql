-- Standalone wedding quotation proposals. Existing booking, payment, ledger,
-- portal, photo, and music tables are intentionally not referenced here.
CREATE TABLE IF NOT EXISTS public.studio_interactive_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Wedding Proposal',
  client_name text,
  client_phone text,
  public_token text NOT NULL UNIQUE,
  pin text,
  is_locked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'shared', 'finalized')),
  packages_data jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(packages_data) = 'array'),
  selected_package jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_interactive_packages_pin_format CHECK (pin IS NULL OR pin ~ '^[0-9]{4}$')
);

ALTER TABLE public.studio_interactive_packages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_interactive_packages FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_interactive_packages TO authenticated;
GRANT SELECT, UPDATE ON public.studio_interactive_packages TO service_role;

DROP POLICY IF EXISTS studio_admin_all ON public.studio_interactive_packages;
CREATE POLICY studio_admin_all ON public.studio_interactive_packages
  FOR ALL TO authenticated
  USING (public.studio_is_admin())
  WITH CHECK (public.studio_is_admin());

CREATE INDEX IF NOT EXISTS studio_interactive_packages_created_at_idx
  ON public.studio_interactive_packages (created_at DESC);

NOTIFY pgrst, 'reload schema';
