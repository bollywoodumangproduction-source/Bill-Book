-- Read-only Supabase setup check. Safe to run before/after migrations.
-- It reports schema metadata only; it does not read application records or
-- modify tables, data, policies, functions, or secrets.

WITH expected_columns(table_name, column_name) AS (
  VALUES
    ('bookings', 'id'),
    ('bookings', 'booking_no'),
    ('bookings', 'client_mobile'),
    ('bookings', 'access_pin'),
    ('bookings', 'is_login_allowed'),
    ('bookings', 'client_auth_user_id'),
    ('partners', 'id'),
    ('partners', 'mobile'),
    ('partners', 'portal_password'),
    ('partners', 'is_login_allowed'),
    ('partners', 'auth_user_id'),
    ('studio_lab_orders', 'id'),
    ('studio_lab_orders', 'order_no'),
    ('studio_lab_orders', 'partner_id'),
    ('studio_lab_orders', 'clients'),
    ('studio_lab_orders', 'access_pin'),
    ('studio_lab_orders', 'is_login_allowed'),
    ('studio_lab_orders', 'client_auth_user_id'),
    ('shoot_assignments', 'partner_id'),
    ('shoot_assignments', 'booking_id'),
    ('photographer_ledger', 'partner_id'),
    ('direct_transactions', 'partner_id'),
    ('ledger_entries', 'client_id'),
    ('ledger_entries', 'booking_id'),
    ('ledger_entries', 'partner_id'),
    ('photo_selection_sessions', 'bill_id'),
    ('photo_selection_sessions', 'pin_code'),
    ('teaser_projects', 'booking_id'),
    ('invitation_projects', 'booking_id'),
    ('music_projects', 'booking_id'),
    ('music_cues', 'project_id'),
    ('studio_settings', 'id')
)
SELECT
  expected.table_name,
  expected.column_name,
  columns.data_type,
  columns.udt_name,
  (columns.column_name IS NOT NULL) AS exists
FROM expected_columns AS expected
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = 'public'
 AND columns.table_name = expected.table_name
 AND columns.column_name = expected.column_name
ORDER BY expected.table_name, expected.column_name;

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname = ANY (ARRAY[
    'bookings', 'partners', 'studio_lab_orders', 'shoot_assignments',
    'photographer_ledger', 'direct_transactions', 'ledger_entries',
    'photo_selection_sessions', 'teaser_projects', 'invitation_projects',
    'music_projects', 'music_cues', 'studio_settings'
  ])
ORDER BY c.relname;

SELECT
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[
    'bookings', 'partners', 'studio_lab_orders', 'shoot_assignments',
    'photographer_ledger', 'direct_transactions', 'ledger_entries',
    'photo_selection_sessions', 'teaser_projects', 'invitation_projects',
    'music_projects', 'music_cues', 'studio_settings'
  ])
ORDER BY tablename, policyname;

SELECT
  function_name,
  to_regprocedure(signature) IS NOT NULL AS exists
FROM (VALUES
  ('studio_is_admin', 'public.studio_is_admin()'),
  ('studio_partner_can_access', 'public.studio_partner_can_access(uuid)'),
  ('studio_partner_owns_lab_order', 'public.studio_partner_owns_lab_order(text)')
) AS expected(function_name, signature);

SELECT
  'studio-branding' AS bucket_name,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'studio-branding') AS exists;
