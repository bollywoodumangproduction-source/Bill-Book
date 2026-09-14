/*
# Upgrade Lab Work Order: Multi-Client, Partner Sync, Payment Engine

1. Overview
This migration upgrades the `studio_lab_orders` table to support:
- Partner profile auto-sync from the Ledger (partner_id, partner_name, studio_address).
- Multiple end-cllients per lab order (clients JSONB array), each with its own video & album repeaters.
- Master billing engine: total_album_bill, total_video_bill, current_order_total, master_total, advance_paid, net_final_due.
- Payment section: payment_mode, payment_date, payment_note.
- Backward-compatible: keeps existing video_rows/album_rows columns for legacy reads.

2. studio_lab_orders — new columns
- partner_id (uuid, nullable) — links to partners table
- partner_name (text) — synced partner name
- studio_address (text) — synced studio address
- clients (jsonb) — array of LabClientRow objects (multi-client repeaters)
- total_album_bill (numeric) — sum of all client album totals
- total_video_bill (numeric) — sum of all client video totals
- current_order_total (numeric) — total_album_bill + total_video_bill
- master_total (numeric) — current_order_total + previous_back_due
- advance_paid (numeric) — replaces advance_received (kept for compat)
- net_final_due (numeric) — master_total - advance_paid
- payment_mode (text) — Cash, UPI, Bank Transfer, etc.
- payment_date (text) — payment date
- payment_note (text) — transaction ID / UTR / payer name / note

3. studio_settings — new column
- whatsapp_number (text) — studio WhatsApp number for global sync

4. Security
- No new tables; RLS already enabled on both tables.
- No policy changes needed — existing anon/authenticated policies cover new columns.
*/

-- studio_lab_orders new columns
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS partner_id uuid;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS partner_name text DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS studio_address text DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS clients jsonb DEFAULT '[]'::jsonb;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS total_album_bill numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS total_video_bill numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS current_order_total numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS master_total numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS advance_paid numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS net_final_due numeric DEFAULT 0;
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_date text DEFAULT '';
ALTER TABLE studio_lab_orders ADD COLUMN IF NOT EXISTS payment_note text DEFAULT '';

-- studio_settings new column
ALTER TABLE studio_settings ADD COLUMN IF NOT EXISTS whatsapp_number text DEFAULT '+91 9122441332';
