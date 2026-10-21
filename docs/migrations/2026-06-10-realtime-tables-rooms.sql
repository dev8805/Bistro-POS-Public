-- 2026-06-10 — Habilitar Realtime para mesas y salas
--
-- Contexto: el dropdown de mesas (TableSelectorControl) y useTables dependen de
-- eventos postgres_changes sobre `tables` y `rooms` para reflejar en tiempo real
-- el estado de las mesas (Libre/Ocupada) y los cambios de salas entre dispositivos.
--
-- Problema: las tablas `tables` y `rooms` NO estaban en la publicación
-- `supabase_realtime`, por lo que sus cambios no emitían eventos y había que
-- recargar la página para verlos.
--
-- Aplicada en el proyecto hosteado (fuente de verdad) vía MCP apply_migration.

alter publication supabase_realtime add table public.tables;
alter publication supabase_realtime add table public.rooms;

-- Verificación:
-- select tablename from pg_publication_tables
-- where pubname = 'supabase_realtime'
--   and tablename in ('tables','rooms','orders','order_items')
-- order by tablename;
