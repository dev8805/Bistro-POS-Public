-- =====================================================
-- DIAGNÓSTICO Y FIX PARA ERROR DE PERFIL
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. DIAGNÓSTICO: Verificar si el trigger existe
SELECT 
    t.tgname as trigger_name,
    t.tgenabled as enabled,
    p.proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'users' AND c.relnamespace = 'auth'::regnamespace;

-- 2. DIAGNÓSTICO: Verificar si la función existe
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'handle_new_user';

-- 3. DIAGNÓSTICO: Ver usuarios sin perfil
SELECT 
    au.id,
    au.email,
    au.created_at,
    p.id as profile_id
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- =====================================================
-- SI EL TRIGGER NO EXISTE, EJECUTAR ESTO:
-- =====================================================

-- Recrear la función handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_business_id uuid;
  user_role text;
  business_name text;
BEGIN
  -- Check if user is joining an existing business (via metadata)
  IF new.raw_user_meta_data->>'business_id' IS NOT NULL THEN
    -- Employee joining existing business
    new_business_id := (new.raw_user_meta_data->>'business_id')::uuid;
    user_role := COALESCE(new.raw_user_meta_data->>'role', 'Mesero');
  ELSE
    -- New business owner - create their business
    business_name := COALESCE(
      new.raw_user_meta_data->>'business_name',
      new.raw_user_meta_data->>'full_name' || '''s Business',
      'Mi Negocio'
    );
    
    INSERT INTO public.businesses (name, owner_id)
    VALUES (business_name, new.id)
    RETURNING id INTO new_business_id;
    
    user_role := 'Administrador';
  END IF;

  -- Create the user profile
  INSERT INTO public.profiles (id, full_name, phone, avatar_url, role, business_id)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'avatar_url',
    user_role,
    new_business_id
  );
  
  RETURN new;
END;
$$;

-- Recrear el trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- FIX MANUAL: Crear perfil para usuarios existentes sin perfil
-- =====================================================

-- Este bloque crea perfiles y negocios para usuarios que se registraron
-- pero no tienen perfil (porque el trigger falló)
DO $$
DECLARE
  user_record RECORD;
  new_business_id uuid;
  business_name text;
BEGIN
  FOR user_record IN 
    SELECT au.id, au.email, au.raw_user_meta_data, au.created_at
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    -- Create business for user
    business_name := COALESCE(
      user_record.raw_user_meta_data->>'business_name',
      user_record.raw_user_meta_data->>'full_name' || '''s Business',
      'Mi Negocio'
    );
    
    INSERT INTO public.businesses (name, owner_id, created_at)
    VALUES (business_name, user_record.id, user_record.created_at)
    RETURNING id INTO new_business_id;
    
    -- Create profile for user
    INSERT INTO public.profiles (id, full_name, phone, avatar_url, role, business_id, created_at)
    VALUES (
      user_record.id,
      user_record.raw_user_meta_data->>'full_name',
      user_record.raw_user_meta_data->>'phone',
      user_record.raw_user_meta_data->>'avatar_url',
      'Administrador',
      new_business_id,
      user_record.created_at
    );
    
    RAISE NOTICE 'Created profile for user: %', user_record.email;
  END LOOP;
END $$;

-- Verificar que ahora todos los usuarios tienen perfil
SELECT 
    au.id,
    au.email,
    p.full_name,
    p.role,
    b.name as business_name
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
LEFT JOIN public.businesses b ON b.id = p.business_id
ORDER BY au.created_at DESC;
