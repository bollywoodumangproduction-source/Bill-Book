-- Link music projects to the client booking or partner lab client they serve.
-- Existing music projects remain intact and can be linked from the admin form.
ALTER TABLE public.music_projects
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lab_order_id uuid REFERENCES public.studio_lab_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lab_client_id text;

CREATE INDEX IF NOT EXISTS music_projects_partner_id_idx
  ON public.music_projects (partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS music_projects_lab_order_id_idx
  ON public.music_projects (lab_order_id)
  WHERE lab_order_id IS NOT NULL;

-- Safely associate legacy projects only when a client/name match is unique.
WITH booking_candidates AS (
  SELECT mp.id AS project_id, min(b.id::text)::uuid AS booking_id
  FROM public.music_projects mp
  JOIN public.bookings b
    ON lower(btrim(b.client_name)) = lower(btrim(mp.client_name))
  WHERE mp.mode = 'b2c'
    AND mp.booking_id IS NULL
    AND coalesce(mp.client_name, '') <> ''
  GROUP BY mp.id
  HAVING count(*) = 1
)
UPDATE public.music_projects mp
SET booking_id = candidates.booking_id
FROM booking_candidates candidates
WHERE mp.id = candidates.project_id;

WITH partner_candidates AS (
  SELECT mp.id AS project_id,
         lo.partner_id,
         lo.id AS lab_order_id,
         client.value ->> 'id' AS lab_client_id
  FROM public.music_projects mp
  JOIN public.studio_lab_orders lo ON lo.partner_id IS NOT NULL
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(lo.clients, '[]'::jsonb)) AS client(value)
  WHERE mp.mode = 'b2b'
    AND mp.partner_id IS NULL
    AND lower(btrim(coalesce(client.value ->> 'client_name', ''))) = lower(btrim(mp.client_name))
    AND coalesce(mp.client_name, '') <> ''
  UNION ALL
  SELECT mp.id AS project_id,
         p.id AS partner_id,
         NULL::uuid AS lab_order_id,
         NULL::text AS lab_client_id
  FROM public.music_projects mp
  JOIN public.partners p
    ON lower(btrim(coalesce(p.studio_name, ''))) = lower(btrim(mp.client_name))
    OR lower(btrim(coalesce(p.name, ''))) = lower(btrim(mp.client_name))
  WHERE mp.mode = 'b2b'
    AND mp.partner_id IS NULL
    AND coalesce(mp.client_name, '') <> ''
), unique_partner_candidates AS (
  SELECT project_id,
         min(partner_id::text)::uuid AS partner_id,
         min(lab_order_id::text)::uuid AS lab_order_id,
         min(lab_client_id) AS lab_client_id
  FROM partner_candidates
  GROUP BY project_id
  HAVING count(*) = 1
)
UPDATE public.music_projects mp
SET partner_id = candidates.partner_id,
    lab_order_id = candidates.lab_order_id,
    lab_client_id = candidates.lab_client_id
FROM unique_partner_candidates candidates
WHERE mp.id = candidates.project_id;

DROP POLICY IF EXISTS portal_client_music_select ON public.music_projects;
CREATE POLICY portal_music_project_select ON public.music_projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = music_projects.booking_id
        AND b.client_auth_user_id = auth.uid()
        AND b.is_login_allowed = true
    )
    OR public.studio_partner_can_access(music_projects.partner_id)
  );

DROP POLICY IF EXISTS portal_client_music_cues_select ON public.music_cues;
CREATE POLICY portal_music_cues_select ON public.music_cues
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.music_projects mp
      JOIN public.bookings b ON b.id = mp.booking_id
      WHERE mp.id = music_cues.project_id
        AND b.client_auth_user_id = auth.uid()
        AND b.is_login_allowed = true
    )
    OR EXISTS (
      SELECT 1 FROM public.music_projects mp
      WHERE mp.id = music_cues.project_id
        AND public.studio_partner_can_access(mp.partner_id)
    )
  );
