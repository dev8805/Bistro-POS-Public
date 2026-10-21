-- Realtime para la tabla categories
-- Propósito: que los cambios de etiquetas/carpetas (customizable_options) y las
-- altas/bajas de categorías se propaguen en tiempo real a todos los dispositivos
-- del mismo negocio (App.tsx canal "products-sync", listener de categories).

-- 1) Habilitar realtime en la tabla
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;

-- 2) REPLICA IDENTITY FULL: necesario para que los eventos DELETE incluyan
--    business_id en el registro "old" y el filtro `business_id=eq.<id>` funcione.
ALTER TABLE public.categories REPLICA IDENTITY FULL;
