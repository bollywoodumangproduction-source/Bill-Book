-- Standardize the booking function label while preserving all other event data.
UPDATE public.bookings
SET event_function = 'Wedding'
WHERE lower(btrim(event_function)) IN ('wedding/barat', 'wedding/baraat');

UPDATE public.bookings AS booking
SET events = (
  SELECT jsonb_agg(
    CASE
      WHEN lower(btrim(coalesce(event_item.value ->> 'name', ''))) IN ('wedding/barat', 'wedding/baraat')
        THEN jsonb_set(event_item.value, '{name}', to_jsonb('Wedding'::text), true)
      ELSE event_item.value
    END
    ORDER BY event_item.ordinality
  )
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(booking.events) = 'array' THEN booking.events ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS event_item(value, ordinality)
)
WHERE jsonb_typeof(booking.events) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(booking.events) = 'array' THEN booking.events ELSE '[]'::jsonb END
    ) AS event_item(value)
    WHERE lower(btrim(coalesce(event_item.value ->> 'name', ''))) IN ('wedding/barat', 'wedding/baraat')
  );
