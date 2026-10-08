-- Store studio-owned song references separately from client-selectable music_cues.
-- These rows survive selection lock/unlock and client cue edits/deletes.
CREATE TABLE IF NOT EXISTS public.music_master_cues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.music_projects(id) ON DELETE RESTRICT,
  song_title text NOT NULL DEFAULT '',
  singer_artist text NOT NULL DEFAULT '',
  genre_mood text NOT NULL DEFAULT '',
  event_tag text NOT NULL DEFAULT '',
  audio_url text NOT NULL DEFAULT '',
  cue_timestamps text NOT NULL DEFAULT '',
  special_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_master_cues_song_title_nonempty CHECK (length(btrim(song_title)) > 0)
);

CREATE INDEX IF NOT EXISTS music_master_cues_project_id_idx
  ON public.music_master_cues (project_id, created_at);

ALTER TABLE public.music_master_cues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS music_master_cues_admin_all ON public.music_master_cues;
CREATE POLICY music_master_cues_admin_all ON public.music_master_cues
  FOR ALL TO authenticated
  USING (public.studio_is_admin())
  WITH CHECK (public.studio_is_admin());

REVOKE ALL ON public.music_master_cues FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_master_cues TO authenticated;

-- Enable admin-side Postgres Changes. RLS still ensures only admins can read row payloads.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'music_projects') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.music_projects;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'music_cues') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.music_cues;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'music_master_cues') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.music_master_cues;
    END IF;
  END IF;
END;
$$;
