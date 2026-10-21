-- Trigger BEFORE DELETE en businesses para limpiar auth users en todos los escenarios:
-- frontend (delete_business_account RPC), dashboard de Supabase, o SQL directo.
CREATE OR REPLACE FUNCTION cleanup_auth_users_before_business_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  business_user_ids UUID[];
BEGIN
  SELECT array_agg(id) INTO business_user_ids
  FROM profiles
  WHERE business_id = OLD.id;

  IF business_user_ids IS NOT NULL THEN
    -- Nullificar FKs NO ACTION en promo_codes para no bloquear el delete de auth.users
    UPDATE promo_codes SET redeemed_by = NULL WHERE redeemed_by = ANY(business_user_ids);
    UPDATE promo_codes SET created_by = NULL WHERE created_by = ANY(business_user_ids);

    -- Borrar auth users: CASCADE elimina identities, sessions, mfa_factors y profiles
    DELETE FROM auth.users WHERE id = ANY(business_user_ids);
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER before_business_delete_cleanup_auth
BEFORE DELETE ON businesses
FOR EACH ROW
EXECUTE FUNCTION cleanup_auth_users_before_business_delete();
