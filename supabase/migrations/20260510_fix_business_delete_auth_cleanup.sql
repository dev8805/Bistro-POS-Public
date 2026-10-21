-- Fix: reemplaza el trigger BEFORE (que causaba doble-cascade) con dos triggers.
-- El BEFORE captura IDs mientras profiles aún existen; el AFTER borra auth users
-- cuando el CASCADE ya terminó, evitando el error:
-- "tuple to be deleted was already modified by an operation triggered by the current command"

DROP TRIGGER IF EXISTS before_business_delete_cleanup_auth ON businesses;
DROP FUNCTION IF EXISTS cleanup_auth_users_before_business_delete();

-- BEFORE: captura IDs de auth users via session config (local a la transacción)
CREATE OR REPLACE FUNCTION capture_business_user_ids_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_ids_str TEXT;
BEGIN
  SELECT string_agg(id::text, ',') INTO user_ids_str
  FROM profiles WHERE business_id = OLD.id;

  PERFORM set_config('bistro.cleanup_user_ids', COALESCE(user_ids_str, ''), true);
  RETURN OLD;
END;
$$;

CREATE TRIGGER before_business_delete_capture_ids
BEFORE DELETE ON businesses
FOR EACH ROW
EXECUTE FUNCTION capture_business_user_ids_before_delete();

-- AFTER: borra auth users con los IDs capturados, nullifica FKs NO ACTION primero
CREATE OR REPLACE FUNCTION delete_auth_users_after_business_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_ids_str TEXT;
  user_ids UUID[];
BEGIN
  user_ids_str := current_setting('bistro.cleanup_user_ids', true);

  IF user_ids_str IS NULL OR user_ids_str = '' THEN
    RETURN OLD;
  END IF;

  SELECT array_agg(val::uuid) INTO user_ids
  FROM unnest(string_to_array(user_ids_str, ',')) val;

  IF user_ids IS NOT NULL THEN
    UPDATE promo_codes SET redeemed_by = NULL WHERE redeemed_by = ANY(user_ids);
    UPDATE promo_codes SET created_by = NULL WHERE created_by = ANY(user_ids);
    DELETE FROM auth.users WHERE id = ANY(user_ids);
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER after_business_delete_cleanup_auth
AFTER DELETE ON businesses
FOR EACH ROW
EXECUTE FUNCTION delete_auth_users_after_business_delete();
