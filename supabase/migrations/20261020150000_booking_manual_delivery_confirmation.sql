-- Keep a booking in Ready for Delivery while the user records each received item.
-- The explicit Delivered action then stamps the delivery date and files it by year.
CREATE OR REPLACE FUNCTION public.mark_booking_delivery_received(
  p_booking_id uuid,
  p_item_key text,
  p_item text,
  p_all_item_keys text[],
  p_expected_deliverables jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_deliverables jsonb;
  v_expected jsonb;
  v_receipts jsonb;
  v_next_deliverables jsonb;
  v_received_at timestamptz := now();
  v_duplicate boolean;
  v_is_final boolean;
BEGIN
  IF NOT public.studio_is_admin() THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;

  IF p_booking_id IS NULL
     OR NULLIF(btrim(p_item_key), '') IS NULL
     OR NULLIF(btrim(p_item), '') IS NULL
     OR p_all_item_keys IS NULL
     OR cardinality(p_all_item_keys) = 0
     OR cardinality(p_all_item_keys) > 500
     OR NOT (p_item_key = ANY(p_all_item_keys))
     OR (SELECT count(DISTINCT keys.item_key) FROM unnest(p_all_item_keys) AS keys(item_key)) <> cardinality(p_all_item_keys)
     OR jsonb_typeof(COALESCE(p_expected_deliverables, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid Booking delivery item.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Restore this Booking before recording a delivery.' USING ERRCODE = '22023';
  END IF;

  v_deliverables := COALESCE(v_booking.deliverables_data, '{}'::jsonb);
  v_expected := COALESCE(p_expected_deliverables, '{}'::jsonb);

  IF COALESCE(v_deliverables->'album_rows', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'album_rows', '[]'::jsonb)
     OR COALESCE(v_deliverables->'video_rows', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'video_rows', '[]'::jsonb)
     OR COALESCE(v_deliverables->'custom_items', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'custom_items', '[]'::jsonb)
     OR COALESCE(v_deliverables->'raw_video', 'false'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'raw_video', 'false'::jsonb)
     OR COALESCE(v_deliverables->'raw_selected_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'raw_selected_photos', 'false'::jsonb)
     OR COALESCE(v_deliverables->'raw_all_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'raw_all_photos', 'false'::jsonb)
     OR COALESCE(v_deliverables->'raw_edited_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'raw_edited_photos', 'false'::jsonb) THEN
    RAISE EXCEPTION 'Booking deliverables changed. Refresh the Booking and review its delivery items.' USING ERRCODE = '40001';
  END IF;

  v_receipts := COALESCE(v_deliverables->'delivery_receipts', '[]'::jsonb);
  IF jsonb_typeof(v_receipts) <> 'array' THEN
    v_receipts := '[]'::jsonb;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_receipts) AS r(receipt)
    WHERE r.receipt->>'item_key' = p_item_key
  ) INTO v_duplicate;

  IF COALESCE(v_booking.work_status, 'pending') <> 'ready_for_delivery'
     AND NOT (v_booking.work_status = 'delivered' AND v_duplicate) THEN
    RAISE EXCEPTION 'Set the Booking to Ready for Delivery before recording receipts.' USING ERRCODE = '22023';
  END IF;
  IF v_booking.work_status = 'delivered' AND NOT v_duplicate THEN
    RAISE EXCEPTION 'This Booking is already Delivered.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_duplicate THEN
    v_receipts := v_receipts || jsonb_build_array(jsonb_build_object(
      'item_key', p_item_key,
      'item', p_item,
      'received_at', v_received_at
    ));
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM unnest(p_all_item_keys) AS keys(expected_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_receipts) AS r(receipt)
      WHERE r.receipt->>'item_key' = keys.expected_key
    )
  ) INTO v_is_final;

  v_next_deliverables := jsonb_set(v_deliverables, '{delivery_receipts}', v_receipts, true);
  IF v_booking.work_status <> 'delivered' THEN
    v_next_deliverables := v_next_deliverables - 'final_delivered_at';
  END IF;

  -- Receiving every item does not finalize the Booking. The user must click Delivered.
  UPDATE public.bookings
  SET deliverables_data = v_next_deliverables
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object(
    'booking', to_jsonb(v_booking),
    'duplicate', v_duplicate,
    'is_final_delivery', v_is_final
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_booking_delivery_received(uuid, text, text, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_booking_delivery_received(uuid, text, text, text[], jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_booking_delivery(
  p_booking_id uuid,
  p_all_item_keys text[],
  p_expected_deliverables jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_deliverables jsonb;
  v_expected jsonb;
  v_receipts jsonb;
  v_now timestamptz := now();
  v_has_unreceived boolean;
BEGIN
  IF NOT public.studio_is_admin() THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;

  IF p_booking_id IS NULL
     OR p_all_item_keys IS NULL
     OR cardinality(p_all_item_keys) = 0
     OR cardinality(p_all_item_keys) > 500
     OR (SELECT count(DISTINCT keys.item_key) FROM unnest(p_all_item_keys) AS keys(item_key)) <> cardinality(p_all_item_keys)
     OR jsonb_typeof(COALESCE(p_expected_deliverables, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid Booking delivery confirmation.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Restore this Booking before confirming delivery.' USING ERRCODE = '22023';
  END IF;

  v_deliverables := COALESCE(v_booking.deliverables_data, '{}'::jsonb);
  v_expected := COALESCE(p_expected_deliverables, '{}'::jsonb);
  IF COALESCE(v_deliverables->'album_rows', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'album_rows', '[]'::jsonb)
     OR COALESCE(v_deliverables->'video_rows', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'video_rows', '[]'::jsonb)
     OR COALESCE(v_deliverables->'custom_items', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'custom_items', '[]'::jsonb)
     OR COALESCE(v_deliverables->'raw_video', 'false'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'raw_video', 'false'::jsonb)
     OR COALESCE(v_deliverables->'raw_selected_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'raw_selected_photos', 'false'::jsonb)
     OR COALESCE(v_deliverables->'raw_all_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'raw_all_photos', 'false'::jsonb)
     OR COALESCE(v_deliverables->'raw_edited_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(v_expected->'raw_edited_photos', 'false'::jsonb) THEN
    RAISE EXCEPTION 'Booking deliverables changed. Refresh the Booking and review its delivery items.' USING ERRCODE = '40001';
  END IF;

  IF v_booking.work_status = 'delivered' THEN
    RETURN jsonb_build_object('booking', to_jsonb(v_booking), 'duplicate', true);
  END IF;
  IF v_booking.work_status <> 'ready_for_delivery' THEN
    RAISE EXCEPTION 'Set the Booking to Ready for Delivery before confirming it.' USING ERRCODE = '22023';
  END IF;

  v_receipts := COALESCE(v_deliverables->'delivery_receipts', '[]'::jsonb);
  IF jsonb_typeof(v_receipts) <> 'array' THEN
    v_receipts := '[]'::jsonb;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM unnest(p_all_item_keys) AS keys(expected_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_receipts) AS r(receipt)
      WHERE r.receipt->>'item_key' = keys.expected_key
    )
  ) INTO v_has_unreceived;
  IF v_has_unreceived THEN
    RAISE EXCEPTION 'Mark every deliverable as received before confirming delivery.' USING ERRCODE = '22023';
  END IF;

  v_deliverables := jsonb_set(v_deliverables, '{final_delivered_at}', to_jsonb(v_now), true);
  UPDATE public.bookings
  SET work_status = 'delivered', deliverables_data = v_deliverables
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking), 'duplicate', false);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_booking_delivery(uuid, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_booking_delivery(uuid, text[], jsonb) TO authenticated;
