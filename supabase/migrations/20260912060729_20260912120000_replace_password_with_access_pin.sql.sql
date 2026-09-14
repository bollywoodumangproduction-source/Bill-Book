/*
# Replace client_password with 4-digit access_pin

## Summary
This migration replaces the old password-based client portal authentication
with a 4-digit PIN system. The `client_password` column is renamed to
`access_pin`, and all existing values are backfilled to the last 4 digits of
the client's mobile number. The `password_changed` column is renamed to
`pin_changed`.

## Changes
1. Rename `bookings.client_password` → `bookings.access_pin` (text, NOT NULL, default '')
2. Rename `bookings.password_changed` → `bookings.pin_changed` (boolean, NOT NULL, default false)
3. Backfill `access_pin` with the last 4 digits of `client_mobile` for all
   existing rows where `access_pin` is empty or still looks like a full
   phone number (length > 4).
4. Set `pin_changed = false` for all backfilled rows.

## Security
- No RLS policy changes. Existing policies on `bookings` remain unchanged.
- The `access_pin` column stores a 4-digit numeric string, not a hashed
  password — this is intentional for the client portal's simplified PIN
  authentication flow.

## Important Notes
1. The `access_pin` defaults to the last 4 digits of `client_mobile`.
2. When a new booking is created, the application sets `access_pin` to the
   last 4 digits of the client's mobile number.
3. The "Reset to Default PIN" button in the admin panel sets `access_pin`
   back to the last 4 digits of `client_mobile` and `pin_changed` to false.
*/

-- Step 1: Add new columns if they don't exist (idempotent)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS access_pin text NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pin_changed boolean NOT NULL DEFAULT false;

-- Step 2: Copy data from old columns to new columns
UPDATE bookings
SET access_pin = client_password,
    pin_changed = password_changed
WHERE access_pin = '' AND client_password IS NOT NULL;

-- Step 3: Backfill access_pin with last 4 digits of client_mobile
-- This handles: empty access_pin, or access_pin that is still a full phone number (length > 4)
UPDATE bookings
SET access_pin = RIGHT(regexp_replace(client_mobile, '\D', '', 'g'), 4),
    pin_changed = false
WHERE access_pin = ''
   OR length(access_pin) > 4;

-- Step 4: Drop old columns
ALTER TABLE bookings DROP COLUMN IF EXISTS client_password;
ALTER TABLE bookings DROP COLUMN IF EXISTS password_changed;