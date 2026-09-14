/*
# Add Promo Ads Table + Brand/Contact Settings

1. New Table: `promo_ads`
   - `id` (uuid, PK)
   - `title` (text, NOT NULL) — promo card title
   - `description` (text, default '') — promo description
   - `image_url` (text, default '') — image/footage URL
   - `action_link` (text, default '') — optional clickable link
   - `audience` (text, NOT NULL, CHECK in 'clients'/'partners') — target audience
   - `is_active` (boolean, NOT NULL, default true) — active/inactive toggle
   - `sort_order` (integer, default 0) — display ordering
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

2. New Columns on `studio_settings`
   - `studio_name` (text, default '') — separate studio name for billings
   - `production_banner_name` (text, default '') — production banner name
   - `studio_whatsapp` (text, default '') — WhatsApp number for client contact hub
   - `studio_call_number` (text, default '') — phone number for tel: links
   - `studio_instagram_url` (text, default '') — Instagram profile URL

3. Security
   - RLS enabled on `promo_ads`.
   - Anon + authenticated full CRUD (single-admin app, no Supabase Auth sign-in).
*/

CREATE TABLE IF NOT EXISTS promo_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  action_link text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'clients' CHECK (audience IN ('clients', 'partners')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE promo_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_promo_ads" ON promo_ads;
CREATE POLICY "anon_all_promo_ads" ON promo_ads FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_name text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS production_banner_name text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_whatsapp text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_call_number text NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS studio_instagram_url text NOT NULL DEFAULT '';
