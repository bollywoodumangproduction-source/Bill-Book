-- Align lab-order date fields with the current app payload.
ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS album_required_date text,
  ADD COLUMN IF NOT EXISTS video_delivery_date text,
  ADD COLUMN IF NOT EXISTS date_pending boolean NOT NULL DEFAULT false;

-- RLS policies still control which rows each role may access.
-- portal_auth_attempts is intentionally excluded; the Edge Function uses service_role.
DO $$
DECLARE
  table_row record;
BEGIN
  FOR table_row IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'portal_auth_attempts'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      table_row.tablename
    );
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

NOTIFY pgrst, 'reload schema';
