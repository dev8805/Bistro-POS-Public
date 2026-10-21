-- Tabla de etiquetas para la comanda (localizador / mesa) que el cajero elige
-- en el modal previo a enviar la comanda desde SuccessScreen / SuccessSidebar.
-- Es INDEPENDIENTE de public.tables (mesas del POS). Aqui son solo etiquetas
-- libres para imprimir en el ticket de cocina.

create table if not exists public.comanda_labels (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    kind text not null check (kind in ('locator','table')),
    value text not null check (char_length(trim(value)) between 1 and 20),
    position integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (business_id, kind, value)
);

comment on table public.comanda_labels is 'Etiquetas rapidas (localizador/mesa) que se imprimen encima del "Orden:" en la comanda de cocina. Compartidas por negocio. No relacionadas con public.tables.';

create index if not exists comanda_labels_business_kind_position_idx
    on public.comanda_labels (business_id, kind, position);

alter table public.comanda_labels enable row level security;

-- Lectura: todos los usuarios del negocio.
create policy "Users can view business comanda_labels"
    on public.comanda_labels
    for select
    using (business_id = get_user_business_id());

-- Escritura: administradores y cajeros del negocio (mismo patron que expense_categories).
create policy "Admins and cajeros can insert comanda_labels"
    on public.comanda_labels
    for insert
    with check (
        business_id = get_user_business_id()
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role = any (array['Administrador','Cajero'])
        )
    );

create policy "Admins and cajeros can update comanda_labels"
    on public.comanda_labels
    for update
    using (
        business_id = get_user_business_id()
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role = any (array['Administrador','Cajero'])
        )
    )
    with check (business_id = get_user_business_id());

create policy "Admins and cajeros can delete comanda_labels"
    on public.comanda_labels
    for delete
    using (
        business_id = get_user_business_id()
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role = any (array['Administrador','Cajero'])
        )
    );

-- Trigger para mantener updated_at.
create or replace function public.tg_comanda_labels_updated_at()
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

create trigger comanda_labels_set_updated_at
    before update on public.comanda_labels
    for each row execute function public.tg_comanda_labels_updated_at();
