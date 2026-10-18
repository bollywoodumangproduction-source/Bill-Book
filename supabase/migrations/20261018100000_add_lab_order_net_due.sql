-- Keep the lab-order remaining balance available to payment screens and sync
-- it with billing changes so payment history and due screens stay consistent.
ALTER TABLE public.studio_lab_orders
  ADD COLUMN IF NOT EXISTS net_due numeric NOT NULL DEFAULT 0;

UPDATE public.studio_lab_orders
SET net_due = CASE
  WHEN COALESCE(billing_version, 1) >= 2 THEN GREATEST(
    0,
    COALESCE(current_order_total, 0)
      + COALESCE(previous_back_due, 0)
      + COALESCE(tax_amount, 0)
      - COALESCE(discount_amount, 0)
      - COALESCE(advance_paid, 0)
      - COALESCE(balance_transferred_out, 0)
  )
  ELSE GREATEST(
    0,
    COALESCE(master_total, 0)
      - COALESCE(advance_paid, 0)
      - COALESCE(balance_transferred_out, 0)
  )
END;

CREATE OR REPLACE FUNCTION public.sync_lab_order_net_due()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.net_due := CASE
    WHEN COALESCE(NEW.billing_version, 1) >= 2 THEN GREATEST(
      0,
      COALESCE(NEW.current_order_total, 0)
        + COALESCE(NEW.previous_back_due, 0)
        + COALESCE(NEW.tax_amount, 0)
        - COALESCE(NEW.discount_amount, 0)
        - COALESCE(NEW.advance_paid, 0)
        - COALESCE(NEW.balance_transferred_out, 0)
    )
    ELSE GREATEST(
      0,
      COALESCE(NEW.master_total, 0)
        - COALESCE(NEW.advance_paid, 0)
        - COALESCE(NEW.balance_transferred_out, 0)
    )
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lab_order_net_due ON public.studio_lab_orders;
CREATE TRIGGER trg_sync_lab_order_net_due
  BEFORE INSERT OR UPDATE ON public.studio_lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_lab_order_net_due();
