-- Business debts table for tracking supplier/other debts
create table if not exists public.business_debts (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('supplier', 'other')),
  creditor_name text not null,
  description text,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  due_date date,
  status text not null default 'active' check (status in ('active', 'paid', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.business_debts enable row level security;

create index if not exists business_debts_business_idx on public.business_debts(business_id);
create index if not exists business_debts_creditor_idx on public.business_debts(creditor_name);
create index if not exists business_debts_status_idx on public.business_debts(status);

-- RLS policies
create policy "Users can view their business debts"
  on public.business_debts for select
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can insert their business debts"
  on public.business_debts for insert
  with check (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can update their business debts"
  on public.business_debts for update
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can delete their business debts"
  on public.business_debts for delete
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

-- Updated_at trigger
create trigger handle_business_debts_updated_at
  before update on public.business_debts
  for each row execute function public.handle_updated_at();
