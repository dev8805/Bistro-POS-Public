-- ============================================================
-- 1. Backfill: crea la fila de visibilidad (con defaults en true)
--    para cada negocio existente que aún no la tiene.
--    ON CONFLICT DO NOTHING => idempotente (respeta preferencias
--    existentes de negocios que ya tocaron la tuerca del modal).
-- ============================================================

insert into public.comanda_labels_visibility (business_id)
select b.id
from public.businesses b
on conflict (business_id) do nothing;

-- ============================================================
-- 2. Automatización: trigger AFTER INSERT en businesses que
--    inserta la fila de visibilidad con defaults (todos true).
--    SECURITY DEFINER porque el nuevo usuario aún no cumple
--    la RLS al momento del INSERT del negocio.
-- ============================================================

create or replace function public.tg_new_business_seed_comanda_labels_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.comanda_labels_visibility (business_id)
    values (new.id)
    on conflict (business_id) do nothing;
    return new;
end;
$$;

comment on function public.tg_new_business_seed_comanda_labels_visibility is 'Al crear un negocio nuevo, siembra la fila en comanda_labels_visibility con las 3 pestañas activas por defecto (locator/table/takeaway).';

drop trigger if exists after_business_insert_seed_comanda_labels_visibility
    on public.businesses;

create trigger after_business_insert_seed_comanda_labels_visibility
    after insert on public.businesses
    for each row execute function public.tg_new_business_seed_comanda_labels_visibility();
