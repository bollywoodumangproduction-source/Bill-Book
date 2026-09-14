-- Staff lifecycle, duty assignments, settlements, and admin PIN support.
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS master_pin text DEFAULT '';

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
ALTER TABLE partners ADD COLUMN IF NOT EXISTS leave_start date;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS leave_end date;

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

CREATE TABLE IF NOT EXISTS shoot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id),
  function_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  reporting_time text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE photographer_ledger ADD COLUMN IF NOT EXISTS petrol_allowance numeric DEFAULT 0;

ALTER TABLE studio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoot_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_partners" ON partners;
CREATE POLICY "anon_all_partners" ON partners FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_direct_transactions" ON direct_transactions;
CREATE POLICY "anon_all_direct_transactions" ON direct_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_shoot_assignments" ON shoot_assignments;
CREATE POLICY "anon_all_shoot_assignments" ON shoot_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
