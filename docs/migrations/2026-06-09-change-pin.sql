-- Cambio de PIN desde el perfil — 2026-06-09
-- Aplicado en producción vía MCP (apply_migration: add_set_user_pin_function).
-- Ver docs/caracteristicas/perfil_usuario.md (sección "Cambiar PIN") y autenticacion_acceso.md
--
-- CONTEXTO:
-- Supabase Auth dejó de permitir contraseñas de menos de 6 caracteres: ni
-- `supabase.auth.updateUser({ password })` (cliente) ni `auth.admin.updateUserById`
-- aceptan un PIN de 4 dígitos (responden 422 weak_password / "Password should be
-- at least 6 characters"), y el mínimo ya no se puede bajar a 4 en el Dashboard.
--
-- SOLUCIÓN:
-- Escribir el hash bcrypt del PIN directo en auth.users.encrypted_password, igual
-- que el reset masivo a '1234'. Lo hace este RPC SECURITY DEFINER, invocado solo
-- por la edge function `change-pin` (verify_jwt) con service_role, pasándole el
-- user.id derivado del JWT del propio usuario.

CREATE OR REPLACE FUNCTION public._set_user_pin(target_user_id uuid, new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new_pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_pin, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

-- Solo service_role (la edge function) puede ejecutarlo; nunca desde el cliente.
REVOKE ALL ON FUNCTION public._set_user_pin(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public._set_user_pin(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public._set_user_pin(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._set_user_pin(uuid, text) TO service_role;
