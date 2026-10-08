-- Make Payments the single transaction log for booking and lab-order installments.
-- The source records keep their histories for balances and client portal views;
-- source_id makes their matching ledger rows idempotent.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'IN';

-- Billing v2 is opt-in per record. Existing records remain version 1 and are
-- read using their saved totals; tax defaults to zero for every legacy row.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS billing_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS billing_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_balance_source_order_id uuid,
  ADD COLUMN IF NOT EXISTS balance_transferred_out numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.lab_order_balance_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_order_id uuid NOT NULL REFERENCES public.studio_lab_orders(id),
  target_order_id uuid NOT NULL UNIQUE REFERENCES public.studio_lab_orders(id),
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lab_order_balance_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lab_order_balance_transfers FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.transfer_lab_order_balance(
  p_source_order_id uuid, p_target_order_id uuid, p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.studio_lab_orders%ROWTYPE;
  v_target public.studio_lab_orders%ROWTYPE;
  v_available numeric;
BEGIN
  IF COALESCE(auth.jwt()->'app_metadata'->>'role', '') <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_source_order_id = p_target_order_id THEN
    RAISE EXCEPTION 'Choose a valid previous order and balance amount.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.studio_lab_orders WHERE id IN (p_source_order_id, p_target_order_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_source FROM public.studio_lab_orders WHERE id = p_source_order_id;
  SELECT * INTO v_target FROM public.studio_lab_orders WHERE id = p_target_order_id;
  IF v_source.id IS NULL OR v_target.id IS NULL THEN RAISE EXCEPTION 'Source or target lab order not found.' USING ERRCODE = 'P0002'; END IF;
  IF (v_source.partner_id IS NOT NULL OR v_target.partner_id IS NOT NULL)
     AND v_source.partner_id IS DISTINCT FROM v_target.partner_id THEN
    RAISE EXCEPTION 'Previous balance can only be transferred between orders for the same partner.' USING ERRCODE = '22023';
  ELSIF v_source.partner_id IS NULL AND v_target.partner_id IS NULL
     AND lower(trim(COALESCE(NULLIF(v_source.partner_name, ''), v_source.studio_name, '')))
         IS DISTINCT FROM lower(trim(COALESCE(NULLIF(v_target.partner_name, ''), v_target.studio_name, ''))) THEN
    RAISE EXCEPTION 'Previous balance can only be transferred between orders for the same studio.' USING ERRCODE = '22023';
  END IF;
  IF v_target.previous_balance_source_order_id IS NOT NULL
     AND v_target.previous_balance_source_order_id <> p_source_order_id THEN
    RAISE EXCEPTION 'Target order is already linked to a different source order.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lab_order_balance_transfers WHERE target_order_id = p_target_order_id) THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;
  v_available := GREATEST(0, COALESCE(v_source.master_total, 0) - COALESCE(v_source.advance_paid, 0) - COALESCE(v_source.balance_transferred_out, 0));
  IF p_amount > v_available THEN RAISE EXCEPTION 'Transfer exceeds the source order balance (%).', v_available USING ERRCODE = '22023'; END IF;
  IF COALESCE(v_target.previous_back_due, 0) > 0 THEN RAISE EXCEPTION 'Target order already has a previous balance.' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.lab_order_balance_transfers(source_order_id, target_order_id, amount)
  VALUES (p_source_order_id, p_target_order_id, p_amount);
  UPDATE public.studio_lab_orders
    SET balance_transferred_out = COALESCE(balance_transferred_out, 0) + p_amount,
        net_final_due = GREATEST(0, COALESCE(master_total, 0) - COALESCE(advance_paid, 0) - COALESCE(balance_transferred_out, 0) - p_amount)
    WHERE id = p_source_order_id;
  UPDATE public.studio_lab_orders
    SET previous_balance_source_order_id = p_source_order_id,
        previous_back_due = p_amount,
        master_total = COALESCE(current_order_total, 0) + p_amount + COALESCE(tax_amount, 0) - COALESCE(discount_amount, 0),
        net_final_due = GREATEST(0, COALESCE(current_order_total, 0) + p_amount + COALESCE(tax_amount, 0) - COALESCE(discount_amount, 0) - COALESCE(advance_paid, 0))
    WHERE id = p_target_order_id;
  RETURN jsonb_build_object('duplicate', false, 'amount', p_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_lab_order_balance(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_lab_order_balance(uuid, uuid, numeric) TO authenticated;

-- net_due is generated in the existing schema. Recreate only its formula;
-- stored billing totals and payment histories are preserved.
ALTER TABLE public.bookings DROP COLUMN IF EXISTS net_due;
ALTER TABLE public.bookings ADD COLUMN net_due numeric GENERATED ALWAYS AS
  (GREATEST(0, total_amount + COALESCE(tax_amount, 0) - discount - advance_paid)) STORED;

UPDATE public.payments
SET direction = CASE WHEN source IN ('Photographer', 'Manual Expense') THEN 'OUT' ELSE 'IN' END
WHERE direction IS NULL OR direction NOT IN ('IN', 'OUT');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_direction_check' AND conrelid = 'public.payments'::regclass) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_direction_check CHECK (direction IN ('IN', 'OUT'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_source_id_unique
  ON public.payments (source_id);

CREATE OR REPLACE FUNCTION public.sync_booking_payment_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_history jsonb;
  v_item jsonb;
  v_item_id text;
  v_source_id text;
  v_source_ids text[] := ARRAY[]::text[];
  v_ordinal integer := 0;
  v_amount numeric;
BEGIN
  v_history := COALESCE(NEW.deliverables_data #> '{payment_details,payment_history}', '[]'::jsonb);
  IF jsonb_typeof(v_history) <> 'array' THEN
    v_history := '[]'::jsonb;
  END IF;

  -- Preserve a legacy booking advance that predates installment history.
  IF jsonb_array_length(v_history) = 0 AND COALESCE(NEW.advance_paid, 0) > 0 THEN
    v_history := jsonb_build_array(jsonb_build_object(
      'id', 'legacy-' || NEW.id::text,
      'payment_date', COALESCE(NEW.deliverables_data #>> '{payment_details,payment_date}', NEW.created_at::date::text),
      'payment_mode', COALESCE(NEW.deliverables_data #>> '{payment_details,payment_mode}', 'Cash'),
      'custom_note', COALESCE(NEW.deliverables_data #>> '{payment_details,custom_note}', 'Legacy booking payment'),
      'paid_amount', NEW.advance_paid::text
    ));
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_history) AS history(value)
  LOOP
    v_ordinal := v_ordinal + 1;
    v_item_id := COALESCE(NULLIF(v_item->>'id', ''), 'item-' || v_ordinal::text);
    v_source_id := 'booking:' || NEW.id::text || ':' || v_item_id;
    v_amount := COALESCE(NULLIF(v_item->>'paid_amount', '')::numeric, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_source_ids := array_append(v_source_ids, v_source_id);

    INSERT INTO public.payments (
      receipt_no, source, direction, party_name, party_mobile, mode, amount, date, note,
      created_at, source_id
    ) VALUES (
      'BKG-' || left(md5(v_source_id), 12),
      'Booking', 'IN', NEW.client_name, COALESCE(NEW.client_mobile, ''),
      COALESCE(NULLIF(v_item->>'payment_mode', ''), 'Cash'), v_amount,
      COALESCE(NULLIF(v_item->>'payment_date', ''), NEW.created_at::date::text),
      COALESCE(NULLIF(v_item->>'custom_note', ''), 'Booking ' || NEW.booking_no),
      COALESCE(NULLIF(v_item->>'created_at', '')::timestamptz, now()), v_source_id
    )
    ON CONFLICT (source_id) DO UPDATE SET
      source = EXCLUDED.source,
      direction = EXCLUDED.direction,
      party_name = EXCLUDED.party_name,
      party_mobile = EXCLUDED.party_mobile,
      mode = EXCLUDED.mode,
      amount = EXCLUDED.amount,
      date = EXCLUDED.date,
      note = EXCLUDED.note,
      deleted_at = NULL;
  END LOOP;

  UPDATE public.payments
  SET deleted_at = COALESCE(deleted_at, now())
  WHERE source_id LIKE 'booking:' || NEW.id::text || ':%'
    AND NOT (source_id = ANY(v_source_ids));

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lab_order_payment_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_history jsonb;
  v_item jsonb;
  v_item_id text;
  v_source_id text;
  v_source_ids text[] := ARRAY[]::text[];
  v_ordinal integer := 0;
  v_amount numeric;
BEGIN
  v_history := COALESCE(NEW.payment_history, '[]'::jsonb);
  IF jsonb_typeof(v_history) <> 'array' THEN
    v_history := '[]'::jsonb;
  END IF;

  -- Preserve an older lab-order advance if its installment history is empty.
  IF jsonb_array_length(v_history) = 0 AND COALESCE(NEW.advance_paid, 0) > 0 THEN
    v_history := jsonb_build_array(jsonb_build_object(
      'id', 'legacy-' || NEW.id::text,
      'payment_date', COALESCE(NULLIF(NEW.payment_date, ''), NEW.created_at::date::text),
      'payment_mode', COALESCE(NULLIF(NEW.payment_mode, ''), 'Cash'),
      'note', COALESCE(NULLIF(NEW.payment_note, ''), 'Legacy lab-order payment'),
      'amount', NEW.advance_paid
    ));
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_history) AS history(value)
  LOOP
    v_ordinal := v_ordinal + 1;
    v_item_id := COALESCE(NULLIF(v_item->>'id', ''), 'item-' || v_ordinal::text);
    v_source_id := 'lab-order:' || NEW.id::text || ':' || v_item_id;
    v_amount := COALESCE(NULLIF(v_item->>'amount', '')::numeric, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_source_ids := array_append(v_source_ids, v_source_id);

    INSERT INTO public.payments (
      receipt_no, source, direction, party_name, party_mobile, mode, amount, date, note,
      created_at, source_id
    ) VALUES (
      'LAB-' || left(md5(v_source_id), 12),
      'Lab Order', 'IN', COALESCE(NULLIF(NEW.project_name, ''), NEW.order_no), COALESCE(NEW.studio_mobile, ''),
      COALESCE(NULLIF(v_item->>'payment_mode', ''), NULLIF(NEW.payment_mode, ''), 'Cash'), v_amount,
      COALESCE(NULLIF(v_item->>'payment_date', ''), NULLIF(NEW.payment_date, ''), NEW.created_at::date::text),
      COALESCE(NULLIF(v_item->>'note', ''), 'Lab order ' || NEW.order_no),
      COALESCE(NULLIF(v_item->>'created_at', '')::timestamptz, now()), v_source_id
    )
    ON CONFLICT (source_id) DO UPDATE SET
      source = EXCLUDED.source,
      direction = EXCLUDED.direction,
      party_name = EXCLUDED.party_name,
      party_mobile = EXCLUDED.party_mobile,
      mode = EXCLUDED.mode,
      amount = EXCLUDED.amount,
      date = EXCLUDED.date,
      note = EXCLUDED.note,
      deleted_at = NULL;
  END LOOP;

  UPDATE public.payments
  SET deleted_at = COALESCE(deleted_at, now())
  WHERE source_id LIKE 'lab-order:' || NEW.id::text || ':%'
    AND NOT (source_id = ANY(v_source_ids));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_payment_ledger ON public.bookings;
CREATE TRIGGER trg_sync_booking_payment_ledger
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_payment_ledger();

DROP TRIGGER IF EXISTS trg_sync_lab_order_payment_ledger ON public.studio_lab_orders;
CREATE TRIGGER trg_sync_lab_order_payment_ledger
  AFTER INSERT OR UPDATE ON public.studio_lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_lab_order_payment_ledger();

-- Add explicit B2B receipts so incoming partner cash is not mislabelled as
-- customer booking income. Existing rows remain unchanged.
ALTER TABLE public.dairy_book_entries DROP CONSTRAINT IF EXISTS dairy_book_entries_entry_type_check;
ALTER TABLE public.dairy_book_entries ADD CONSTRAINT dairy_book_entries_entry_type_check
  CHECK (entry_type IN ('B2C_CASH_IN', 'B2B_CASH_IN', 'B2B_CASH_OUT', 'MANUAL_EXPENSE', 'MANUAL_INCOME'));
ALTER TABLE public.dairy_book_entries ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Keep the Dairy Book row linked to the same payment identity on retries.
CREATE UNIQUE INDEX IF NOT EXISTS dairy_book_auto_source_id_unique
  ON public.dairy_book_entries (source_id)
  WHERE is_auto = true AND source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_payment_to_dairy_entry(
  p_entry_type text, p_source_table text, p_source_id text, p_receipt text,
  p_party text, p_amount numeric, p_mode text, p_note text, p_date text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_id text := COALESCE(p_source_id, 'payment:' || p_receipt);
  v_existing_id uuid;
  v_matches integer;
BEGIN
  SELECT count(*), min(id::text)::uuid INTO v_matches, v_existing_id
  FROM public.dairy_book_entries
  WHERE is_auto = true AND source_id IS NULL
    AND entry_type = p_entry_type
    AND source_table = p_source_table
    AND party_name IS NOT DISTINCT FROM p_party
    AND amount IS NOT DISTINCT FROM p_amount
    AND payment_mode IS NOT DISTINCT FROM p_mode
    AND note IS NOT DISTINCT FROM p_note
    AND entry_date IS NOT DISTINCT FROM p_date;

  IF v_matches > 1 THEN
    RAISE EXCEPTION 'Multiple unlinked Dairy Book entries match payment receipt %; reconcile them before recording this payment.', p_receipt;
  ELSIF v_matches = 1 THEN
    UPDATE public.dairy_book_entries
    SET source_id = v_source_id, source_ref = p_receipt
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.dairy_book_entries (
      entry_type, is_auto, source_table, source_id, source_ref,
      party_name, amount, payment_mode, note, entry_date
    ) VALUES (
      p_entry_type, true, p_source_table, v_source_id, p_receipt,
      COALESCE(p_party, ''), p_amount, COALESCE(p_mode, 'Cash'), COALESCE(p_note, ''), p_date
    ) ON CONFLICT (source_id) WHERE is_auto = true AND source_id IS NOT NULL DO UPDATE SET
      source_ref = EXCLUDED.source_ref,
      party_name = EXCLUDED.party_name,
      amount = EXCLUDED.amount,
      payment_mode = EXCLUDED.payment_mode,
      note = EXCLUDED.note,
      entry_date = EXCLUDED.entry_date;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_booking_payment_to_dairy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source = 'Booking' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      UPDATE public.dairy_book_entries SET deleted_at = NEW.deleted_at
      WHERE is_auto = true AND source_id = COALESCE(NEW.source_id, 'payment:' || NEW.id::text);
    ELSE
      PERFORM public.sync_payment_to_dairy_entry(
        'B2C_CASH_IN', 'bookings', NEW.source_id, NEW.receipt_no,
        NEW.party_name, NEW.amount, NEW.mode, COALESCE(NEW.note, ''), NEW.date
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lab_payment_to_dairy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.source = 'Lab Order' AND NEW.direction = 'IN')
     OR (NEW.direction = 'OUT' AND NEW.source IN ('Photographer', 'Partner', 'Equipment Rental')) THEN
    IF NEW.deleted_at IS NOT NULL THEN
      UPDATE public.dairy_book_entries SET deleted_at = NEW.deleted_at
      WHERE is_auto = true AND source_id = COALESCE(NEW.source_id, 'payment:' || NEW.id::text);
    ELSE
      PERFORM public.sync_payment_to_dairy_entry(
        CASE WHEN NEW.direction = 'IN' THEN 'B2B_CASH_IN' ELSE 'B2B_CASH_OUT' END,
        CASE NEW.source WHEN 'Lab Order' THEN 'studio_lab_orders' WHEN 'Photographer' THEN 'photographer_ledger' WHEN 'Partner' THEN 'direct_transactions' ELSE 'equipment_rental_payments' END,
        NEW.source_id, NEW.receipt_no, NEW.party_name, NEW.amount, NEW.mode,
        COALESCE(NEW.note, ''), NEW.date
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_partner_income_to_dairy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.direction = 'IN' AND NEW.source IN ('Partner', 'Equipment Rental') THEN
    IF NEW.deleted_at IS NOT NULL THEN
      UPDATE public.dairy_book_entries SET deleted_at = NEW.deleted_at
      WHERE is_auto = true AND source_id = COALESCE(NEW.source_id, 'payment:' || NEW.id::text);
    ELSE
      PERFORM public.sync_payment_to_dairy_entry(
        'B2B_CASH_IN', CASE WHEN NEW.source = 'Partner' THEN 'direct_transactions' ELSE 'equipment_rental_payments' END,
        NEW.source_id, NEW.receipt_no, NEW.party_name, NEW.amount, NEW.mode,
        COALESCE(NEW.note, ''), NEW.date
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_payment_dairy ON public.payments;
CREATE TRIGGER trg_sync_booking_payment_dairy
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_payment_to_dairy();

DROP TRIGGER IF EXISTS trg_sync_lab_payment_dairy ON public.payments;
CREATE TRIGGER trg_sync_lab_payment_dairy
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_lab_payment_to_dairy();

DROP TRIGGER IF EXISTS trg_sync_partner_income_dairy ON public.payments;
CREATE TRIGGER trg_sync_partner_income_dairy
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_partner_income_to_dairy();

-- Keep each peripheral payment entry point linked to its one central payment.
CREATE OR REPLACE FUNCTION public.mirror_partner_settlement_to_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_id text := 'photographer-ledger:' || NEW.id::text;
BEGIN
  IF NEW.entry_type = 'PAYMENT_SETTLED'
     AND COALESCE(NEW.description, '') NOT LIKE 'Order #% payment via %' THEN
    INSERT INTO public.payments (
      receipt_no, source, direction, party_name, party_mobile, mode, amount, date, note, source_id
    ) VALUES (
      'PTR-' || left(md5(v_source_id), 12), 'Photographer', 'OUT',
      COALESCE(NEW.photographer_name, ''), COALESCE(NEW.mobile, ''),
      COALESCE(NULLIF(NEW.payment_mode, ''), 'Cash'), NEW.amount,
      COALESCE(NULLIF(NEW.payment_date::text, ''), NEW.created_at::date::text),
      COALESCE(NEW.description, ''), v_source_id
    ) ON CONFLICT (source_id) DO UPDATE SET
      direction = EXCLUDED.direction, party_name = EXCLUDED.party_name,
      party_mobile = EXCLUDED.party_mobile, mode = EXCLUDED.mode,
      amount = EXCLUDED.amount, date = EXCLUDED.date, note = EXCLUDED.note,
      deleted_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_partner_settlement_to_payments ON public.photographer_ledger;
CREATE TRIGGER trg_mirror_partner_settlement_to_payments
  AFTER INSERT OR UPDATE ON public.photographer_ledger
  FOR EACH ROW EXECUTE FUNCTION public.mirror_partner_settlement_to_payments();

CREATE OR REPLACE FUNCTION public.mirror_direct_transaction_to_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_id text := 'partner-direct:' || NEW.id::text;
BEGIN
  INSERT INTO public.payments (
    receipt_no, source, direction, party_name, party_mobile, mode, amount, date, note, source_id
  ) VALUES (
    'PTX-' || left(md5(v_source_id), 12), 'Partner',
    CASE WHEN NEW.txn_type = 'Given' THEN 'OUT' ELSE 'IN' END,
    NEW.partner_name, NEW.partner_mobile, COALESCE(NEW.payment_mode, 'Cash'),
    NEW.amount, COALESCE(NEW.txn_date::text, NEW.created_at::date::text), COALESCE(NEW.note, ''), v_source_id
  ) ON CONFLICT (source_id) DO UPDATE SET
    direction = EXCLUDED.direction, party_name = EXCLUDED.party_name,
    party_mobile = EXCLUDED.party_mobile, mode = EXCLUDED.mode,
    amount = EXCLUDED.amount, date = EXCLUDED.date, note = EXCLUDED.note,
    deleted_at = NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_direct_transaction_to_payments ON public.direct_transactions;
CREATE TRIGGER trg_mirror_direct_transaction_to_payments
  AFTER INSERT OR UPDATE ON public.direct_transactions
  FOR EACH ROW EXECUTE FUNCTION public.mirror_direct_transaction_to_payments();

CREATE OR REPLACE FUNCTION public.mirror_equipment_rental_payment_to_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rental public.equipment_rentals%ROWTYPE;
  v_source_id text := 'equipment-rental-payment:' || NEW.id::text;
BEGIN
  SELECT * INTO v_rental FROM public.equipment_rentals WHERE id = NEW.rental_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment rental not found for payment.'; END IF;
  INSERT INTO public.payments (
    receipt_no, source, direction, party_name, party_mobile, mode, amount, date, note, source_id
  ) VALUES (
    'ERP-' || left(md5(v_source_id), 12), 'Equipment Rental',
    CASE WHEN v_rental.direction = 'Rented Out' THEN 'IN' ELSE 'OUT' END,
    v_rental.counterparty_name, v_rental.counterparty_mobile, NEW.payment_mode,
    NEW.amount, NEW.payment_date::text, COALESCE(NEW.note, ''), v_source_id
  ) ON CONFLICT (source_id) DO UPDATE SET
    direction = EXCLUDED.direction, party_name = EXCLUDED.party_name,
    party_mobile = EXCLUDED.party_mobile, mode = EXCLUDED.mode,
    amount = EXCLUDED.amount, date = EXCLUDED.date, note = EXCLUDED.note,
    deleted_at = NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_equipment_rental_payment_to_payments ON public.equipment_rental_payments;
CREATE TRIGGER trg_mirror_equipment_rental_payment_to_payments
  AFTER INSERT OR UPDATE ON public.equipment_rental_payments
  FOR EACH ROW EXECUTE FUNCTION public.mirror_equipment_rental_payment_to_payments();

CREATE OR REPLACE FUNCTION public.mirror_manual_dairy_entry_to_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_id text := 'dairy-manual:' || NEW.id::text;
  v_source text;
  v_direction text;
BEGIN
  IF NEW.is_auto = false AND NEW.entry_type IN ('MANUAL_INCOME', 'MANUAL_EXPENSE') THEN
    v_source := CASE WHEN NEW.entry_type = 'MANUAL_INCOME' THEN 'Manual Income' ELSE 'Manual Expense' END;
    v_direction := CASE WHEN NEW.entry_type = 'MANUAL_INCOME' THEN 'IN' ELSE 'OUT' END;
    IF NEW.deleted_at IS NOT NULL THEN
      UPDATE public.payments SET deleted_at = NEW.deleted_at WHERE source_id = v_source_id;
      RETURN NEW;
    END IF;
    INSERT INTO public.payments (
      receipt_no, source, direction, party_name, party_mobile, mode, amount, date, note, source_id
    ) VALUES (
      'DME-' || left(md5(v_source_id), 12), v_source, v_direction,
      COALESCE(NEW.party_name, NEW.category, ''), '', COALESCE(NEW.payment_mode, 'Cash'),
      NEW.amount, NEW.entry_date, COALESCE(NEW.note, ''), v_source_id
    ) ON CONFLICT (source_id) DO UPDATE SET
      direction = EXCLUDED.direction, party_name = EXCLUDED.party_name,
      mode = EXCLUDED.mode, amount = EXCLUDED.amount,
      date = EXCLUDED.date, note = EXCLUDED.note, deleted_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_manual_dairy_entry_to_payments ON public.dairy_book_entries;
CREATE TRIGGER trg_mirror_manual_dairy_entry_to_payments
  AFTER INSERT OR UPDATE ON public.dairy_book_entries
  FOR EACH ROW EXECUTE FUNCTION public.mirror_manual_dairy_entry_to_payments();

-- Additive, repeat-safe backfill for installment histories already saved in the
-- booking and lab-order records. source_id prevents re-importing an installment.
UPDATE public.bookings
SET deliverables_data = deliverables_data
WHERE COALESCE(advance_paid, 0) > 0;

UPDATE public.studio_lab_orders
SET payment_history = payment_history
WHERE COALESCE(advance_paid, 0) > 0;

-- Backfill independent historical sources after every idempotent mirror trigger
-- exists; stable source IDs prevent duplicates on reruns.
UPDATE public.photographer_ledger SET description = description WHERE entry_type = 'PAYMENT_SETTLED';
UPDATE public.direct_transactions SET note = note;
UPDATE public.equipment_rental_payments SET note = note;
UPDATE public.dairy_book_entries SET note = note WHERE is_auto = false AND entry_type IN ('MANUAL_INCOME', 'MANUAL_EXPENSE');

CREATE OR REPLACE FUNCTION public.record_booking_payment(
  p_booking_id uuid,
  p_installment_id text,
  p_amount numeric,
  p_payment_date text,
  p_payment_mode text,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_history jsonb;
  v_details jsonb;
  v_deliverables jsonb;
  v_new_paid numeric;
  v_due numeric;
BEGIN
  IF COALESCE(auth.jwt()->'app_metadata'->>'role', '') <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR NULLIF(trim(p_installment_id), '') IS NULL THEN
    RAISE EXCEPTION 'Enter a valid payment amount.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002'; END IF;

  v_deliverables := COALESCE(v_booking.deliverables_data, '{}'::jsonb);
  v_details := COALESCE(v_deliverables->'payment_details', '{}'::jsonb);
  v_history := COALESCE(v_details->'payment_history', '[]'::jsonb);
  IF jsonb_typeof(v_history) <> 'array' THEN v_history := '[]'::jsonb; END IF;
  IF jsonb_array_length(v_history) = 0 AND COALESCE(v_booking.advance_paid, 0) > 0 THEN
    v_history := jsonb_build_array(jsonb_build_object(
      'id', 'legacy-' || v_booking.id::text,
      'payment_date', COALESCE(NULLIF(v_details->>'payment_date', ''), v_booking.created_at::date::text),
      'payment_mode', COALESCE(NULLIF(v_details->>'payment_mode', ''), 'Cash'),
      'custom_note', COALESCE(NULLIF(v_details->>'custom_note', ''), 'Legacy booking payment'),
      'paid_amount', v_booking.advance_paid::text
    ));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_history) AS history(value) WHERE value->>'id' = p_installment_id) THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  v_due := GREATEST(0, COALESCE(v_booking.total_amount, 0) + COALESCE(v_booking.tax_amount, 0) - COALESCE(v_booking.discount, 0) - COALESCE(v_booking.advance_paid, 0));
  IF p_amount > v_due THEN
    RAISE EXCEPTION 'Payment exceeds the remaining booking balance.' USING ERRCODE = '22023';
  END IF;

  v_new_paid := COALESCE(v_booking.advance_paid, 0) + p_amount;
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'id', p_installment_id,
    'payment_date', p_payment_date,
    'payment_mode', p_payment_mode,
    'custom_note', COALESCE(p_note, ''),
    'paid_amount', p_amount::text,
    'created_at', now()
  ));
  v_details := v_details || jsonb_build_object(
    'payment_mode', p_payment_mode,
    'payment_date', p_payment_date,
    'custom_note', COALESCE(p_note, ''),
    'paid_amount', v_new_paid::text,
    'payment_history', v_history
  );
  v_deliverables := v_deliverables || jsonb_build_object('payment_details', v_details);

  UPDATE public.bookings
  SET advance_paid = v_new_paid, deliverables_data = v_deliverables
  WHERE id = p_booking_id;
  RETURN jsonb_build_object('duplicate', false, 'advance_paid', v_new_paid, 'due', v_due - p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_lab_order_payment(
  p_order_id uuid,
  p_installment_id text,
  p_amount numeric,
  p_payment_date text,
  p_payment_mode text,
  p_note text DEFAULT '',
  p_client_id text DEFAULT NULL,
  p_client_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.studio_lab_orders%ROWTYPE;
  v_history jsonb;
  v_new_paid numeric;
  v_due numeric;
BEGIN
  IF COALESCE(auth.jwt()->'app_metadata'->>'role', '') <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR NULLIF(trim(p_installment_id), '') IS NULL THEN
    RAISE EXCEPTION 'Enter a valid payment amount.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.studio_lab_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lab order not found.' USING ERRCODE = 'P0002'; END IF;

  v_history := COALESCE(v_order.payment_history, '[]'::jsonb);
  IF jsonb_typeof(v_history) <> 'array' THEN v_history := '[]'::jsonb; END IF;
  IF jsonb_array_length(v_history) = 0 AND COALESCE(v_order.advance_paid, 0) > 0 THEN
    v_history := jsonb_build_array(jsonb_build_object(
      'id', 'legacy-' || v_order.id::text,
      'payment_date', COALESCE(NULLIF(v_order.payment_date, ''), v_order.created_at::date::text),
      'payment_mode', COALESCE(NULLIF(v_order.payment_mode, ''), 'Cash'),
      'note', COALESCE(NULLIF(v_order.payment_note, ''), 'Legacy lab-order payment'),
      'amount', v_order.advance_paid
    ));
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_history) AS history(value) WHERE value->>'id' = p_installment_id) THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  v_due := CASE WHEN COALESCE(v_order.billing_version, 1) >= 2
    THEN GREATEST(0, COALESCE(v_order.current_order_total, 0) + COALESCE(v_order.previous_back_due, 0) + COALESCE(v_order.tax_amount, 0) - COALESCE(v_order.discount_amount, 0) - COALESCE(v_order.advance_paid, 0) - COALESCE(v_order.balance_transferred_out, 0))
    ELSE GREATEST(0, COALESCE(v_order.master_total, 0) - COALESCE(v_order.advance_paid, 0) - COALESCE(v_order.balance_transferred_out, 0)) END;
  IF p_amount > v_due THEN
    RAISE EXCEPTION 'Payment exceeds the remaining lab-order balance.' USING ERRCODE = '22023';
  END IF;

  v_new_paid := COALESCE(v_order.advance_paid, 0) + p_amount;
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'id', p_installment_id,
    'amount', p_amount,
    'payment_date', p_payment_date,
    'payment_mode', p_payment_mode,
    'note', COALESCE(p_note, ''),
    'client_id', NULLIF(p_client_id, ''),
    'client_name', NULLIF(p_client_name, ''),
    'created_at', now()
  ));

  UPDATE public.studio_lab_orders
  SET advance_paid = v_new_paid,
      net_due = CASE WHEN COALESCE(v_order.billing_version, 1) >= 2
        THEN GREATEST(0, COALESCE(v_order.current_order_total, 0) - v_new_paid)
        ELSE GREATEST(0, COALESCE(v_order.current_order_total, v_order.master_total) - v_new_paid) END,
      net_final_due = v_due - p_amount,
      payment_mode = p_payment_mode,
      payment_date = p_payment_date,
      payment_note = COALESCE(p_note, ''),
      payment_history = v_history
  WHERE id = p_order_id;
  RETURN jsonb_build_object('duplicate', false, 'advance_paid', v_new_paid, 'due', v_due - p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.record_booking_payment(uuid, text, numeric, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_lab_order_payment(uuid, text, numeric, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_booking_payment(uuid, text, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_lab_order_payment(uuid, text, numeric, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
