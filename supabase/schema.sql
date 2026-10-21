-- =====================================================
-- BistroPOS Multi-tenant Database Schema
-- Complete SQL - Run this in Supabase SQL Editor
-- Version: 1.0.0
-- =====================================================

-- =====================================================
-- PART 1: CORE MULTI-TENANT TABLES
-- =====================================================

-- 1.1 Create businesses table (tenants)
create table if not exists public.businesses (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  owner_id uuid references auth.users on delete set null,
  phone text,
  address text,
  currency text default 'COP',
  timezone text default 'America/Bogota',
  logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS on businesses
alter table public.businesses enable row level security;

-- Index for faster lookups
create index if not exists businesses_owner_idx on public.businesses(owner_id);

-- 1.2 Modify profiles table to add business_id
-- First, add the business_id column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'profiles' 
    and column_name = 'business_id'
  ) then
    alter table public.profiles add column business_id uuid references public.businesses(id) on delete cascade;
  end if;
end $$;

-- Create index for business_id on profiles
create index if not exists profiles_business_idx on public.profiles(business_id);

-- =====================================================
-- PART 2: CATALOG TABLES
-- =====================================================

-- 2.1 Categories table
create table if not exists public.categories (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  color text default '#6B7280',
  icon text default 'category',
  display_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(business_id, name)
);

alter table public.categories enable row level security;
create index if not exists categories_business_idx on public.categories(business_id);

-- 2.2 Products table
create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  type text not null check (type in ('simple', 'processed', 'service')),
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  stock numeric(12,2) default null, -- null means unlimited (for services)
  min_stock numeric(12,2) default 0, -- alert threshold
  unit text default 'Und',
  image_url text,
  barcode text,
  is_active boolean default true,
  has_customization boolean default false,
  customizable_options jsonb default '[]'::jsonb, -- e.g. ["1/2", "3/4", "Bien Cocido"]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.products enable row level security;
create index if not exists products_business_idx on public.products(business_id);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_type_idx on public.products(type);
create index if not exists products_barcode_idx on public.products(barcode);

-- 2.3 Ingredients table (for processed products / recipes)
create table if not exists public.ingredients (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  unit text not null default 'Und',
  cost_per_unit numeric(12,2) not null default 0,
  stock numeric(12,2) default 0,
  min_stock numeric(12,2) default 0,
  supplier text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(business_id, name)
);

alter table public.ingredients enable row level security;
create index if not exists ingredients_business_idx on public.ingredients(business_id);

-- 2.4 Product ingredients (recipes) - junction table
create table if not exists public.product_ingredients (
  id uuid default gen_random_uuid() primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity numeric(12,4) not null default 1,
  created_at timestamptz default now(),
  unique(product_id, ingredient_id)
);

alter table public.product_ingredients enable row level security;
create index if not exists product_ingredients_product_idx on public.product_ingredients(product_id);
create index if not exists product_ingredients_ingredient_idx on public.product_ingredients(ingredient_id);

-- =====================================================
-- PART 3: CLIENT & CREDIT TABLES
-- =====================================================

-- 3.1 Clients table
create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  credit_limit numeric(12,2) default 0,
  current_debt numeric(12,2) default 0,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.clients enable row level security;
create index if not exists clients_business_idx on public.clients(business_id);
create index if not exists clients_phone_idx on public.clients(phone);

-- 3.2 Client transactions (debts and payments)
create table if not exists public.client_transactions (
  id uuid default gen_random_uuid() primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null check (type in ('debt', 'payment')),
  amount numeric(12,2) not null,
  note text,
  order_id uuid, -- will reference orders table
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.client_transactions enable row level security;
create index if not exists client_transactions_client_idx on public.client_transactions(client_id);
create index if not exists client_transactions_type_idx on public.client_transactions(type);

-- =====================================================
-- PART 4: RESTAURANT TABLES (ROOMS & TABLES)
-- =====================================================

-- 4.1 Rooms / Areas
create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  display_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(business_id, name)
);

