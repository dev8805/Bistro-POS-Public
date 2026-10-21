-- Migración: 20260909_clean_product_from_modifiers_trigger.sql
-- Propósito: Cuando se elimine un producto de la tabla `products`, eliminar automáticamente
-- cualquier referencia a ese producto dentro de `customizable_options` en `categories` y `products`.
-- Esto previene modificadores huérfanos que violan la FK de `order_items` al vender.

CREATE OR REPLACE FUNCTION clean_deleted_product_from_modifiers()
RETURNS TRIGGER AS $$
DECLARE
  v_prod_id text := OLD.id::text;
BEGIN
  -- 1. Limpiar de categories.customizable_options
  UPDATE categories
  SET customizable_options = COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          -- Si es un objeto carpeta con "products", filtramos ese array interno
          WHEN jsonb_typeof(elem) = 'object' AND elem ? 'products' THEN
            jsonb_set(
              elem,
              '{products}',
              COALESCE(
                (
                  SELECT jsonb_agg(p)
                  FROM jsonb_array_elements(elem->'products') p
                  WHERE COALESCE(p->>'id', '') != v_prod_id
                ),
                '[]'::jsonb
              )
            )
          -- Cualquier otro elemento (texto, carpeta sin products, etc.) se preserva
          ELSE elem
        END
      )
      FROM jsonb_array_elements(customizable_options) elem
      -- Descartamos productos sueltos cuyo id coincide con el que se elimina
      WHERE COALESCE(elem->>'id', '') != v_prod_id
    ),
    '[]'::jsonb
  )
  WHERE business_id = OLD.business_id
    AND customizable_options::text LIKE '%' || v_prod_id || '%';

  -- 2. Limpiar de products.customizable_options (en caso de existir)
  UPDATE products
  SET customizable_options = COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'object' AND elem ? 'products' THEN
            jsonb_set(
              elem,
              '{products}',
              COALESCE(
                (
                  SELECT jsonb_agg(p)
                  FROM jsonb_array_elements(elem->'products') p
                  WHERE COALESCE(p->>'id', '') != v_prod_id
                ),
                '[]'::jsonb
              )
            )
          ELSE elem
        END
      )
      FROM jsonb_array_elements(customizable_options) elem
      WHERE COALESCE(elem->>'id', '') != v_prod_id
    ),
    '[]'::jsonb
  )
  WHERE business_id = OLD.business_id
    AND id != OLD.id
    AND customizable_options::text LIKE '%' || v_prod_id || '%';

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger BEFORE DELETE en products
DROP TRIGGER IF EXISTS trg_clean_deleted_product_from_modifiers ON products;
CREATE TRIGGER trg_clean_deleted_product_from_modifiers
BEFORE DELETE ON products
FOR EACH ROW
EXECUTE FUNCTION clean_deleted_product_from_modifiers();

-- Limpieza preventiva de huérfanos existentes (Cholao u otros)
UPDATE categories
SET customizable_options = COALESCE(
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(elem) = 'object' AND elem ? 'products' THEN
          jsonb_set(
            elem,
            '{products}',
            COALESCE(
              (
                SELECT jsonb_agg(p)
                FROM jsonb_array_elements(elem->'products') p
                WHERE COALESCE(p->>'id', '') != 'd9cdc66f-3da1-4ecb-a3aa-1b9a64c58713'
              ),
              '[]'::jsonb
            )
          )
        ELSE elem
      END
    )
    FROM jsonb_array_elements(customizable_options) elem
    WHERE COALESCE(elem->>'id', '') != 'd9cdc66f-3da1-4ecb-a3aa-1b9a64c58713'
  ),
  '[]'::jsonb
)
WHERE customizable_options::text LIKE '%d9cdc66f-3da1-4ecb-a3aa-1b9a64c58713%';
