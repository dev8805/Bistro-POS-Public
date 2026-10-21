-- Add-ons en mesas/delivery: vínculo padre-hijo entre líneas de order_items.
-- Columna nullable (las filas existentes quedan como líneas normales) + cascade
-- para que al borrar el padre se eliminen sus add-ons automáticamente.
ALTER TABLE public.order_items
  ADD COLUMN parent_order_item_id uuid NULL
  REFERENCES public.order_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_order_items_parent
  ON public.order_items(parent_order_item_id);
