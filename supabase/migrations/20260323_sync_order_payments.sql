CREATE OR REPLACE FUNCTION public.sync_order_total_to_payments()
RETURNS TRIGGER AS $$
DECLARE
  v_movement_count INTEGER;
BEGIN
  -- Only update if the order does not have split payments to be safe
  IF (NEW.split_payments IS NULL OR jsonb_typeof(NEW.split_payments) = 'null' OR jsonb_array_length(NEW.split_payments) = 0) AND NEW.total IS DISTINCT FROM OLD.total THEN
    
    -- Sync cash_movements
    SELECT COUNT(*) INTO v_movement_count
    FROM public.cash_movements
    WHERE reference_id = NEW.id AND reference_type = 'order' AND type = 'sale';
    
    IF v_movement_count = 1 THEN
      UPDATE public.cash_movements
      SET amount = NEW.total
      WHERE reference_id = NEW.id AND reference_type = 'order' AND type = 'sale'
        AND amount != NEW.total;
    END IF;

    -- Sync client_transactions
    SELECT COUNT(*) INTO v_movement_count
    FROM public.client_transactions
    WHERE order_id = NEW.id AND type = 'debt';

    IF v_movement_count = 1 THEN
      UPDATE public.client_transactions
      SET amount = NEW.total
      WHERE order_id = NEW.id AND type = 'debt'
        AND amount != NEW.total;
    END IF;

  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_order_total_update_sync_payments ON public.orders;
CREATE TRIGGER on_order_total_update_sync_payments
AFTER UPDATE OF total ON public.orders
FOR EACH ROW
WHEN (NEW.total IS DISTINCT FROM OLD.total)
EXECUTE FUNCTION public.sync_order_total_to_payments();
