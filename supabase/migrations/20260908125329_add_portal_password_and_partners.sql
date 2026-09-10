/*
# Add Client Portal Login Fields + Partner Portal with Password Management

This migration adds all missing portal login and partner management
infrastructure in one pass.

## 1. Client Portal Login Fields on `bookings`
- `client_password` (text, NOT NULL, default '') — password for client
  portal login; defaults to the client's mobile number.
- `password_changed` (boolean, NOT NULL, default false) — tracks whether
  the password has been changed from the default.
- `is_login_allowed` (boolean, NOT NULL, default false) — controls
  whether the client is permitted to log into the portal.
- Backfill: existing rows get `client_password = client_mobile`,
  `is_login_allowed = false`.

## 2. Partners Table (Staff/Crew Portal)
- `partners` table with columns: id, name, mobile (unique), studio_name,
  studio_address, category, status, leave_start, leave_end, note,
  trashed_at, created_at, updated_at.
- Portal password columns: `portal_password` (text, default ''),
  `password_changed` (boolean, default false),
  `is_login_allowed` (boolean, default false).
- Backfill: `portal_password = mobile` for any existing rows.

## 3. Direct Transactions Table
- Records money given to / received from partners.
- `partner_id` references `partners(id)` with cascade delete.

## 4. Shoot Assignments Table
- Links partners to bookings with function name, role, reporting time.
- `booking_id` references `bookings(id)` with cascade delete.
- `partner_id` references `partners(id)`.

## 5. Photographer Ledger Extensions
- Adds `payment_mode`, `payment_date`, `petrol_allowance` columns.

## 6. Studio Settings Extension
- Adds `master_pin` column for admin PIN protection.

## 7. Security (RLS)
- Enables RLS on all new tables.
- All tables use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because this is a single-admin app (no Supabase Auth sign-in) where the
  anon key client needs full CRUD access.
*/

-- 1. Client portal login fields on bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_password text NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  UPDATE bookings SET client_password = client_mobile WHERE client_password = '';
END $$;

-- 2. Partners table
CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text NOT NULL UNIQUE,
  studio_name text DEFAULT '',
  studio_address text DEFAULT '',
  category text NOT NULL DEFAULT 'Photographer Freelancer',
  status text NOT NULL DEFAULT 'Active',
  leave_start date,
  leave_end date,
  note text DEFAULT '',
  trashed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE partners ADD COLUMN IF NOT EXISTS portal_password text NOT NULL DEFAULT '';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS is_login_allowed boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  UPDATE partners SET portal_password = mobile WHERE portal_password = '';
END $$;

-- 3. Direct transactions table
CREATE TABLE IF NOT EXISTS direct_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  partner_mobile text NOT NULL,
  txn_type text NOT NULL CHECK (txn_type IN ('Given', 'Received')),
  amount numeric NOT NULL DEFAULT 0,
  payment_mode text DEFAULT 'Cash',
  txn_date date DEFAULT CURRENT_DATE,
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 4. Shoot assignments table
CREATE TABLE IF NOT EXISTS shoot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id),
  function_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  reporting_time text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 5. Photographer ledger extensions
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS petrol_allowance numeric DEFAULT 0;

-- 6. Studio settings master PIN
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS master_pin text DEFAULT '';

-- 7. Enable RLS on new tables
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoot_assignments ENABLE ROW LEVEL SECURITY;

-- Partners policies (anon + authenticated — single-admin app)
DROP POLICY IF EXISTS "anon_all_partners" ON partners;
CREATE POLICY "anon_all_partners" ON partners FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Direct transactions policies
DROP POLICY IF EXISTS "anon_all_direct_transactions" ON direct_transactions;
CREATE POLICY "anon_all_direct_transactions" ON direct_transactions FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Shoot assignments policies
DROP POLICY IF EXISTS "anon_all_shoot_assignments" ON shoot_assignments;
CREATE POLICY "anon_all_shoot_assignments" ON shoot_assignments FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);
