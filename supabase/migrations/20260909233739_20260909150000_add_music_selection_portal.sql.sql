/*
# Add Music Selection Portal

1. New Table: `music_projects`
- `id` (uuid, primary key) — project identifier.
- `client_name` (text) — party or lab client name shown in the portal.
- `booking_id` (uuid, nullable) — optional link to an existing booking.
- `mode` (text) — `b2c` for direct parties or `b2b` for lab/photographer projects.
- `status` (text) — `draft`, `submitted`, or `locked`.
- `locked_at` (timestamptz, nullable) — time the client finalized the selection.
- `created_at`, `updated_at` (timestamptz) — record timestamps.

2. New Table: `music_cues`
- `id` (uuid, primary key) — cue identifier.
- `project_id` (uuid) — parent music project.
- `category` (text) — event use such as Teaser, Entry, or Reception.
- `track_title` (text) — chosen track name.
- `track_url` (text) — optional YouTube, Spotify, Instagram, or audio preview link.
- `start_time` (text) — timestamp or timecode instruction.
- `usage_notes` (text) — editing direction from the client.
- `priority` (text) — `must_use`, `preferred`, or `reference`.
- `created_at`, `updated_at` (timestamptz) — record timestamps.

3. Security
- Enable row-level security on both tables.
- This is a single-studio portal without Supabase Auth, so anon and authenticated users receive separate CRUD policies for the shared studio workspace.
- Deleting a project also deletes its cue rows through the foreign key.

4. Notes
- Existing bookings and data are not changed.
- The frontend keeps the same fields in its local fallback store so the module works in the current offline-capable app too.
*/

CREATE TABLE IF NOT EXISTS music_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  booking_id uuid,
  mode text NOT NULL DEFAULT 'b2c' CHECK (mode IN ('b2c', 'b2b')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'locked')),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS music_cues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES music_projects(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'Teaser',
  track_title text NOT NULL DEFAULT '',
  track_url text NOT NULL DEFAULT '',
  start_time text NOT NULL DEFAULT '',
  usage_notes text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'preferred' CHECK (priority IN ('must_use', 'preferred', 'reference')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS music_projects_client_name_idx ON music_projects (lower(client_name));
CREATE INDEX IF NOT EXISTS music_cues_project_id_idx ON music_cues (project_id);

ALTER TABLE music_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_cues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_music_projects" ON music_projects;
CREATE POLICY "anon_select_music_projects" ON music_projects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_music_projects" ON music_projects;
CREATE POLICY "anon_insert_music_projects" ON music_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_music_projects" ON music_projects;
CREATE POLICY "anon_update_music_projects" ON music_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_music_projects" ON music_projects;
CREATE POLICY "anon_delete_music_projects" ON music_projects FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_music_cues" ON music_cues;
CREATE POLICY "anon_select_music_cues" ON music_cues FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_music_cues" ON music_cues;
CREATE POLICY "anon_insert_music_cues" ON music_cues FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_music_cues" ON music_cues;
CREATE POLICY "anon_update_music_cues" ON music_cues FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_music_cues" ON music_cues;
CREATE POLICY "anon_delete_music_cues" ON music_cues FOR DELETE TO anon, authenticated USING (true);
