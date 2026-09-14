/*
# Add Settlement Fields to Photographer Ledger

## Overview
Adds `payment_mode` and `payment_date` columns to the `photographer_ledger` table
so that PAYMENT_SETTLED entries can record the payment method (Cash/UPI/Bank)
and the date the settlement was made, alongside the existing `description` (notes)
and `amount` fields.

## Changes
1. Modified Tables
   - `photographer_ledger`
     - `payment_mode` (text, default '') — Cash, UPI, or Bank for settlement entries
     - `payment_date` (text, default '') — date of the settlement payment

## Security
- No RLS policy changes needed — existing policies already allow full CRUD for anon+authenticated.

## Notes
1. These columns are optional (default '') so existing rows are unaffected.
2. The `description` column continues to serve as the notes field for all entry types.
3. `payment_mode` and `payment_date` are only populated for PAYMENT_SETTLED entries.
*/

ALTER TABLE photographer_ledger
  ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';

ALTER TABLE photographer_ledger
  ADD COLUMN IF NOT EXISTS payment_date text DEFAULT '';
