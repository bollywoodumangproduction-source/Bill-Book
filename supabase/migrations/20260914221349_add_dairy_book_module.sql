/*
# Dairy Book Module

## Overview
Creates a comprehensive daily cash-flow ledger ("Dairy Book") for the studio.
Tracks automatic entries synced from Bookings (B2C Cash In) and Lab Orders (B2B Cash Out),
plus manual extra expenses and income entries. Includes opening balance tracking.

## New Tables

### 1. dairy_book_entries
Unified ledger for all cash flow entries — both automatic (from bookings/lab orders) and manual.
- entry_type: 'B2C_CASH_IN' (booking payments), 'B2B_CASH_OUT' (lab/vendor payments), 'MANUAL_EXPENSE', 'MANUAL_INCOME'
- source_table: which table the entry was auto-synced from ('bookings', 'studio_lab_orders', or null for manual)
- source_id: the ID of the originating booking/lab order (null for manual entries)
- party_name: client name (for B2C) or vendor name (for B2B) or description (for manual)
- source_ref: booking_no or order_no for auto entries
- amount: the transaction amount
- category: expense category tag for manual entries (e.g. 'Fuel', 'Tea/Snacks', 'Helper Wage', 'Studio Maintenance')
- payment_mode: 'Cash', 'UPI', 'Bank'
- note: free-text description
- entry_date: the date of the transaction (for filtering by day/month/year)
- is_auto: true for auto-synced entries, false for manual entries

### 2. dairy_book_opening_balance
Single-row table tracking the daily opening balance with a lock toggle.
- opening_amount: the opening balance amount
- is_locked: whether the opening balance is locked (true) or editable (false)
- effective_date: the date this opening balance applies from
- updated_at: last modification timestamp

## Security
- RLS enabled on both tables.
- Single-tenant no-auth app: all policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`.
- 4 policies per table (SELECT, INSERT, UPDATE, DELETE).

## Triggers
- `sync_booking_payment_to_dairy`: AFTER INSERT on `payments` where source = 'Booking' — auto-creates a B2C_CASH_IN entry.
- `sync_lab_payment_to_dairy`: AFTER INSERT on `payments` where source = 'Lab Order' — auto-creates a B2B_CASH_OUT entry.

## Notes
1. The app has no sign-in screen, so anon-key access is required for all operations.
2. Auto-sync hooks fire when a payment record is inserted (which is how the Bill Book and Lab Order modules record payments).
3. Manual entries are inserted directly by the Dairy Book UI.
4. Opening balance is a single-row table enforced by CHECK constraint.
*/

-- ============================================================
-- 1. DAIRY BOOK ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS dairy_book_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type text NOT NULL CHECK (entry_type IN ('B2C_CASH_IN', 'B2B_CASH_OUT', 'MANUAL_EXPENSE', 'MANUAL_INCOME')),
  is_auto boolean DEFAULT false,
  source_table text DEFAULT NULL,
  source_id text DEFAULT NULL,
  source_ref text DEFAULT NULL,
  party_name text DEFAULT '',
  amount numeric DEFAULT 0,
  category text DEFAULT '',
  payment_mode text DEFAULT 'Cash',
  note text DEFAULT '',
  entry_date text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dairy_entries_date ON dairy_book_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_dairy_entries_type ON dairy_book_entries (entry_type);
CREATE INDEX IF NOT EXISTS idx_dairy_entries_category ON dairy_book_entries (category);

-- ============================================================
-- 2. DAIRY BOOK OPENING BALANCE (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS dairy_book_opening_balance (
  id int PRIMARY KEY DEFAULT 1,
  opening_amount numeric DEFAULT 0,
  is_locked boolean DEFAULT false,
  effective_date text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row_dairy CHECK (id = 1)
);

INSERT INTO dairy_book_opening_balance (id, opening_amount, is_locked, effective_date)
VALUES (1, 0, false, '')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- dairy_book_entries
ALTER TABLE dairy_book_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_dairy_entries" ON dairy_book_entries;
CREATE POLICY "anon_select_dairy_entries" ON dairy_book_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dairy_entries" ON dairy_book_entries;
CREATE POLICY "anon_insert_dairy_entries" ON dairy_book_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dairy_entries" ON dairy_book_entries;
CREATE POLICY "anon_update_dairy_entries" ON dairy_book_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dairy_entries" ON dairy_book_entries;
CREATE POLICY "anon_delete_dairy_entries" ON dairy_book_entries FOR DELETE
  TO anon, authenticated USING (true);

-- dairy_book_opening_balance
ALTER TABLE dairy_book_opening_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_dairy_opening" ON dairy_book_opening_balance;
CREATE POLICY "anon_select_dairy_opening" ON dairy_book_opening_balance FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dairy_opening" ON dairy_book_opening_balance;
CREATE POLICY "anon_insert_dairy_opening" ON dairy_book_opening_balance FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dairy_opening" ON dairy_book_opening_balance;
CREATE POLICY "anon_update_dairy_opening" ON dairy_book_opening_balance FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dairy_opening" ON dairy_book_opening_balance;
CREATE POLICY "anon_delete_dairy_opening" ON dairy_book_opening_balance FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- TRIGGERS: Auto-sync from payments table
-- ============================================================

-- Function: sync booking payment to dairy book as B2C_CASH_IN
CREATE OR REPLACE FUNCTION sync_booking_payment_to_dairy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'Booking' AND NEW.deleted_at IS NULL THEN
    INSERT INTO dairy_book_entries (
      entry_type, is_auto, source_table, source_id, source_ref,
      party_name, amount, payment_mode, note, entry_date
    )
    VALUES (
      'B2C_CASH_IN', true, 'bookings', NULL, NEW.note,
      NEW.party_name, NEW.amount, NEW.mode, COALESCE(NEW.note, ''), NEW.date
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: sync lab order payment to dairy book as B2B_CASH_OUT
CREATE OR REPLACE FUNCTION sync_lab_payment_to_dairy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'Lab Order' AND NEW.deleted_at IS NULL THEN
    INSERT INTO dairy_book_entries (
      entry_type, is_auto, source_table, source_id, source_ref,
      party_name, amount, payment_mode, note, entry_date
    )
    VALUES (
      'B2B_CASH_OUT', true, 'studio_lab_orders', NULL, NEW.note,
      NEW.party_name, NEW.amount, NEW.mode, COALESCE(NEW.note, ''), NEW.date
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_booking_payment_dairy ON payments;
CREATE TRIGGER trg_sync_booking_payment_dairy
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_booking_payment_to_dairy();

DROP TRIGGER IF EXISTS trg_sync_lab_payment_dairy ON payments;
CREATE TRIGGER trg_sync_lab_payment_dairy
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_lab_payment_to_dairy();
