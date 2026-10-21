-- =====================================================
-- SUBSCRIPTION SYSTEM TABLES
-- =====================================================

-- 1. Subscription Plans
create table if not exists public.subscription_plans (
  id uuid default gen_random_uuid() primary key,
  name text not null,                    -- "Mensual", "Anual"
  description text,
  price_monthly numeric(12,2) not null,  -- Precio en COP
  features jsonb default '[]',           -- Lista de características
  trial_duration int default 14,         -- Duración de prueba (número)
  trial_interval text default 'day' check (trial_interval in ('day', 'minute')), -- Intervalo: 'day' o 'minute'
  is_active boolean default true,
  created_at timestamptz default now()
);

-- RLS for plans (read-only for authenticated, write for admins)
alter table public.subscription_plans enable row level security;
create policy "Plans are viewable by everyone" on public.subscription_plans for select using (true);

-- Insert default plans
insert into public.subscription_plans (name, price_monthly, trial_duration, trial_interval, features) values
('Mensual', 29000, 14, 'day', '[\"Control de clientes\", \"Deudas\", \"Ventas\", \"Gastos\", \"Proveedores\", \"Productos con ingredientes\", \"Servicios\", \"Mesas\", \"Empleados\", \"Control de caja\", \"Domicilios\"]'),
('Anual', 120000, 14, 'day', '[\"Control de clientes\", \"Deudas\", \"Ventas\", \"Gastos\", \"Proveedores\", \"Productos con ingredientes\", \"Servicios\", \"Mesas\", \"Empleados\", \"Control de caja\", \"Domicilios\", \"Ahorro de 2 meses\"]');

-- 2. Business Subscriptions
create table if not exists public.business_subscriptions (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade unique,
  plan_id uuid not null references public.subscription_plans(id),
  status text default 'trial' check (status in ('active', 'past_due', 'canceled', 'trial')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  next_billing_date date not null,
  
  -- Retry logic
  retry_count int default 0,
  last_retry_at timestamptz,
  
  -- Metadata
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for subscriptions
alter table public.business_subscriptions enable row level security;
create policy "Businesses can view own subscription" on public.business_subscriptions 
  for select using (business_id = public.get_user_business_id());

create policy "Businesses can insert own subscription" on public.business_subscriptions 
  for insert with check (business_id = public.get_user_business_id());

create policy "Businesses can update own subscription" on public.business_subscriptions 
  for update using (business_id = public.get_user_business_id());

-- 3. Payment Methods (Wompi Tokens)
create table if not exists public.payment_methods (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  
  wompi_source_id text,                  -- ID de fuente de pago Wompi (opcional si usamos tokens directos)
  card_token text not null,              -- Token de tarjeta
  card_last_four text not null,          -- Últimos 4 dígitos
  card_brand text,                       -- VISA, MASTERCARD
  card_exp_month text,
  card_exp_year text,
  
  is_default boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- RLS for payment methods
alter table public.payment_methods enable row level security;
create policy "Businesses can view own payment methods" on public.payment_methods 
  for select using (business_id = public.get_user_business_id());
create policy "Businesses can insert own payment methods" on public.payment_methods 
  for insert with check (business_id = public.get_user_business_id());
create policy "Businesses can update own payment methods" on public.payment_methods
  for update using (business_id = public.get_user_business_id());

-- 4. Subscription Invoices
create table if not exists public.subscription_invoices (
  id uuid default gen_random_uuid() primary key,
  subscription_id uuid not null references public.business_subscriptions(id) on delete cascade,
  
  amount numeric(12,2) not null,
  status text default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  
  wompi_transaction_id text,
  wompi_status text,
  wompi_response jsonb,
  
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  
  created_at timestamptz default now()
);

-- RLS for invoices
alter table public.subscription_invoices enable row level security;
create policy "Businesses can view own invoices" on public.subscription_invoices 
  for select using (
    exists (
      select 1 from public.business_subscriptions s
      where s.id = subscription_id and s.business_id = public.get_user_business_id()
    )
  );

-- Helper to handle updated_at
create trigger on_business_subscriptions_updated
  before update on public.business_subscriptions
  for each row execute function public.handle_updated_at();
