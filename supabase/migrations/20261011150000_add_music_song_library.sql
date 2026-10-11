-- Safe, repeatable Music Selection setup for the studio reference cards and shared song catalog.
-- Existing rows are preserved; the seeded catalog uses stable keys and never inserts duplicates.

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

CREATE TABLE IF NOT EXISTS public.music_song_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_key text NOT NULL UNIQUE,
  song_title text NOT NULL,
  singer_artist text NOT NULL DEFAULT '',
  event_tag text NOT NULL,
  genre_mood text NOT NULL DEFAULT '',
  audio_url text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_song_library_title_nonempty CHECK (length(btrim(song_title)) > 0)
);

CREATE INDEX IF NOT EXISTS music_song_library_event_title_idx
  ON public.music_song_library (event_tag, song_title)
  WHERE is_active;

ALTER TABLE public.music_song_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS music_song_library_admin_all ON public.music_song_library;
CREATE POLICY music_song_library_admin_all ON public.music_song_library
  FOR ALL TO authenticated
  USING (public.studio_is_admin())
  WITH CHECK (public.studio_is_admin());
REVOKE ALL ON public.music_song_library FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_song_library TO authenticated;

INSERT INTO public.music_song_library (catalog_key, song_title, singer_artist, event_tag, genre_mood)
VALUES
  ('wedding-tenu-leke', 'Tenu Leke', 'Salaam-e-Ishq', 'Entry', 'Celebration'),
  ('wedding-gallan-goodiyaan', 'Gallan Goodiyaan', 'Dil Dhadakne Do', 'Wedding/Barat', 'Upbeat'),
  ('wedding-london-thumakda', 'London Thumakda', 'Queen', 'Wedding/Barat', 'Upbeat'),
  ('wedding-nachde-ne-saare', 'Nachde Ne Saare', 'Baar Baar Dekho', 'Wedding/Barat', 'Upbeat'),
  ('wedding-kala-chashma', 'Kala Chashma', 'Baar Baar Dekho', 'Wedding/Barat', 'Dance'),
  ('wedding-morni-banke', 'Morni Banke', 'Badhaai Ho', 'Wedding/Barat', 'Dance'),
  ('wedding-banno', 'Banno', 'Tanu Weds Manu Returns', 'Wedding/Barat', 'Dance'),
  ('wedding-cutiepie', 'Cutiepie', 'Ae Dil Hai Mushkil', 'Wedding/Barat', 'Dance'),
  ('wedding-dil-chori', 'Dil Chori', 'Sonu Ke Titu Ki Sweety', 'Wedding/Barat', 'Dance'),
  ('wedding-aankh-marey', 'Aankh Marey', 'Simmba', 'Wedding/Barat', 'Dance'),
  ('wedding-makhna', 'Makhna', 'Drive', 'Wedding/Barat', 'Upbeat'),
  ('wedding-sauda-khara-khara', 'Sauda Khara Khara', 'Good Newwz', 'Wedding/Barat', 'Dance'),
  ('wedding-laung-laachi', 'Laung Laachi', 'Laung Laachi', 'Wedding/Barat', 'Punjabi folk'),
  ('wedding-gud-naal-ishq-mitha', 'Gud Naal Ishq Mitha', 'Ek Ladki Ko Dekha Toh Aisa Laga', 'Wedding/Barat', 'Punjabi folk'),
  ('wedding-sadi-gali', 'Sadi Gali', 'Tanu Weds Manu', 'Wedding/Barat', 'Punjabi folk'),
  ('haldi-mehndi-hai-rachnewali', 'Mehndi Hai Rachnewali', 'Zubeidaa', 'Haldi', 'Traditional'),
  ('haldi-mehndi-laga-ke-rakhna', 'Mehndi Laga Ke Rakhna', 'Dilwale Dulhania Le Jayenge', 'Haldi', 'Traditional'),
  ('haldi-navrai-majhi', 'Navrai Majhi', 'English Vinglish', 'Haldi', 'Traditional'),
  ('haldi-genda-phool', 'Genda Phool', 'Delhi-6', 'Haldi', 'Festive'),
  ('haldi-banno-re-banno', 'Banno Re Banno', 'Mere Yaar Ki Shaadi Hai', 'Haldi', 'Traditional'),
  ('haldi-sasural-genda-phool', 'Sasural Genda Phool', 'Delhi-6', 'Haldi', 'Festive'),
  ('haldi-dholida', 'Dholida', 'Gangubai Kathiawadi', 'Haldi', 'Garba'),
  ('haldi-chogada', 'Chogada', 'Loveyatri', 'Haldi', 'Garba'),
  ('haldi-shubhaarambh', 'Shubhaarambh', 'Kai Po Che!', 'Haldi', 'Garba'),
  ('haldi-nagada-sang-dhol', 'Nagada Sang Dhol', 'Goliyon Ki Raasleela Ram-Leela', 'Haldi', 'Garba'),
  ('jaymala-din-shagna-da', 'Din Shagna Da', 'Phillauri', 'Jaymala', 'Bridal entry'),
  ('jaymala-madhanya', 'Madhanya', 'Neha Bhasin', 'Jaymala', 'Punjabi wedding'),
  ('jaymala-aaj-sajeya', 'Aaj Sajeya', 'Goldie Sohel', 'Jaymala', 'Romantic'),
  ('jaymala-raanjhan', 'Raanjhan', 'Do Patti', 'Jaymala', 'Romantic'),
  ('jaymala-ranjha', 'Ranjha', 'Shershaah', 'Jaymala', 'Romantic'),
  ('entry-tujh-mein-rab-dikhta-hai', 'Tujh Mein Rab Dikhta Hai', 'Rab Ne Bana Di Jodi', 'Entry', 'Romantic'),
  ('entry-jag-ghoomeya', 'Jag Ghoomeya', 'Sultan', 'Entry', 'Romantic'),
  ('entry-deewani-mastani', 'Deewani Mastani', 'Bajirao Mastani', 'Entry', 'Grand entry'),
  ('entry-tere-vaaste', 'Tere Vaaste', 'Zara Hatke Zara Bachke', 'Entry', 'Romantic'),
  ('entry-apna-bana-le', 'Apna Bana Le', 'Bhediya', 'Entry', 'Romantic'),
  ('entry-heeriye', 'Heeriye', 'Jasleen Royal', 'Entry', 'Romantic'),
  ('entry-veeraniya', 'Veeraniya', 'Namastey London', 'Entry', 'Romantic'),
  ('entry-saans', 'Saans', 'Jab Tak Hai Jaan', 'Entry', 'Romantic'),
  ('entry-pehli-nazar-mein', 'Pehli Nazar Mein', 'Race', 'Entry', 'Romantic'),
  ('couple-kesariya', 'Kesariya', 'Brahmastra', 'Teaser', 'Romantic'),
  ('couple-raataan-lambiyan', 'Raataan Lambiyan', 'Shershaah', 'Teaser', 'Romantic'),
  ('couple-tum-se-hi', 'Tum Se Hi', 'Jab We Met', 'Teaser', 'Romantic'),
  ('couple-mast-magan', 'Mast Magan', '2 States', 'Teaser', 'Romantic'),
  ('couple-janam-janam', 'Janam Janam', 'Dilwale', 'Teaser', 'Romantic'),
  ('couple-hawayein', 'Hawayein', 'Jab Harry Met Sejal', 'Teaser', 'Romantic'),
  ('couple-soch-na-sake', 'Soch Na Sake', 'Airlift', 'Teaser', 'Romantic'),
  ('couple-dil-diyan-gallan', 'Dil Diyan Gallan', 'Tiger Zinda Hai', 'Teaser', 'Romantic'),
  ('couple-tera-ban-jaunga', 'Tera Ban Jaunga', 'Kabir Singh', 'Teaser', 'Romantic'),
  ('couple-tum-hi-ho', 'Tum Hi Ho', 'Aashiqui 2', 'Teaser', 'Romantic'),
  ('vidai-kabira-encore', 'Kabira (Encore)', 'Yeh Jawaani Hai Deewani', 'Vidai', 'Emotional'),
  ('vidai-vidaai', 'Vidaai', 'Veer-Zaara', 'Vidai', 'Emotional')
ON CONFLICT (catalog_key) DO NOTHING;

-- Catalog references are for studio selection only. Clients and partners receive
-- a song only after it is added to their existing project cue sheet.