alter table public.rooms enable row level security;
create index if not exists rooms_business_idx on public.rooms(business_id);

-- 4.2 Tables
create table if not exists public.tables (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  label text not null,
  seats int default 4,
  status text default 'available' check (status in ('available', 'occupied', 'reserved')),
  current_order_id uuid, -- will reference orders table
  position_x int default 0, -- for visual layout
  position_y int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tables enable row level security;
create index if not exists tables_business_idx on public.tables(business_id);
create index if not exists tables_room_idx on public.tables(room_id);
create index if not exists tables_status_idx on public.tables(status);

-- =====================================================
-- PART 5: ORDERS & SALES TABLES
-- =====================================================

-- 5.1 Orders table
create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  waiter_id uuid references public.profiles(id) on delete set null,
  order_number serial, -- auto-increment per business
  order_type text default 'dine_in' check (order_type in ('dine_in', 'takeaway', 'delivery')),
  status text default 'pending' check (status in ('pending', 'preparing', 'ready', 'completed', 'canceled')),
  payment_method text default 'cash' check (payment_method in ('cash', 'card', 'transfer', 'credit', 'other')),
  payment_status text default 'pending' check (payment_status in ('pending', 'paid', 'partial')),
  subtotal numeric(12,2) default 0,
  discount numeric(12,2) default 0,
  discount_type text check (discount_type in ('percentage', 'fixed')),
  tax numeric(12,2) default 0,
  total numeric(12,2) default 0,
  amount_paid numeric(12,2) default 0,
  change_amount numeric(12,2) default 0,
  notes text,
  customer_name text, -- for walk-in customers without client record
  created_at timestamptz default now(),
  completed_at timestamptz,
  canceled_at timestamptz,
  canceled_reason text
);

alter table public.orders enable row level security;
create index if not exists orders_business_idx on public.orders(business_id);
create index if not exists orders_table_idx on public.orders(table_id);
create index if not exists orders_client_idx on public.orders(client_id);
create index if not exists orders_waiter_idx on public.orders(waiter_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_idx on public.orders(created_at);

-- Add foreign key from client_transactions to orders (if not exists)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'client_transactions_order_fk'
  ) then
    alter table public.client_transactions 
      add constraint client_transactions_order_fk 
      foreign key (order_id) references public.orders(id) on delete set null;
  end if;
end $$;

-- Add foreign key from tables to orders (if not exists)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'tables_current_order_fk'
  ) then
    alter table public.tables 
      add constraint tables_current_order_fk 
      foreign key (current_order_id) references public.orders(id) on delete set null;
  end if;
end $$;

-- 5.2 Order items
create table if not exists public.order_items (
  id uuid default gen_random_uuid() primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null, -- stored in case product is deleted
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null,
  total_price numeric(12,2) not null,
  notes text,
  removed_ingredients jsonb default '[]'::jsonb, -- ingredient IDs removed
  cooking_term text, -- selected customizable option
  status text default 'pending' check (status in ('pending', 'preparing', 'ready', 'served', 'canceled')),
  created_at timestamptz default now()
);

alter table public.order_items enable row level security;
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_product_idx on public.order_items(product_id);

-- 5.3 Delivery info (extra info for delivery orders)
create table if not exists public.delivery_info (
  id uuid default gen_random_uuid() primary key,
  order_id uuid not null references public.orders(id) on delete cascade unique,
  address text not null,
  phone text not null,
  driver_name text,
  driver_phone text,
  delivery_fee numeric(12,2) default 0,
  delivery_status text default 'pending' check (delivery_status in ('pending', 'assigned', 'picked_up', 'on_the_way', 'delivered', 'failed')),
  estimated_time timestamptz,
  delivered_at timestamptz,
  delivery_notes text,
  created_at timestamptz default now()
);

