-- Allow administrators to remove a music project and its dependent cue data
-- atomically, while keeping the function unavailable to anonymous users.
CREATE OR REPLACE FUNCTION public.studio_delete_music_project(target_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.studio_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.music_projects WHERE id = target_project_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.music_master_cues WHERE project_id = target_project_id;
  DELETE FROM public.music_cues WHERE project_id = target_project_id;
  DELETE FROM public.music_projects WHERE id = target_project_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_delete_music_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_delete_music_project(uuid) TO authenticated;
