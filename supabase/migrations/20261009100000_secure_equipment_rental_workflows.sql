-- Make rental, equipment item, payment and refund workflows atomic and replay-safe.

ALTER TABLE public.equipment_rentals
  ADD COLUMN IF NOT EXISTS create_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS equipment_rentals_create_request_id_unique
  ON public.equipment_rentals (create_request_id)
  WHERE create_request_id IS NOT NULL;

ALTER TABLE public.equipment_rental_payments
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS flow_direction text;

UPDATE public.equipment_rental_payments payment
SET flow_direction = CASE WHEN rental.direction = 'Rented Out' THEN 'IN' ELSE 'OUT' END
FROM public.equipment_rentals rental
WHERE rental.id = payment.rental_id AND payment.flow_direction IS NULL;

UPDATE public.equipment_rental_payments
SET request_id = gen_random_uuid()
WHERE request_id IS NULL;

ALTER TABLE public.equipment_rental_payments
  ALTER COLUMN request_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN request_id SET NOT NULL,
  ALTER COLUMN flow_direction SET NOT NULL,
  ALTER COLUMN flow_direction DROP DEFAULT;

ALTER TABLE public.equipment_rental_payments
  DROP CONSTRAINT IF EXISTS equipment_rental_payments_flow_direction_check;
ALTER TABLE public.equipment_rental_payments
  ADD CONSTRAINT equipment_rental_payments_flow_direction_check
  CHECK (flow_direction IN ('IN', 'OUT'));

CREATE UNIQUE INDEX IF NOT EXISTS equipment_rental_payments_request_id_unique
  ON public.equipment_rental_payments (request_id);

CREATE OR REPLACE FUNCTION public.set_equipment_rental_payment_direction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rental_direction text;
BEGIN
  IF NEW.flow_direction IS NOT NULL THEN RETURN NEW; END IF;
  SELECT direction INTO v_rental_direction FROM public.equipment_rentals WHERE id = NEW.rental_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment rental not found for payment.'; END IF;
  NEW.flow_direction := CASE WHEN v_rental_direction = 'Rented Out' THEN 'IN' ELSE 'OUT' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_equipment_rental_payment_direction ON public.equipment_rental_payments;
CREATE TRIGGER trg_set_equipment_rental_payment_direction
  BEFORE INSERT ON public.equipment_rental_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_equipment_rental_payment_direction();

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
    'ERP-' || left(md5(v_source_id), 12), 'Equipment Rental', NEW.flow_direction,
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