alter table public.delivery_info enable row level security;
create index if not exists delivery_info_order_idx on public.delivery_info(order_id);
create index if not exists delivery_info_status_idx on public.delivery_info(delivery_status);

-- =====================================================
-- PART 6: EXPENSES TABLE
-- =====================================================

create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount numeric(12,2) not null,
  description text not null,
  category text,
  payment_method text default 'cash',
  receipt_url text,
  expense_date date default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.expenses enable row level security;
create index if not exists expenses_business_idx on public.expenses(business_id);
create index if not exists expenses_date_idx on public.expenses(expense_date);
create index if not exists expenses_category_idx on public.expenses(category);

-- =====================================================
-- PART 7: HELPER FUNCTIONS
-- =====================================================

-- Function to get current user's business_id
create or replace function public.get_user_business_id()
returns uuid
language sql
stable
security definer
as $$
  select business_id from public.profiles where id = auth.uid();
$$;

-- Function to check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles 
    where id = auth.uid() and role = 'Administrador'
  );
$$;

-- Function to check if user belongs to a specific business
create or replace function public.user_belongs_to_business(business_uuid uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles 
    where id = auth.uid() and business_id = business_uuid
  );
$$;

-- =====================================================
-- PART 8: UPDATED_AT TRIGGER FUNCTION
-- =====================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at trigger to all relevant tables
do $$
declare
  tables_to_update text[] := array[
    'businesses', 'profiles', 'categories', 'products', 
    'ingredients', 'clients', 'tables'
  ];
  t text;
