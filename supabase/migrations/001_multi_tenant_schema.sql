-- =====================================================
-- BistroPOS Multi-tenant Database Schema
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

-- Add foreign key from client_transactions to orders
alter table public.client_transactions 
  add constraint client_transactions_order_fk 
  foreign key (order_id) references public.orders(id) on delete set null;

-- Add foreign key from tables to orders
alter table public.tables 
  add constraint tables_current_order_fk 
  foreign key (current_order_id) references public.orders(id) on delete set null;

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
