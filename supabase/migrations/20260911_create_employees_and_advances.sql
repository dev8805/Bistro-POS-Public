-- Migration: 20260911_create_employees_and_advances.sql
-- Directorio de Colaboradores, Vales/Anticipos y soporte de Nómina en Gastos

-- 1. Tabla de Colaboradores (sin dependencia obligatoria de auth.users)
create table if not exists public.employees (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null,
  document_type text default 'CC',
  document_number text,
  phone text,
  job_title text,
  payment_type text default 'turn' check (payment_type in ('daily', 'turn', 'weekly', 'biweekly', 'monthly')),
  base_rate numeric default 0,
  profile_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.employees enable row level security;

create index if not exists idx_employees_business on public.employees(business_id);
create index if not exists idx_employees_active on public.employees(business_id, is_active);

-- Políticas RLS para employees
create policy "Users can view their business employees"
  on public.employees for select
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can insert their business employees"
  on public.employees for insert
  with check (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can update their business employees"
  on public.employees for update
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can delete their business employees"
  on public.employees for delete
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

-- 2. Tabla de Vales y Anticipos de Nómina
create table if not exists public.employee_advances (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount numeric not null check (amount > 0),
  reason text,
  advance_date date default ((current_timestamp at time zone 'America/Bogota')::date),
  status text not null default 'pending' check (status in ('pending', 'settled', 'cancelled')),
  settled_at timestamptz,
  settled_by_expense_id uuid references public.expenses(id) on delete set null,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.employee_advances enable row level security;

create index if not exists idx_advances_employee on public.employee_advances(employee_id);
create index if not exists idx_advances_status on public.employee_advances(business_id, status);

-- Políticas RLS para employee_advances
create policy "Users can view their business advances"
  on public.employee_advances for select
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can insert their business advances"
  on public.employee_advances for insert
  with check (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can update their business advances"
  on public.employee_advances for update
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

create policy "Users can delete their business advances"
  on public.employee_advances for delete
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

-- 3. Columnas opcionales en expenses para vinculación con colaborador y desglose de vales
alter table public.expenses
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists advance_deductions numeric default 0,
  add column if not exists net_amount numeric,
  add column if not exists payroll_concept text;

create index if not exists idx_expenses_employee on public.expenses(employee_id);
