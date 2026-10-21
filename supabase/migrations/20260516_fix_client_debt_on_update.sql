-- Fix: update_client_debt ahora maneja UPDATE en client_transactions
-- Problema: sync_order_total_to_payments hace UPDATE en client_transactions.amount
-- cuando se edita un ítem de una venta a crédito, pero el trigger anterior
-- solo escuchaba INSERT y DELETE, por lo que clients.current_debt no se actualizaba.

CREATE OR REPLACE FUNCTION public.update_client_debt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'debt' THEN
      UPDATE public.clients
      SET current_debt = current_debt + NEW.amount, updated_at = now()
      WHERE id = NEW.client_id;
    ELSIF NEW.type = 'payment' THEN
      UPDATE public.clients
      SET current_debt = GREATEST(0, current_debt - NEW.amount), updated_at = now()
      WHERE id = NEW.client_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.type = 'debt' THEN
      UPDATE public.clients
      SET current_debt = GREATEST(0, current_debt - OLD.amount), updated_at = now()
      WHERE id = OLD.client_id;
    ELSIF OLD.type = 'payment' THEN
      UPDATE public.clients
      SET current_debt = current_debt + OLD.amount, updated_at = now()
      WHERE id = OLD.client_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' AND NEW.amount IS DISTINCT FROM OLD.amount THEN
    IF NEW.type = 'debt' THEN
      UPDATE public.clients
      SET current_debt = GREATEST(0, current_debt + (NEW.amount - OLD.amount)),
          updated_at = now()
      WHERE id = NEW.client_id;
    ELSIF NEW.type = 'payment' THEN
      UPDATE public.clients
      SET current_debt = GREATEST(0, current_debt - (NEW.amount - OLD.amount)),
          updated_at = now()
      WHERE id = NEW.client_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_client_transaction_change ON public.client_transactions;
CREATE TRIGGER on_client_transaction_change
  AFTER INSERT OR UPDATE OR DELETE ON public.client_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_client_debt();

-- Recalcular current_debt de todos los clientes desde cero
-- para corregir cualquier inconsistencia previa
UPDATE public.clients c
SET current_debt = GREATEST(0, (
  SELECT COALESCE(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END), 0)
  FROM public.client_transactions
  WHERE client_id = c.id
)),
updated_at = now();
