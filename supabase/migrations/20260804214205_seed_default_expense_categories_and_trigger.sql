-- Categorias de gasto por defecto: 11 categorias limpias + PUBLICIDAD.
-- 1) Funcion de sembrado para negocios NUEVOS (mismo patron que comanda_labels).
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
    'MANTENIMIENTO','MERCANÍA','PUBLICIDAD','SALUD Y PARAFISCALES',
    'SERVICIOS','SUELDOS'
  ]) as cat
  on conflict (business_id, name) do nothing;
  return new;
end;
$$;

comment on function public.tg_new_business_seed_expense_categories is 'Al crear un negocio nuevo, siembra 11 categorias de gasto por defecto (idempotente).';

-- 2) Trigger after insert on businesses.
drop trigger if exists after_business_insert_seed_expense_categories on public.businesses;
create trigger after_business_insert_seed_expense_categories
  after insert on public.businesses
  for each row execute function public.tg_new_business_seed_expense_categories();

-- 3) Backfill: completar las que falten en los negocios EXISTENTES.
insert into public.expense_categories (business_id, name)
select b.id, cat
from public.businesses b
cross join unnest(array[
  'ARRIENDO','BIENES','HONORARIOS','IMPUESTOS','INSUMOS',
  'MANTENIMIENTO','MERCANÍA','PUBLICIDAD','SALUD Y PARAFISCALES',
  'SERVICIOS','SUELDOS'
]) as cat
on conflict (business_id, name) do nothing;
