-- ============================================================================
-- RPC: save_product_modifiers
-- Fecha: 2026-06-29
-- Objetivo: permitir que el rol Cajero (además de Administrador) pueda guardar
--           modificadores (etiquetas, carpetas, productos-modificadores y
--           exclusiones) desde el tab "Ajustes" del ProductOptionsModal.
--
-- Contexto del problema
-- ---------------------------------------------------------------------------
-- La RLS de `categories` y `products` permite ESCRITURA solo a administradores:
--     USING (business_id = get_user_business_id() AND is_admin())
--     is_admin() = (profiles.role = 'Administrador')
-- Por eso, cuando un Cajero guardaba carpetas/etiquetas, el UPDATE directo
-- afectaba 0 filas EN SILENCIO (RLS no lanza error en UPDATE sin filas) y el
-- cambio "no se reflejaba", aunque el frontend mostrara "Configuración guardada".
--
-- Solución (mínimo privilegio)
-- ---------------------------------------------------------------------------
-- Función SECURITY DEFINER que corre con privilegios del owner pero VALIDA
-- negocio y rol antes de escribir, y solo toca columnas de modificadores.
-- La RLS de las tablas SIGUE siendo admin-only: el Cajero NO obtiene escritura
-- directa amplia, solo esta vía controlada.
--
-- Frontend: `handleProductUpdate` en App.tsx llama a esta RPC en vez de hacer
-- los UPDATE directos a products/categories.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_product_modifiers(
  p_product_id uuid,
  p_has_customization boolean,
  p_ingredients jsonb,
  p_excluded_options jsonb,
  p_category_id uuid DEFAULT NULL::uuid,
  p_customizable_options jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid;
  v_role text;
  v_product_business uuid;
  v_category_business uuid;
begin
  -- Negocio y rol del usuario autenticado
  select business_id, role into v_business_id, v_role
  from profiles where id = auth.uid();

  if v_business_id is null then
    raise exception 'No autorizado: usuario sin negocio asignado';
  end if;

  -- Solo Administrador o Cajero pueden editar modificadores
  if v_role not in ('Administrador','Cajero') then
    raise exception 'No autorizado: el rol % no puede editar modificadores', v_role;
  end if;

  -- El producto debe pertenecer al negocio del usuario
  select business_id into v_product_business from products where id = p_product_id;
  if v_product_business is null or v_product_business <> v_business_id then
    raise exception 'No autorizado: el producto no pertenece a tu negocio';
  end if;

  -- Actualiza SOLO columnas de modificadores del producto
  update products
     set has_customization = coalesce(p_has_customization, has_customization),
         ingredients       = coalesce(p_ingredients, ingredients),
         excluded_options  = coalesce(p_excluded_options, excluded_options),
         updated_at        = now()
   where id = p_product_id;

  -- Opcional: opciones a nivel de categoria (carpetas/etiquetas)
  if p_category_id is not null and p_customizable_options is not null then
    select business_id into v_category_business from categories where id = p_category_id;
    if v_category_business is null or v_category_business <> v_business_id then
      raise exception 'No autorizado: la categoria no pertenece a tu negocio';
    end if;

    update categories
       set customizable_options = p_customizable_options,
           updated_at           = now()
     where id = p_category_id;

    -- Si quedaron opciones, activa has_customization en todos los productos de la categoria
    if jsonb_array_length(p_customizable_options) > 0 then
      update products
         set has_customization = true
       where category_id = p_category_id
         and business_id  = v_business_id;
    end if;
  end if;
end;
$function$;

-- Permitir ejecutar a usuarios autenticados (la propia función valida rol/negocio)
GRANT EXECUTE ON FUNCTION public.save_product_modifiers(uuid, boolean, jsonb, jsonb, uuid, jsonb) TO authenticated;
