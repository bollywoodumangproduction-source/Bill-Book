/*
# Add 4-digit Access PIN to Lab Orders

## Summary
Adds the same 4-digit access PIN system to `studio_lab_orders` that `bookings`
already has, giving lab orders full parity for client portal authentication.

## Changes
1. Add `access_pin` (text, NOT NULL, default '') to `studio_lab_orders`.
2. Add `pin_changed` (boolean, NOT NULL, default false) to `studio_lab_orders`.
3. Add `is_login_allowed` (boolean, NOT NULL, default false) to `studio_lab_orders`.
4. Backfill `access_pin` with the last 4 digits of `studio_mobile` for all
   existing rows where `access_pin` is empty.

## Security
- No RLS policy changes needed — `studio_lab_orders` already has RLS enabled
  with anon/authenticated policies from the original schema.
- The `access_pin` column stores a 4-digit numeric string for simplified
  portal authentication, matching the `bookings` table pattern.

## Important Notes
1. The `access_pin` defaults to the last 4 digits of `studio_mobile`.
2. When a new lab order is created, the application sets `access_pin` to the
   last 4 digits of `studio_mobile`.
3. The admin panel can reset the PIN to default at any time.
*/

ALTER TABLE studio_lab_orders
  ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false;

UPDATE studio_lab_orders
SET access_pin = RIGHT(regexp_replace(studio_mobile, '\D', '', 'g'), 4),
    pin_changed = false
WHERE access_pin = '';
