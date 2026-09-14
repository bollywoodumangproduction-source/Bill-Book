/*
# Add Client Portal Login Fields to Bookings

1. New Columns on `bookings`
- `is_login_allowed` (boolean, NOT NULL, default false) — admin toggle to enable/disable client portal access per booking
- `client_password` (text, NOT NULL, default '') — the password the client uses to log into the portal; defaults to the client's mobile number on insert
- `password_changed` (boolean, NOT NULL, default false) — tracks whether the password has been changed from the default (mobile number)

2. Backfill
- Existing rows get `is_login_allowed = false`, `client_password = client_mobile` (so the default password is their mobile), `password_changed = false`.

3. Security
- No RLS policy changes. The bookings table already has anon/authenticated CRUD policies (single-tenant app).
- The new columns are accessible via the same existing policies.

4. Important Notes
- The admin can toggle `is_login_allowed` at any time from the Bookings detail view.
- "Reset Password to Default" sets `client_password` back to `client_mobile` and `password_changed` to false.
- The client portal login checks `is_login_allowed` before allowing access.
*/