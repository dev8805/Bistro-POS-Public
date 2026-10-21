ALTER TABLE public.inventory_lots
ADD COLUMN IF NOT EXISTS product_name text;
