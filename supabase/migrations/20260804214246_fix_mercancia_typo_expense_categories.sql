-- Corrige el typo 'MERCANÍA' -> 'MERCANCÍA' introducido en la migracion anterior.
-- 1) Borra las filas mal escritas (todas provienen del backfill defectuoso).
delete from public.expense_categories where name = 'MERCANÍA';

-- 2) Recrea la funcion del trigger con el nombre correcto.
create or replace function public.tg_new_business_seed_expense_categories()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.expense_categories (business_id, name)
  select new.id, cat
  from unnest(array[
    'ARRIENDO','BIENES','HONORARIOS','IMPUESTOS','INSUMOS',
    'MANTENIMIENTO','MERCANCÍA','PUBLICIDAD','SALUD Y PARAFISCALES',
    'SERVICIOS','SUELDOS'
  ]) as cat
  on conflict (business_id, name) do nothing;
  return new;
end;
$$;
