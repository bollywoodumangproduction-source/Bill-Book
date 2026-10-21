-- Permanently delete only music-selection data owned by one project.
-- Booking, partner, lab order/client, event categories, and the shared song library stay intact.
CREATE OR REPLACE FUNCTION public.studio_delete_music_project(target_project_id uuid)
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

  -- Delete children explicitly: master cue cards use ON DELETE RESTRICT,
  -- while song choices also cascade from the project.
  DELETE FROM public.music_cues
  WHERE project_id = target_project_id;

  DELETE FROM public.music_master_cues
  WHERE project_id = target_project_id;

  DELETE FROM public.music_projects
  WHERE id = target_project_id;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_delete_music_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_delete_music_project(uuid) TO authenticated;
