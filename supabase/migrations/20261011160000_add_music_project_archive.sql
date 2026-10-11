-- Safely archive music projects without deleting projects, cues, or master notes.
ALTER TABLE public.music_projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS music_projects_archived_at_idx
  ON public.music_projects (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.studio_set_music_project_archived(
  target_project_id uuid,
  should_archive boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_count integer;
BEGIN
  IF NOT public.studio_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.music_projects
  SET archived_at = CASE WHEN should_archive THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = target_project_id;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_set_music_project_archived(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_set_music_project_archived(uuid, boolean) TO authenticated;