begin
  foreach t in array tables_to_update loop
    execute format('
      drop trigger if exists on_%s_updated on public.%s;
      create trigger on_%s_updated
        before update on public.%s
        for each row execute function public.handle_updated_at();
    ', t, t, t, t);
  end loop;
end $$;

-- =====================================================
-- PART 9: NEW USER / BUSINESS OWNER HANDLER
-- =====================================================

-- Drop existing trigger first
drop trigger if exists on_auth_user_created on auth.users;

-- New function to handle user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_business_id uuid;
  user_role text;
  business_name text;
begin
  -- Check if user is joining an existing business (via metadata)
  if new.raw_user_meta_data->>'business_id' is not null then
    -- Employee joining existing business
    new_business_id := (new.raw_user_meta_data->>'business_id')::uuid;
    user_role := coalesce(new.raw_user_meta_data->>'role', 'Mesero');
  else
    -- New business owner - create their business
    business_name := coalesce(
      new.raw_user_meta_data->>'business_name',
      coalesce(new.raw_user_meta_data->>'full_name', 'Usuario') || '''s Business',
      'Mi Negocio'
    );
    
    insert into public.businesses (name, owner_id)
    values (business_name, new.id)
    returning id into new_business_id;
    
    user_role := 'Administrador';
  end if;

  -- Create the user profile
  insert into public.profiles (id, full_name, phone, avatar_url, role, business_id)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'avatar_url',
    user_role,
    new_business_id
  );
  
  return new;
end;
$$;

-- Recreate the trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- PART 10: INVENTORY MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to update stock when order is completed
create or replace function public.update_stock_on_order_complete()
returns trigger
language plpgsql
security definer
as $$
declare
  item record;
  recipe record;
begin
  -- Only run when status changes to 'completed'
  if new.status = 'completed' and old.status != 'completed' then
    -- Loop through order items
    for item in 
      select oi.*, p.type as product_type
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = new.id and oi.status != 'canceled'
    loop
      if item.product_type = 'simple' then
        -- Simple product: decrease stock directly
        update public.products 
        set stock = greatest(0, coalesce(stock, 0) - item.quantity)
        where id = item.product_id and stock is not null;
        
      elsif item.product_type = 'processed' then
        -- Processed product: decrease ingredients based on recipe
        for recipe in
          select pi.ingredient_id, pi.quantity * item.quantity as total_qty
          from public.product_ingredients pi
          where pi.product_id = item.product_id
        loop
          update public.ingredients
          set stock = greatest(0, coalesce(stock, 0) - recipe.total_qty)
          where id = recipe.ingredient_id;
        end loop;
      end if;
      -- Services don't affect stock
    end loop;
  end if;
  
  return new;
end;
$$;

-- Create trigger for stock updates
drop trigger if exists on_order_complete_update_stock on public.orders;
create trigger on_order_complete_update_stock
  after update on public.orders
  for each row execute function public.update_stock_on_order_complete();

-- Function to get products with low stock
create or replace function public.get_low_stock_products(p_business_id uuid default null)
returns table (
  id uuid,
  name text,
  type text,
  current_stock numeric,
  min_stock numeric,
  unit text
)
language plpgsql
stable
security definer
as $$
declare
  v_business_id uuid;
begin
  v_business_id := coalesce(p_business_id, public.get_user_business_id());
  
  return query
  select 
    p.id,
    p.name,
    p.type,
    p.stock as current_stock,
    p.min_stock,
    p.unit
  from public.products p
  where p.business_id = v_business_id
    and p.is_active = true
    and p.stock is not null
    and p.stock <= p.min_stock
  order by (p.stock / nullif(p.min_stock, 0)) asc;
end;
$$;

-- Function to get ingredients with low stock
create or replace function public.get_low_stock_ingredients(p_business_id uuid default null)
returns table (
  id uuid,
  name text,
  current_stock numeric,
  min_stock numeric,
  unit text
)
language plpgsql
stable
security definer
as $$
declare
  v_business_id uuid;
begin
  v_business_id := coalesce(p_business_id, public.get_user_business_id());
  
  return query
  select 
    i.id,
    i.name,
    i.stock as current_stock,
    i.min_stock,
    i.unit
  from public.ingredients i
  where i.business_id = v_business_id
    and i.is_active = true
    and i.stock <= i.min_stock
  order by (i.stock / nullif(i.min_stock, 0)) asc;
end;
$$;

-- =====================================================
-- PART 11: CLIENT DEBT MANAGEMENT
-- =====================================================

-- Function to update client's current_debt when transaction is added
create or replace function public.update_client_debt()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    if new.type = 'debt' then
      update public.clients 
      set current_debt = current_debt + new.amount,
          updated_at = now()
      where id = new.client_id;
    elsif new.type = 'payment' then
      update public.clients 
      set current_debt = greatest(0, current_debt - new.amount),
          updated_at = now()
      where id = new.client_id;
    end if;
  elsif TG_OP = 'DELETE' then
    if old.type = 'debt' then
      update public.clients 
      set current_debt = greatest(0, current_debt - old.amount),
          updated_at = now()
      where id = old.client_id;
    elsif old.type = 'payment' then
      update public.clients 
      set current_debt = current_debt + old.amount,
          updated_at = now()
      where id = old.client_id;
    end if;
  end if;
  
  return coalesce(new, old);
end;
$$;

-- Create trigger for client debt updates
drop trigger if exists on_client_transaction_change on public.client_transactions;
create trigger on_client_transaction_change
  after insert or delete on public.client_transactions
  for each row execute function public.update_client_debt();

-- =====================================================
-- PART 12: ORDER CALCULATIONS
-- =====================================================

-- Function to recalculate order totals
create or replace function public.recalculate_order_total()
returns trigger
language plpgsql
security definer
as $$
declare
  v_subtotal numeric;
begin
  -- Calculate subtotal from items
  select coalesce(sum(total_price), 0)
  into v_subtotal
  from public.order_items
  where order_id = coalesce(new.order_id, old.order_id)
    and status != 'canceled';
  
  -- Update order
  update public.orders
  set subtotal = v_subtotal,
      total = v_subtotal - coalesce(discount, 0) + coalesce(tax, 0)
  where id = coalesce(new.order_id, old.order_id);
  
  return coalesce(new, old);
end;
$$;

-- Create trigger for order total recalculation
drop trigger if exists on_order_item_change on public.order_items;
create trigger on_order_item_change
  after insert or update or delete on public.order_items
  for each row execute function public.recalculate_order_total();

-- =====================================================
-- PART 13: TABLE STATUS MANAGEMENT
-- =====================================================

-- Function to update table status based on orders
create or replace function public.update_table_status_on_order()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' or TG_OP = 'UPDATE' then
    if new.table_id is not null then
      if new.status in ('pending', 'preparing', 'ready') then
        update public.tables
        set status = 'occupied',
            current_order_id = new.id
        where id = new.table_id;
      elsif new.status in ('completed', 'canceled') then
        update public.tables
        set status = 'available',
            current_order_id = null
        where id = new.table_id and current_order_id = new.id;
      end if;
    end if;
  elsif TG_OP = 'DELETE' then
    if old.table_id is not null then
      update public.tables
      set status = 'available',
          current_order_id = null
      where id = old.table_id and current_order_id = old.id;
    end if;
  end if;
  
  return coalesce(new, old);
end;
$$;

-- Create trigger for table status
drop trigger if exists on_order_table_status on public.orders;
create trigger on_order_table_status
  after insert or update or delete on public.orders
  for each row execute function public.update_table_status_on_order();

-- =====================================================
-- PART 14: PRODUCT COST CALCULATION
-- =====================================================

-- Function to calculate product cost from ingredients
create or replace function public.calculate_product_cost(p_product_id uuid)
returns numeric
language plpgsql
stable
security definer
as $$
declare
  v_total_cost numeric := 0;
  v_product_type text;
begin
  select type into v_product_type
  from public.products
  where id = p_product_id;
  
  if v_product_type = 'processed' then
    select coalesce(sum(pi.quantity * i.cost_per_unit), 0)
    into v_total_cost
    from public.product_ingredients pi
    join public.ingredients i on i.id = pi.ingredient_id
    where pi.product_id = p_product_id;
  else
    select cost into v_total_cost
    from public.products
    where id = p_product_id;
  end if;
  
  return coalesce(v_total_cost, 0);
end;
$$;

-- Function to update product cost when ingredients change
create or replace function public.update_product_cost_on_ingredient_change()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.products
  set cost = public.calculate_product_cost(coalesce(new.product_id, old.product_id))
  where id = coalesce(new.product_id, old.product_id);
  
  return coalesce(new, old);
end;
$$;

-- Create trigger
drop trigger if exists on_product_ingredient_change on public.product_ingredients;
create trigger on_product_ingredient_change
  after insert or update or delete on public.product_ingredients
  for each row execute function public.update_product_cost_on_ingredient_change();

-- =====================================================
-- PART 15: REPORTING HELPER FUNCTIONS
-- =====================================================

-- Function to get daily sales summary
create or replace function public.get_daily_sales_summary(
  p_date date default current_date,
  p_business_id uuid default null
)
returns json
language plpgsql
stable
security definer
as $$
declare
  v_business_id uuid;
  v_result json;
begin
  v_business_id := coalesce(p_business_id, public.get_user_business_id());
  
  select json_build_object(
    'date', p_date,
    'total_sales', coalesce(sum(case when status = 'completed' then total else 0 end), 0),
    'total_orders', count(case when status = 'completed' then 1 end),
    'canceled_orders', count(case when status = 'canceled' then 1 end),
    'pending_orders', count(case when status in ('pending', 'preparing', 'ready') then 1 end),
    'average_ticket', coalesce(avg(case when status = 'completed' then total end), 0),
    'cash_sales', coalesce(sum(case when status = 'completed' and payment_method = 'cash' then total else 0 end), 0),
    'credit_sales', coalesce(sum(case when status = 'completed' and payment_method = 'credit' then total else 0 end), 0)
  )
  into v_result
  from public.orders
  where business_id = v_business_id
    and date(created_at) = p_date;
  
  return v_result;
end;
$$;

-- =====================================================
-- PART 16: ROW LEVEL SECURITY POLICIES
-- =====================================================

-- BUSINESSES TABLE POLICIES
drop policy if exists "Users can view their own business" on public.businesses;
drop policy if exists "Owners can update their business" on public.businesses;
drop policy if exists "System can create businesses" on public.businesses;

create policy "Users can view their own business"
  on public.businesses for select
  using (id = public.get_user_business_id() or owner_id = auth.uid());

create policy "Owners can update their business"
  on public.businesses for update
  using (owner_id = auth.uid());

create policy "System can create businesses"
  on public.businesses for insert
  with check (true);

-- PROFILES TABLE POLICIES
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Admins can insert profiles" on public.profiles;
drop policy if exists "Admins can delete profiles" on public.profiles;
drop policy if exists "Users can view business profiles" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Admins can manage business profiles" on public.profiles;
drop policy if exists "System can insert profiles" on public.profiles;

-- CRITICAL: Users can ALWAYS view their own profile (this breaks the circular dependency)
create policy "Users can view own profile"
  on public.profiles for select
  using (id = auth.uid());

-- Users can view profiles from their business
create policy "Users can view business profiles"
  on public.profiles for select
  using (
    business_id is not null 
    and business_id = (select p.business_id from public.profiles p where p.id = auth.uid())
  );

create policy "Users can update their own profile"
  on public.profiles for update
  using (id = auth.uid());

create policy "Admins can manage business profiles"
  on public.profiles for all
  using (
    business_id = (select p.business_id from public.profiles p where p.id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'Administrador')
  );

create policy "System can insert profiles"
  on public.profiles for insert
  with check (true);

-- CATEGORIES TABLE POLICIES
drop policy if exists "Users can view business categories" on public.categories;
drop policy if exists "Admins can manage categories" on public.categories;

create policy "Users can view business categories"
  on public.categories for select
  using (business_id = public.get_user_business_id());

create policy "Admins can manage categories"
  on public.categories for all
  using (business_id = public.get_user_business_id() and public.is_admin());

-- PRODUCTS TABLE POLICIES
drop policy if exists "Users can view business products" on public.products;
drop policy if exists "Admins can manage products" on public.products;

create policy "Users can view business products"
  on public.products for select
  using (business_id = public.get_user_business_id());

create policy "Admins can manage products"
  on public.products for all
  using (business_id = public.get_user_business_id() and public.is_admin());

-- INGREDIENTS TABLE POLICIES
drop policy if exists "Users can view business ingredients" on public.ingredients;
drop policy if exists "Admins can manage ingredients" on public.ingredients;

create policy "Users can view business ingredients"
  on public.ingredients for select
  using (business_id = public.get_user_business_id());

create policy "Admins can manage ingredients"
  on public.ingredients for all
  using (business_id = public.get_user_business_id() and public.is_admin());

-- PRODUCT_INGREDIENTS TABLE POLICIES
drop policy if exists "Users can view product ingredients" on public.product_ingredients;
drop policy if exists "Admins can manage product ingredients" on public.product_ingredients;

create policy "Users can view product ingredients"
  on public.product_ingredients for select
  using (exists (
    select 1 from public.products p
    where p.id = product_id and p.business_id = public.get_user_business_id()
  ));

create policy "Admins can manage product ingredients"
  on public.product_ingredients for all
  using (public.is_admin() and exists (
    select 1 from public.products p
    where p.id = product_id and p.business_id = public.get_user_business_id()
  ));

-- CLIENTS TABLE POLICIES
drop policy if exists "Users can view business clients" on public.clients;
drop policy if exists "Staff can manage clients" on public.clients;

create policy "Users can view business clients"
  on public.clients for select
  using (business_id = public.get_user_business_id());

create policy "Staff can manage clients"
  on public.clients for all
  using (business_id = public.get_user_business_id() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Administrador', 'Cajero')
  ));

-- CLIENT_TRANSACTIONS TABLE POLICIES
drop policy if exists "Users can view client transactions" on public.client_transactions;
drop policy if exists "Staff can manage client transactions" on public.client_transactions;

create policy "Users can view client transactions"
  on public.client_transactions for select
  using (exists (
    select 1 from public.clients c
    where c.id = client_id and c.business_id = public.get_user_business_id()
  ));

create policy "Staff can manage client transactions"
  on public.client_transactions for all
  using (exists (
    select 1 from public.clients c
    where c.id = client_id and c.business_id = public.get_user_business_id()
  ) and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Administrador', 'Cajero')
  ));

-- ROOMS TABLE POLICIES
drop policy if exists "Users can view business rooms" on public.rooms;
drop policy if exists "Admins can manage rooms" on public.rooms;

create policy "Users can view business rooms"
  on public.rooms for select
  using (business_id = public.get_user_business_id());

create policy "Admins can manage rooms"
  on public.rooms for all
  using (business_id = public.get_user_business_id() and public.is_admin());

-- TABLES TABLE POLICIES
drop policy if exists "Users can view business tables" on public.tables;
drop policy if exists "Staff can update table status" on public.tables;
drop policy if exists "Admins can manage tables" on public.tables;

create policy "Users can view business tables"
  on public.tables for select
  using (business_id = public.get_user_business_id());

create policy "Staff can update table status"
  on public.tables for update
  using (business_id = public.get_user_business_id());

create policy "Admins can manage tables"
  on public.tables for all
  using (business_id = public.get_user_business_id() and public.is_admin());

-- ORDERS TABLE POLICIES
drop policy if exists "Users can view business orders" on public.orders;
drop policy if exists "Staff can create orders" on public.orders;
drop policy if exists "Staff can update orders" on public.orders;
drop policy if exists "Admins can delete orders" on public.orders;

create policy "Users can view business orders"
  on public.orders for select
  using (business_id = public.get_user_business_id());

create policy "Staff can create orders"
  on public.orders for insert
  with check (business_id = public.get_user_business_id());

create policy "Staff can update orders"
  on public.orders for update
  using (business_id = public.get_user_business_id());

create policy "Admins can delete orders"
  on public.orders for delete
  using (business_id = public.get_user_business_id() and public.is_admin());

-- ORDER_ITEMS TABLE POLICIES
drop policy if exists "Users can view order items" on public.order_items;
drop policy if exists "Staff can manage order items" on public.order_items;

create policy "Users can view order items"
  on public.order_items for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.business_id = public.get_user_business_id()
  ));

create policy "Staff can manage order items"
  on public.order_items for all
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.business_id = public.get_user_business_id()
  ));

-- DELIVERY_INFO TABLE POLICIES
drop policy if exists "Users can view delivery info" on public.delivery_info;
drop policy if exists "Staff can manage delivery info" on public.delivery_info;

create policy "Users can view delivery info"
  on public.delivery_info for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.business_id = public.get_user_business_id()
  ));

create policy "Staff can manage delivery info"
  on public.delivery_info for all
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.business_id = public.get_user_business_id()
  ));

-- EXPENSES TABLE POLICIES
drop policy if exists "Users can view business expenses" on public.expenses;
drop policy if exists "Admins can manage expenses" on public.expenses;
drop policy if exists "Cajeros can create expenses" on public.expenses;

create policy "Users can view business expenses"
  on public.expenses for select
  using (business_id = public.get_user_business_id());

create policy "Admins can manage expenses"
  on public.expenses for all
  using (business_id = public.get_user_business_id() and public.is_admin());

create policy "Cajeros can create expenses"
  on public.expenses for insert
  with check (business_id = public.get_user_business_id() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Administrador', 'Cajero')
  ));

-- =====================================================
-- DONE! Schema is ready for multi-tenant POS system
-- =====================================================
