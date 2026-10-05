-- The app's client and partner history already targets this table. Reuse it
-- when present and create it only for Supabase projects missing the table.
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Client IDs in this app are grouped keys (e.g. phone:<number>), not UUIDs.
  client_id text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  entity_type text,
  entry_type text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  reference_order_id text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- If this table was created manually or by a partial setup, fill in only the
-- columns used by the existing app. This is additive and preserves its rows.
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entry_type text,
  ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reference_order_id text,
  ADD COLUMN IF NOT EXISTS date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- App client IDs are grouped keys (e.g. "phone:<number>"), not UUIDs.
-- Converting an empty or UUID-backed existing column to text is lossless.
ALTER TABLE public.ledger_entries
  ALTER COLUMN client_id TYPE text USING client_id::text;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_client_date
  ON public.ledger_entries (client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_booking_date
  ON public.ledger_entries (booking_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_partner_date
  ON public.ledger_entries (partner_id, date DESC);
