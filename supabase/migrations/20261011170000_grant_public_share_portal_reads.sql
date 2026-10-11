-- Allow the public-share Edge Function's server-only service role to read
-- portal rows. Browser roles and RLS policies are unchanged.
GRANT SELECT ON TABLE
  public.bookings,
  public.teaser_projects,
  public.invitation_projects,
  public.music_projects,
  public.music_cues,
  public.music_song_library
TO service_role;

-- The music portal can add cues and finalize a project through public-share.
GRANT INSERT ON TABLE public.music_cues TO service_role;
GRANT UPDATE (status, locked_at, updated_at)
  ON TABLE public.music_projects TO service_role;

NOTIFY pgrst, 'reload schema';
