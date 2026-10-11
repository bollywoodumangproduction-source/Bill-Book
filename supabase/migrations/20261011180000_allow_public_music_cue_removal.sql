-- The public music portal removes a cue only while its project is unlocked.
-- The Edge Function scopes deletion by both cue ID and project ID.
GRANT DELETE ON TABLE public.music_cues TO service_role;

NOTIFY pgrst, 'reload schema';
