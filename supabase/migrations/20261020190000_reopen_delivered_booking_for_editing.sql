-- Allow an administrator to reopen a delivered Booking for media re-editing.
-- The previous delivery receipt(s) and completion date are retained in JSONB history.
-- This only changes Booking RPC behavior; Lab Orders and Photo Selection/R2 are untouched.
CREATE OR REPLACE FUNCTION public.update_booking_media_work_status(
  p_booking_id uuid,
  p_work_type text,
  p_status text,
  p_expected_deliverables jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_data jsonb;
  v_progress jsonb;
  v_item jsonb;
  v_album_status text;
  v_video_status text;
  v_next_status text;
  v_receipts jsonb;
  v_archived_receipts jsonb;
  v_final_delivered_at jsonb;
  v_history jsonb;
BEGIN
  IF NOT public.studio_is_admin() THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_booking_id IS NULL OR p_work_type IS NULL OR p_work_type NOT IN ('album', 'video')
     OR p_status IS NULL OR p_status NOT IN ('pending', 'editing_in_progress', 'ready_for_delivery')
     OR jsonb_typeof(COALESCE(p_expected_deliverables, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid Booking media status.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.deleted_at IS NOT NULL OR v_booking.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Restore this Booking before changing work status.' USING ERRCODE = '22023';
  END IF;
  IF v_booking.work_status = 'delivered' AND p_status <> 'editing_in_progress' THEN
    RAISE EXCEPTION 'A delivered Booking can only be reopened for editing.' USING ERRCODE = '22023';
  END IF;

  v_data := COALESCE(v_booking.deliverables_data, '{}'::jsonb);
  IF COALESCE(v_data->'album_rows', '[]'::jsonb) IS DISTINCT FROM COALESCE(p_expected_deliverables->'album_rows', '[]'::jsonb)
     OR COALESCE(v_data->'video_rows', '[]'::jsonb) IS DISTINCT FROM COALESCE(p_expected_deliverables->'video_rows', '[]'::jsonb)
     OR COALESCE(v_data->'custom_items', '[]'::jsonb) IS DISTINCT FROM COALESCE(p_expected_deliverables->'custom_items', '[]'::jsonb)
     OR COALESCE(v_data->'raw_video', 'false'::jsonb) IS DISTINCT FROM COALESCE(p_expected_deliverables->'raw_video', 'false'::jsonb)
     OR COALESCE(v_data->'raw_selected_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(p_expected_deliverables->'raw_selected_photos', 'false'::jsonb)
     OR COALESCE(v_data->'raw_all_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(p_expected_deliverables->'raw_all_photos', 'false'::jsonb)
     OR COALESCE(v_data->'raw_edited_photos', 'false'::jsonb) IS DISTINCT FROM COALESCE(p_expected_deliverables->'raw_edited_photos', 'false'::jsonb) THEN
    RAISE EXCEPTION 'Booking deliverables changed. Refresh and review the Booking.' USING ERRCODE = '40001';
  END IF;
  IF (p_work_type = 'album' AND CASE WHEN jsonb_typeof(v_data->'album_rows') = 'array' THEN jsonb_array_length(v_data->'album_rows') ELSE 0 END = 0)
     OR (p_work_type = 'video' AND CASE WHEN jsonb_typeof(v_data->'video_rows') = 'array' THEN jsonb_array_length(v_data->'video_rows') ELSE 0 END = 0 AND COALESCE(v_data->'raw_video', 'false'::jsonb) <> 'true'::jsonb) THEN
    RAISE EXCEPTION 'This Booking has no matching media work.' USING ERRCODE = '22023';
  END IF;

  -- Keep each media type's previous receipt and the old final date before resetting it.
  IF p_status = 'editing_in_progress' THEN
    v_receipts := COALESCE(v_data->'delivery_receipts', '[]'::jsonb);
    SELECT COALESCE(jsonb_agg(r.receipt), '[]'::jsonb) INTO v_archived_receipts
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_receipts) = 'array' THEN v_receipts ELSE '[]'::jsonb END) AS r(receipt)
    WHERE CASE p_work_type
      WHEN 'album' THEN r.receipt->>'item' ILIKE 'Album:%'
      ELSE r.receipt->>'item' ILIKE 'Video:%' OR r.receipt->>'item' ILIKE 'Raw Video'
    END;
    IF jsonb_array_length(v_archived_receipts) > 0 OR v_data ? 'final_delivered_at' THEN
      v_history := COALESCE(v_data->'delivery_history', '[]'::jsonb);
      IF jsonb_typeof(v_history) <> 'array' THEN v_history := '[]'::jsonb; END IF;
      v_final_delivered_at := v_data->'final_delivered_at';
      v_history := v_history || jsonb_build_array(jsonb_build_object(
        'reopened_at', now(),
        'work_type', p_work_type,
        'final_delivered_at', v_final_delivered_at,
        'receipts', v_archived_receipts
      ));
      v_data := jsonb_set(v_data, '{delivery_history}', v_history, true);
    END IF;
  END IF;

  v_progress := COALESCE(v_data->'work_progress', '{}'::jsonb);
  v_item := jsonb_build_object('status', p_status, 'updated_at', now());
  v_progress := jsonb_set(v_progress, ARRAY[p_work_type], v_item, true);
  v_album_status := COALESCE(v_progress->'album'->>'status', CASE WHEN v_booking.work_status IN ('ready_for_delivery','delivered','album_design_ready','both_data_ready') THEN 'ready_for_delivery' WHEN v_booking.work_status = 'editing_in_progress' THEN 'editing_in_progress' ELSE 'pending' END);
  v_video_status := COALESCE(v_progress->'video'->>'status', CASE WHEN v_booking.work_status IN ('ready_for_delivery','delivered','video_complete','both_data_ready') THEN 'ready_for_delivery' WHEN v_booking.work_status = 'editing_in_progress' THEN 'editing_in_progress' ELSE 'pending' END);
  IF (CASE WHEN jsonb_typeof(v_data->'album_rows') = 'array' THEN jsonb_array_length(v_data->'album_rows') ELSE 0 END) = 0 THEN v_album_status := 'ready_for_delivery'; END IF;
  IF (CASE WHEN jsonb_typeof(v_data->'video_rows') = 'array' THEN jsonb_array_length(v_data->'video_rows') ELSE 0 END) = 0 AND COALESCE(v_data->'raw_video', 'false'::jsonb) <> 'true'::jsonb THEN v_video_status := 'ready_for_delivery'; END IF;

  IF v_album_status = 'ready_for_delivery' AND v_video_status = 'ready_for_delivery' THEN
    v_next_status := 'ready_for_delivery';
  ELSIF v_album_status = 'editing_in_progress' OR v_video_status = 'editing_in_progress' THEN
    v_next_status := 'editing_in_progress';
  ELSE
    v_next_status := COALESCE(v_booking.work_status, 'pending');
    IF v_next_status IN ('editing_in_progress','album_design_ready','video_complete','both_data_ready','ready_for_delivery','delivered') THEN v_next_status := 'pending'; END IF;
  END IF;

  v_data := jsonb_set(v_data, '{work_progress}', v_progress, true);
  IF p_status <> 'ready_for_delivery' THEN
    v_receipts := COALESCE(v_data->'delivery_receipts', '[]'::jsonb);
    SELECT COALESCE(jsonb_agg(r.receipt), '[]'::jsonb) INTO v_receipts
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_receipts) = 'array' THEN v_receipts ELSE '[]'::jsonb END) AS r(receipt)
    WHERE CASE p_work_type WHEN 'album' THEN r.receipt->>'item' NOT ILIKE 'Album:%' ELSE r.receipt->>'item' NOT ILIKE 'Video:%' AND r.receipt->>'item' NOT ILIKE 'Raw Video' END;
    v_data := jsonb_set(v_data, '{delivery_receipts}', v_receipts, true) - 'final_delivered_at';
  END IF;
  UPDATE public.bookings SET deliverables_data = v_data, work_status = v_next_status WHERE id = p_booking_id RETURNING * INTO v_booking;
  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$$;

REVOKE ALL ON FUNCTION public.update_booking_media_work_status(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_booking_media_work_status(uuid, text, text, jsonb) TO authenticated;
