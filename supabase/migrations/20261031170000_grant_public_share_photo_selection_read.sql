-- The public-share Edge Function validates the gallery PIN before returning
-- session data. Keep this table readable by the server role only; browser-role
-- grants and RLS policies remain unchanged.
GRANT SELECT ON TABLE public.photo_selection_sessions TO service_role;

NOTIFY pgrst, 'reload schema';
