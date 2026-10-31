-- The public-share Edge Function verifies the PIN, then saves client photo
-- selections using its server-only service_role client.
GRANT UPDATE (photos, updated_at)
  ON TABLE public.photo_selection_sessions
  TO service_role;

NOTIFY pgrst, 'reload schema';
