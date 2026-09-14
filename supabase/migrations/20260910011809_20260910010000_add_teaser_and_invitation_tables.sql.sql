/*
# Add Teaser Preview & Invitation Hub Tables

1. New Table: `teaser_projects`
   - Stores teaser reel preview data for each booking.
   - `id` (uuid PK), `booking_id` (text), `client_name` (text), `video_url` (text),
     `status` (text: editing/complete/delivered), `watermark_text` (text),
     `drive_url` (text), `created_at`, `updated_at`.

2. New Table: `invitation_projects`
   - Stores wedding invitation digital assets.
   - `id` (uuid PK), `booking_id` (text), `client_name` (text),
     `video_url` (text), `pdf_url` (text),
     `groom_name` (text), `bride_name` (text),
     `event_date` (text), `venue_url` (text),
     `created_at`, `updated_at`.

3. Security
   - Single-tenant app with admin login only (no Supabase Auth sign-in).
   - RLS enabled on both tables.
   - Anon + authenticated full CRUD via separate policies per verb.
*/

CREATE TABLE IF NOT EXISTS teaser_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'editing' CHECK (status IN ('editing', 'complete', 'delivered')),
  watermark_text text NOT NULL DEFAULT '',
  drive_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitation_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  pdf_url text NOT NULL DEFAULT '',
  groom_name text NOT NULL DEFAULT '',
  bride_name text NOT NULL DEFAULT '',
  event_date text NOT NULL DEFAULT '',
  venue_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teaser_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_teaser" ON teaser_projects;
CREATE POLICY "anon_select_teaser" ON teaser_projects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_teaser" ON teaser_projects;
CREATE POLICY "anon_insert_teaser" ON teaser_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_teaser" ON teaser_projects;
CREATE POLICY "anon_update_teaser" ON teaser_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_teaser" ON teaser_projects;
CREATE POLICY "anon_delete_teaser" ON teaser_projects FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_invitations" ON invitation_projects;
CREATE POLICY "anon_select_invitations" ON invitation_projects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_invitations" ON invitation_projects;
CREATE POLICY "anon_insert_invitations" ON invitation_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_invitations" ON invitation_projects;
CREATE POLICY "anon_update_invitations" ON invitation_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_invitations" ON invitation_projects;
CREATE POLICY "anon_delete_invitations" ON invitation_projects FOR DELETE TO anon, authenticated USING (true);
