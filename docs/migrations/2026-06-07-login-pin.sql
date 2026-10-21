-- Login por teléfono + PIN de 4 dígitos — 2026-06-07
-- Aplicado en producción vía MCP (apply_migration / execute_sql).
-- Ver docs/historial_planes/2026-06-07-login-registro-pin.md
--
-- ⚠️ DESACTUALIZADO (2026-06-09): la nota manual de abajo ya no aplica. Supabase
-- dejó de permitir "Minimum password length" menor a 6, así que el PIN de 4 dígitos
-- ya NO se fija/cambia con la política de Auth, sino escribiendo el hash directo en
-- auth.users. Ver docs/migrations/2026-06-09-change-pin.sql.
--
-- NOTA MANUAL (no es SQL): en el Dashboard de Supabase
--   Authentication → Policies → Minimum password length = 4
-- Necesario para fijar/cambiar PIN de 4 dígitos desde la app.

-- 1) Helper: deja solo los dígitos de un teléfono
CREATE OR REPLACE FUNCTION public._phone_digits(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- 2) ¿Existe una cuenta con este teléfono?
--    Match flexible: dígitos iguales o últimos 10 dígitos iguales
--    (los teléfonos están guardados en formatos mixtos: +57…, 57…, local 10 dígitos).
CREATE OR REPLACE FUNCTION public.user_exists_by_phone(p_phone text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    LEFT JOIN public.profiles pr ON pr.id = u.id
    WHERE public._phone_digits(p_phone) <> ''
      AND (
        public._phone_digits(u.phone)  = public._phone_digits(p_phone)
        OR public._phone_digits(pr.phone) = public._phone_digits(p_phone)
        OR (
          length(public._phone_digits(p_phone)) >= 10
          AND (
            right(public._phone_digits(u.phone), 10)  = right(public._phone_digits(p_phone), 10)
            OR right(public._phone_digits(pr.phone), 10) = right(public._phone_digits(p_phone), 10)
          )
        )
      )
  );
$$;

-- 3) Correo de login (real o @bistro.temp) que corresponde a un teléfono,
--    para entrar por PIN con signInWithPassword antes de tener sesión.
CREATE OR REPLACE FUNCTION public.login_email_for_phone(p_phone text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.email
  FROM auth.users u
  LEFT JOIN public.profiles pr ON pr.id = u.id
  WHERE public._phone_digits(p_phone) <> ''
    AND (
      public._phone_digits(u.phone)  = public._phone_digits(p_phone)
      OR public._phone_digits(pr.phone) = public._phone_digits(p_phone)
      OR (
        length(public._phone_digits(p_phone)) >= 10
        AND (
          right(public._phone_digits(u.phone), 10)  = right(public._phone_digits(p_phone), 10)
          OR right(public._phone_digits(pr.phone), 10) = right(public._phone_digits(p_phone), 10)
        )
      )
    )
  ORDER BY (
    public._phone_digits(u.phone)  = public._phone_digits(p_phone)
    OR public._phone_digits(pr.phone) = public._phone_digits(p_phone)
  ) DESC
  LIMIT 1;
$$;

-- 4) Permisos (se llaman antes de tener sesión → anon)
REVOKE ALL ON FUNCTION public.user_exists_by_phone(text) FROM public;
REVOKE ALL ON FUNCTION public.login_email_for_phone(text) FROM public;
GRANT EXECUTE ON FUNCTION public.user_exists_by_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_for_phone(text) TO anon, authenticated;

-- 5) Reset de cuentas existentes al PIN por defecto 1234 (números ya verificados).
--    El UPDATE directo no pasa por la política de mínimo de la API.
UPDATE auth.users
SET encrypted_password = extensions.crypt('1234', extensions.gen_salt('bf'));