CREATE OR REPLACE FUNCTION public.create_equipment_rental_with_items(
  p_request_id uuid,
  p_rental jsonb,
  p_items jsonb,
  p_advance_amount numeric DEFAULT 0,
  p_advance_payment_mode text DEFAULT 'Cash',
  p_advance_payment_date date DEFAULT NULL,
  p_advance_payment_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_rental_id uuid;
  v_direction text;
  v_rent numeric;
  v_quantity integer;
BEGIN
  IF NOT public.studio_is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Rental request ID is required.'; END IF;

  SELECT id INTO v_existing_id FROM public.equipment_rentals WHERE create_request_id = p_request_id;
  IF FOUND THEN RETURN v_existing_id; END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'At least one equipment item is required.';
  END IF;
  v_direction := p_rental->>'direction';
  v_rent := (p_rental->>'total_rent')::numeric;
  IF p_advance_amount < 0 OR p_advance_amount > v_rent THEN
    RAISE EXCEPTION 'Advance must be between zero and total rent.';
  END IF;
  IF p_advance_amount > 0 AND p_advance_payment_request_id IS NULL THEN
    RAISE EXCEPTION 'Advance payment request ID is required.';
  END IF;
  SELECT COALESCE(sum((item->>'quantity')::integer), 0) INTO v_quantity
  FROM jsonb_array_elements(p_items) AS item;

  INSERT INTO public.equipment_rentals (
    create_request_id, direction, item_name, category, quantity,
    counterparty_name, counterparty_mobile, counterparty_type,
    rental_date, expected_return_date, delivered_at, actual_return_date,
    total_rent, status, note, created_at, updated_at
  ) VALUES (
    p_request_id, v_direction, p_rental->>'item_name', p_rental->>'category', v_quantity,
    p_rental->>'counterparty_name', COALESCE(p_rental->>'counterparty_mobile', ''), 'Other',
    (p_rental->>'rental_date')::date, (p_rental->>'expected_return_date')::date,
    NULL, NULL, v_rent, 'Not Delivered', COALESCE(p_rental->>'note', ''), now(), now()
  ) RETURNING id INTO v_rental_id;

  INSERT INTO public.equipment_rental_items (rental_id, item_name, category, quantity)
  SELECT v_rental_id, item->>'item_name', COALESCE(item->>'category', 'Other'), (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) AS item;

  IF p_advance_amount > 0 THEN
    IF p_advance_payment_mode NOT IN ('Cash', 'UPI') THEN RAISE EXCEPTION 'Unsupported payment mode.'; END IF;
    INSERT INTO public.equipment_rental_payments (
      rental_id, request_id, amount, flow_direction, payment_date, payment_mode, note, created_at
    ) VALUES (
      v_rental_id, p_advance_payment_request_id, p_advance_amount,
      CASE WHEN v_direction = 'Rented Out' THEN 'IN' ELSE 'OUT' END,
      COALESCE(p_advance_payment_date, (p_rental->>'rental_date')::date),
      p_advance_payment_mode, 'Advance', now()
    );
  END IF;
  RETURN v_rental_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_equipment_rental_with_items(
  p_rental_id uuid,
  p_rental jsonb,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rental public.equipment_rentals%ROWTYPE;
  v_paid numeric;
  v_quantity integer;
BEGIN
  IF NOT public.studio_is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  SELECT * INTO v_rental FROM public.equipment_rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment rental not found.'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'At least one equipment item is required.';
  END IF;
  IF (p_rental->>'direction') IS DISTINCT FROM v_rental.direction
     AND EXISTS (SELECT 1 FROM public.equipment_rental_payments WHERE rental_id = p_rental_id) THEN
    RAISE EXCEPTION 'Rental direction cannot be changed after a payment is recorded.';
  END IF;

  SELECT COALESCE(sum(CASE
    WHEN payment.flow_direction = CASE WHEN v_rental.direction = 'Rented Out' THEN 'IN' ELSE 'OUT' END THEN payment.amount
    ELSE -payment.amount
  END), 0) INTO v_paid
  FROM public.equipment_rental_payments payment WHERE payment.rental_id = p_rental_id;
  IF (p_rental->>'total_rent')::numeric < GREATEST(0, v_paid) THEN
    RAISE EXCEPTION 'Total rent cannot be less than the net amount already paid.';
  END IF;
  SELECT COALESCE(sum((item->>'quantity')::integer), 0) INTO v_quantity
  FROM jsonb_array_elements(p_items) AS item;

  UPDATE public.equipment_rentals SET
    direction = p_rental->>'direction', item_name = p_rental->>'item_name',
    category = p_rental->>'category', quantity = v_quantity,
    counterparty_name = p_rental->>'counterparty_name',
    counterparty_mobile = COALESCE(p_rental->>'counterparty_mobile', ''),
    counterparty_type = 'Other', rental_date = (p_rental->>'rental_date')::date,
    expected_return_date = (p_rental->>'expected_return_date')::date,
    total_rent = (p_rental->>'total_rent')::numeric,
    note = COALESCE(p_rental->>'note', ''), updated_at = now()
  WHERE id = p_rental_id;

  DELETE FROM public.equipment_rental_items WHERE rental_id = p_rental_id;
  INSERT INTO public.equipment_rental_items (rental_id, item_name, category, quantity)
  SELECT p_rental_id, item->>'item_name', COALESCE(item->>'category', 'Other'), (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) AS item;

  -- Re-run the idempotent payment mirror so corrections to the contact flow
  -- through to Payments and Dairy Book without creating another installment.
  UPDATE public.equipment_rental_payments SET note = note WHERE rental_id = p_rental_id;
  RETURN p_rental_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_equipment_rental_payment(
  p_rental_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_mode text,
  p_note text,
  p_flow_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rental public.equipment_rentals%ROWTYPE;
  v_existing_id uuid;
  v_existing_rental_id uuid;
  v_expected_direction text;
  v_net_paid numeric;
  v_remaining numeric;
  v_refund boolean;
BEGIN
  IF NOT public.studio_is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero.'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Payment request ID is required.'; END IF;
  IF p_payment_mode NOT IN ('Cash', 'UPI') THEN RAISE EXCEPTION 'Unsupported payment mode.'; END IF;
  IF p_flow_direction NOT IN ('IN', 'OUT') THEN RAISE EXCEPTION 'Invalid payment direction.'; END IF;

  SELECT * INTO v_rental FROM public.equipment_rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment rental not found.'; END IF;
  SELECT id, rental_id INTO v_existing_id, v_existing_rental_id
  FROM public.equipment_rental_payments WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing_rental_id <> p_rental_id THEN RAISE EXCEPTION 'Payment request ID is already used by another rental.'; END IF;
    RETURN jsonb_build_object('duplicate', true, 'payment_id', v_existing_id);
  END IF;

  v_expected_direction := CASE WHEN v_rental.direction = 'Rented Out' THEN 'IN' ELSE 'OUT' END;
  v_refund := p_flow_direction <> v_expected_direction;
  SELECT COALESCE(sum(CASE WHEN payment.flow_direction = v_expected_direction THEN payment.amount ELSE -payment.amount END), 0)
  INTO v_net_paid FROM public.equipment_rental_payments payment WHERE payment.rental_id = p_rental_id;

  IF v_refund THEN
    IF v_rental.status <> 'Cancelled' THEN RAISE EXCEPTION 'Refunds can only be recorded after the rental is cancelled.'; END IF;
    v_remaining := GREATEST(0, v_net_paid);
    IF p_amount > v_remaining THEN RAISE EXCEPTION 'Refund exceeds the refundable amount.'; END IF;
  ELSE
    IF v_rental.status = 'Cancelled' THEN RAISE EXCEPTION 'Cancelled rentals can only receive refund entries.'; END IF;
    v_remaining := GREATEST(0, v_rental.total_rent - v_net_paid);
    IF p_amount > v_remaining THEN RAISE EXCEPTION 'Payment exceeds the remaining rental balance.'; END IF;
  END IF;

  INSERT INTO public.equipment_rental_payments (
    rental_id, request_id, amount, flow_direction, payment_date, payment_mode, note, created_at
  ) VALUES (p_rental_id, p_request_id, p_amount, p_flow_direction, p_payment_date, p_payment_mode, COALESCE(p_note, ''), now())
  RETURNING id INTO v_existing_id;
  RETURN jsonb_build_object('duplicate', false, 'payment_id', v_existing_id, 'remaining', GREATEST(0, v_remaining - p_amount));
END;
$$;

REVOKE ALL ON FUNCTION public.create_equipment_rental_with_items(uuid, jsonb, jsonb, numeric, text, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_equipment_rental_with_items(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_equipment_rental_payment(uuid, uuid, numeric, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_equipment_rental_with_items(uuid, jsonb, jsonb, numeric, text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_equipment_rental_with_items(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_equipment_rental_payment(uuid, uuid, numeric, date, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
