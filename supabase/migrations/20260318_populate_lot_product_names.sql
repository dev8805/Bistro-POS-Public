-- Create or replace the function to copy the product name
CREATE OR REPLACE FUNCTION public.fn_set_lot_product_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT name INTO NEW.product_name
    FROM public.products
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS tr_set_lot_product_name ON public.inventory_lots;

-- Create the trigger
CREATE TRIGGER tr_set_lot_product_name
BEFORE INSERT OR UPDATE OF product_id ON public.inventory_lots
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_lot_product_name();

-- Update existing records
UPDATE public.inventory_lots il
SET product_name = p.name
FROM public.products p
WHERE il.product_id = p.id;
