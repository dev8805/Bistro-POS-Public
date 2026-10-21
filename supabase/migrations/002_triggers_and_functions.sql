-- =====================================================
-- BistroPOS Triggers and Functions
-- Version: 1.0.0
-- =====================================================

-- =====================================================
-- HELPER FUNCTIONS
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
-- UPDATED_AT TRIGGER FUNCTION
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
-- NEW USER / BUSINESS OWNER HANDLER
-- =====================================================

-- Drop existing trigger first
drop trigger if exists on_auth_user_created on auth.users;

-- New function to handle user signup
-- If user registers without a business, create a new business for them
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
      new.raw_user_meta_data->>'full_name' || '''s Business',
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
-- EMPLOYEE CREATION FUNCTION (Admin only)
-- =====================================================

create or replace function public.create_employee(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text default null,
  p_role text default 'Mesero'
)
returns json
language plpgsql
security definer
as $$
declare
  v_business_id uuid;
  v_user_id uuid;
  v_is_admin boolean;
begin
  -- Check if caller is admin
  select role = 'Administrador', business_id 
  into v_is_admin, v_business_id
  from public.profiles 
  where id = auth.uid();
  
  if not v_is_admin then
    raise exception 'Only administrators can create employees';
  end if;
  
  if v_business_id is null then
    raise exception 'No business associated with your account';
  end if;
  
  -- Validate role
  if p_role not in ('Administrador', 'Cajero', 'Mesero', 'Cocinero') then
    raise exception 'Invalid role. Must be: Administrador, Cajero, Mesero, or Cocinero';
  end if;
  
  -- Create user in auth.users using Supabase admin API
  -- Note: This needs to be called from a service role, so we use a different approach
  -- The actual user creation should be done via Supabase Auth Admin API from the frontend
  
  -- For now, we'll insert directly into profiles if user already exists
  -- This function should be called AFTER creating the user via Auth Admin API
  
  return json_build_object(
    'success', true,
    'business_id', v_business_id,
    'message', 'Use Supabase Auth Admin API to create user with metadata: business_id=' || v_business_id::text || ', role=' || p_role
  );
end;
$$;

-- Function to add employee profile after auth user is created
create or replace function public.add_employee_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text default null,
  p_role text default 'Mesero'
)
returns json
language plpgsql
security definer
as $$
declare
  v_business_id uuid;
  v_is_admin boolean;
begin
  -- Check if caller is admin
  select role = 'Administrador', business_id 
  into v_is_admin, v_business_id
  from public.profiles 
  where id = auth.uid();
  
  if not v_is_admin then
    raise exception 'Only administrators can add employees';
  end if;
  
  -- Check if profile already exists
  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile already exists for this user';
  end if;
  
  -- Create profile
  insert into public.profiles (id, full_name, phone, role, business_id)
  values (p_user_id, p_full_name, p_phone, p_role, v_business_id);
  
  return json_build_object(
    'success', true,
    'user_id', p_user_id,
    'business_id', v_business_id
  );
end;
$$;

-- =====================================================
-- INVENTORY MANAGEMENT FUNCTIONS
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
  -- Use provided business_id or get from current user
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
-- CLIENT DEBT MANAGEMENT
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
    -- Reverse the transaction effect on delete
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
-- ORDER CALCULATIONS
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
-- TABLE STATUS MANAGEMENT
-- =====================================================

-- Function to update table status based on orders
create or replace function public.update_table_status_on_order()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' or TG_OP = 'UPDATE' then
    -- When order is created or updated
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
-- PRODUCT COST CALCULATION (for processed products)
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
  -- Get product type
  select type into v_product_type
  from public.products
  where id = p_product_id;
  
  if v_product_type = 'processed' then
    -- Calculate from ingredients
    select coalesce(sum(pi.quantity * i.cost_per_unit), 0)
    into v_total_cost
    from public.product_ingredients pi
    join public.ingredients i on i.id = pi.ingredient_id
    where pi.product_id = p_product_id;
  else
    -- Return stored cost for simple products
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
  -- Update the product's cost
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
-- REPORTING HELPER FUNCTIONS
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
