# Supabase setup

The app uses Supabase Postgres for application data and Supabase Auth for admin, client, and partner sessions. The browser must use only the project URL and public anon/publishable key. The service-role key and portal PIN pepper belong only in Supabase Edge Function secrets.

## 1. Apply the SQL migrations

In Supabase Dashboard → SQL Editor, first run `supabase/PREFLIGHT.sql`. It only reads schema metadata and shows which tables, columns, policies, and security functions already exist; it does not change or return business data. Then check SQL Editor history and apply only the migrations that have not already succeeded, in filename/timestamp order, **one file at a time**. The `20260816021933_reinitialize_studio_schema.sql` file drops and recreates core tables; run it only as part of a fresh empty-project setup. If setup was already started, do not restart from the beginning or guess which files to rerun. If the applied point is unclear, pause before running SQL and review the preflight output/history first. `20261005140000_secure_portal_auth_and_rls.sql` is the security migration. `20261008170000_repair_portal_pin_schema.sql` ensures the PIN fields exist and are text; it does not create broad RLS policies.

The security migration replaces earlier broad anon policies with admin-only writes and owner-scoped client/partner reads. It also checks the existing `is_login_allowed` control on each RLS read, so disabling portal access blocks data reads for active sessions too. Assigned booking details for partners come from an authenticated Edge Function with only operational fields; partners cannot query the full booking row and expose client billing totals. A lab order remains attached to its selected partner through `partner_id`; its existing `clients` JSON keeps multiple client rows and their separate album/video work, extra charges, and client-attributed payments in the same order. Partner lab-order details also come from an authenticated allow-listed Edge Function; direct partner reads and Realtime row payloads for `studio_lab_orders` are denied so the clients' portal PIN columns are not exposed. Partner access follows `partner_id`, without creating a second order or client PIN record. Unauthenticated invoice, photo-selection, teaser, music, and invitation links are routed through the restricted `public-share` Edge Function rather than receiving broad table access. Photo-gallery updates require the gallery PIN on the server. Music links now use a project UUID; resend previously copied party-name links. The ledger migration reuses `ledger_entries` if it already exists and only adds the app's missing columns/indexes; it does not drop existing records. After the security migration, apply `20261009230000_portal_marketing_visibility.sql` to add audience targeting and read-only portal visibility for banners, popups, coupons, and broadcasts.

`20261008190000_unify_booking_payment_ledger.sql` adds the single-entry booking/lab payment RPCs, stable installment-to-audit IDs, Dairy Book sync, optional zero-default tax fields, and linked previous-balance transfers. Apply it only after reviewing the already-applied migration history and current preflight output. It preserves old stored totals as billing version 1; new records use the itemized billing version 2. Payments becomes an audit view; enter booking receipts from Bookings, lab receipts from the Lab Order, and unrelated cash entries from Dairy Book.

`20261009100000_secure_equipment_rental_workflows.sql` makes rental creation/edit and payment recording transactional, protects retries from duplicate rental/payment records, mirrors corrected counterparty details to the payment audit, and supports explicit refunds after cancellation. Apply this migration before deploying the matching Equipment Rentals UI; it leaves existing rental and payment rows in place and backfills payment direction from each rental.

`20261009110000_add_music_master_cue_cards.sql` creates a separate, admin-only `music_master_cues` table for studio song references and editing notes. It does not modify client-selected `music_cues`; the foreign key prevents deleting a music project while its master references exist. Apply it before deploying the Music Selection update. The client share page continues using the restricted `public-share` Edge Function and refreshes its status there, rather than opening anonymous Realtime access to project data.

That migration also creates the public `studio-branding` Supabase Storage bucket for logos/stamps (2 MB, JPG/PNG/WebP/GIF). The app restricts uploads and deletion to the admin Auth role. Photo-selection image binaries are reserved for Cloudflare R2 once its signer API is configured; Supabase stores their URLs and related selection data.

## 2. Create the admin Auth account

Create the admin email/password user in Dashboard → Authentication → Users. Then, in SQL Editor, grant that exact user the admin app metadata role (replace the email):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'YOUR_ADMIN_EMAIL';
```

Sign out and sign back in after changing metadata so the JWT has the updated role. Admin pages reject accounts without `app_metadata.role = admin`.

## 3. Deploy portal PIN authentication

Deploy both `supabase/functions/portal-auth` and `supabase/functions/public-share` as Edge Functions. In Dashboard → Edge Functions → Secrets, add:

- `PORTAL_PIN_PEPPER`: a randomly generated secret at least 32 bytes long. Keep it private and keep a secure offline backup; changing it invalidates existing PIN hashes.
- `ALLOWED_APP_ORIGINS`: comma-separated exact origins, for example the Vercel app origin and `http://localhost:5173` for local development.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Do not put the service-role key or pepper in Vercel `VITE_` variables, frontend code, or GitHub. `supabase/config.toml` disables gateway JWT verification only for this endpoint because login is anonymous; the function itself validates PINs, rate-limits failures, and only issues scoped Auth sessions.

Client and partner login is disabled until an admin enables it on the record. Use the admin's Set/Reset PIN controls to initialize a PIN securely. Existing plaintext PINs migrate to keyed hashes on the first successful login or admin reset. Admin UI never reveals a PIN. The client and partner login pages send the PIN as a string to `portal-auth`; the Edge Function performs PIN verification using its service-role client, so an anon/authenticated RLS policy is not needed for that lookup. Do not add an anon policy exposing PIN columns. Authenticated post-login reads remain protected by the owner-scoped policies from the hardening migration. Public invoice, teaser, invitation, music and photo-selection links use the `public-share` Edge Function after the hardening migration; music links now identify a project by its UUID, so resend previously copied party-name links.

## 4. Configure the frontend

Set these Vercel environment variables for each deployment environment and redeploy:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)

For local development, copy `.env.example` to `.env.local` and enter the same public values there. `.env.local` is ignored by Git; commit only `.env.example` with placeholders.

## 5. Cloudflare R2 later

Photo uploads currently require a trusted signing/upload API. When ready, implement the contract in `R2_UPLOAD_API.md` and set `VITE_R2_UPLOAD_API_URL` to that endpoint in Vercel. Keep R2 access keys on the signing server only.
