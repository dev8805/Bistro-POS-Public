-- =====================================================================
-- 1. Amplia comanda_labels.kind para admitir 'takeaway'.
--    'takeaway' representa el tipo de pedido (Para llevar, Domicilio, etc.).
-- =====================================================================

alter table public.comanda_labels
    drop constraint if exists comanda_labels_kind_check;

alter table public.comanda_labels
    add constraint comanda_labels_kind_check
    check (kind in ('locator','table','takeaway'));

comment on column public.comanda_labels.kind is 'Tipo de etiqueta: locator (localizador), table (mesa) o takeaway (tipo de pedido: para llevar, domicilio, etc.)';

-- =====================================================================
-- 2. Tabla dedicada para la visibilidad de pestañas del ComandaLabelModal.
--    Compartida por negocio. Cualquier miembro del negocio puede leer y
--    escribir (sin filtrar por rol) — es una preferencia de UI, no data
--    sensible.
-- =====================================================================

create table if not exists public.comanda_labels_visibility (
    business_id uuid primary key references public.businesses(id) on delete cascade,
    locator_visible boolean not null default true,
    table_visible boolean not null default true,
    takeaway_visible boolean not null default true,
    updated_at timestamptz not null default now()
);

comment on table public.comanda_labels_visibility is 'Preferencia por negocio: qué pestañas del ComandaLabelModal se muestran u ocultan (Localizador / Mesas / Tipo de pedido). Cualquier miembro del negocio puede modificarla.';

alter table public.comanda_labels_visibility enable row level security;

-- Lectura: cualquier miembro del negocio.
create policy "Members can view visibility"
    on public.comanda_labels_visibility
    for select
    using (business_id = get_user_business_id());

-- Inserción: cualquier miembro del negocio (para el primer upsert).
create policy "Members can insert visibility"
    on public.comanda_labels_visibility
    for insert
    with check (business_id = get_user_business_id());

-- Update: cualquier miembro del negocio.
create policy "Members can update visibility"
    on public.comanda_labels_visibility
    for update
    using (business_id = get_user_business_id())
    with check (business_id = get_user_business_id());

-- Trigger para mantener updated_at.
create or replace function public.tg_comanda_labels_visibility_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger comanda_labels_visibility_set_updated_at
    before update on public.comanda_labels_visibility
    for each row execute function public.tg_comanda_labels_visibility_updated_at();

-- =====================================================================
-- 3. Backfill: 'Para llevar' y 'Domicilio' como defaults de takeaway para
--    los 3 negocios existentes. Idempotente (ON CONFLICT DO NOTHING).
-- =====================================================================

insert into public.comanda_labels (business_id, kind, value, position)
select b.id, 'takeaway', v.value, v.pos
from public.businesses b
cross join (values ('Para llevar', 0), ('Domicilio', 1)) as v(value, pos)
on conflict (business_id, kind, value) do nothing;
