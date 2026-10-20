CREATE TABLE IF NOT EXISTS public.music_event_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_tag text NOT NULL CHECK (length(btrim(event_tag)) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS music_event_categories_event_tag_normalized_uidx
  ON public.music_event_categories (lower(btrim(event_tag)));

ALTER TABLE public.music_event_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS music_event_categories_admin_all ON public.music_event_categories;
CREATE POLICY music_event_categories_admin_all ON public.music_event_categories
  FOR ALL TO authenticated
  USING (public.studio_is_admin())
  WITH CHECK (public.studio_is_admin());

REVOKE ALL ON public.music_event_categories FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_event_categories TO authenticated;

INSERT INTO public.music_event_categories (event_tag)
VALUES ('Teaser'), ('Haldi'), ('Entry'), ('Jaymala'), ('Vidai'), ('Reception'), ('Wedding/Barat')
ON CONFLICT DO NOTHING;

INSERT INTO public.music_event_categories (event_tag)
SELECT DISTINCT btrim(event_tag)
FROM (
  SELECT event_tag FROM public.music_song_library
  UNION ALL
  SELECT category AS event_tag FROM public.music_cues
  UNION ALL
  SELECT event_tag FROM public.music_master_cues
) AS existing_events
WHERE event_tag IS NOT NULL AND length(btrim(event_tag)) BETWEEN 1 AND 60
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'music_event_categories'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.music_event_categories;
  END IF;
END;
$$;
