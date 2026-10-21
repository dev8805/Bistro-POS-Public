-- =====================================================
-- BistroPOS Row Level Security Policies
-- Version: 1.0.0
-- =====================================================

-- =====================================================
-- BUSINESSES TABLE POLICIES
-- =====================================================

-- Drop existing policies
drop policy if exists "Users can view their own business" on public.businesses;
drop policy if exists "Owners can update their business" on public.businesses;
drop policy if exists "System can create businesses" on public.businesses;

-- Users can view their own business
create policy "Users can view their own business"
  on public.businesses
  for select
  using (
    id = public.get_user_business_id()
    or owner_id = auth.uid()
  );

-- Only owners can update their business
create policy "Owners can update their business"
  on public.businesses
  for update
  using (owner_id = auth.uid());

-- Allow business creation during signup (handled by trigger)
create policy "System can create businesses"
  on public.businesses
  for insert
  with check (true); -- Controlled by trigger security definer

-- =====================================================
-- PROFILES TABLE POLICIES (Update existing)
-- =====================================================

-- Drop existing policies
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

-- CRITICAL: Users can ALWAYS view their own profile
-- This breaks the circular dependency where get_user_business_id() needs to read the profile
create policy "Users can view own profile"
  on public.profiles
  for select
  using (id = auth.uid());

-- Users can view profiles in their business
create policy "Users can view business profiles"
  on public.profiles
  for select
  using (
    business_id is not null 
    and business_id = (select p.business_id from public.profiles p where p.id = auth.uid())
  );

-- Users can update their own profile (except role and business_id)
create policy "Users can update their own profile"
  on public.profiles
  for update
  using (id = auth.uid());

-- Admins can manage all profiles in their business
create policy "Admins can manage business profiles"
  on public.profiles
  for all
  using (
    business_id = (select p.business_id from public.profiles p where p.id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'Administrador')
  );

-- Allow profile creation during signup
create policy "System can insert profiles"
  on public.profiles
  for insert
  with check (true); -- Controlled by trigger security definer

-- =====================================================
-- CATEGORIES TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view business categories" on public.categories;
drop policy if exists "Admins can manage categories" on public.categories;

-- All users in business can view categories
create policy "Users can view business categories"
  on public.categories
  for select
  using (business_id = public.get_user_business_id());

-- Only admins can manage categories
create policy "Admins can manage categories"
  on public.categories
  for all
  using (
    business_id = public.get_user_business_id()
    and public.is_admin()
  );

-- =====================================================
-- PRODUCTS TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view business products" on public.products;
drop policy if exists "Admins can manage products" on public.products;

-- All users in business can view products
create policy "Users can view business products"
  on public.products
  for select
  using (business_id = public.get_user_business_id());

-- Only admins can manage products
create policy "Admins can manage products"
  on public.products
  for all
  using (
    business_id = public.get_user_business_id()
    and public.is_admin()
  );

-- =====================================================
-- INGREDIENTS TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view business ingredients" on public.ingredients;
drop policy if exists "Admins can manage ingredients" on public.ingredients;

-- All users in business can view ingredients
create policy "Users can view business ingredients"
  on public.ingredients
  for select
  using (business_id = public.get_user_business_id());

-- Only admins can manage ingredients
create policy "Admins can manage ingredients"
  on public.ingredients
  for all
  using (
    business_id = public.get_user_business_id()
    and public.is_admin()
  );

-- =====================================================
-- PRODUCT_INGREDIENTS TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view product ingredients" on public.product_ingredients;
drop policy if exists "Admins can manage product ingredients" on public.product_ingredients;

-- Users can view if they can view the product
create policy "Users can view product ingredients"
  on public.product_ingredients
  for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
      and p.business_id = public.get_user_business_id()
    )
  );

-- Admins can manage product ingredients
create policy "Admins can manage product ingredients"
  on public.product_ingredients
  for all
  using (
    public.is_admin()
    and exists (
      select 1 from public.products p
      where p.id = product_id
      and p.business_id = public.get_user_business_id()
    )
  );

-- =====================================================
-- CLIENTS TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view business clients" on public.clients;
drop policy if exists "Staff can manage clients" on public.clients;

-- All users in business can view clients
create policy "Users can view business clients"
  on public.clients
  for select
  using (business_id = public.get_user_business_id());

-- Admins and Cajeros can manage clients
create policy "Staff can manage clients"
  on public.clients
  for all
  using (
    business_id = public.get_user_business_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('Administrador', 'Cajero')
    )
  );

-- =====================================================
-- CLIENT_TRANSACTIONS TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view client transactions" on public.client_transactions;
drop policy if exists "Staff can manage client transactions" on public.client_transactions;

-- Users can view transactions of their business clients
create policy "Users can view client transactions"
  on public.client_transactions
  for select
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
      and c.business_id = public.get_user_business_id()
    )
  );

-- Admins and Cajeros can manage transactions
create policy "Staff can manage client transactions"
  on public.client_transactions
  for all
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
      and c.business_id = public.get_user_business_id()
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('Administrador', 'Cajero')
    )
  );

-- =====================================================
-- ROOMS TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view business rooms" on public.rooms;
drop policy if exists "Admins can manage rooms" on public.rooms;

-- All users in business can view rooms
create policy "Users can view business rooms"
  on public.rooms
  for select
  using (business_id = public.get_user_business_id());

-- Only admins can manage rooms
create policy "Admins can manage rooms"
  on public.rooms
  for all
  using (
    business_id = public.get_user_business_id()
    and public.is_admin()
  );

-- =====================================================
-- TABLES TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view business tables" on public.tables;
drop policy if exists "Staff can update table status" on public.tables;
drop policy if exists "Admins can manage tables" on public.tables;

-- All users in business can view tables
create policy "Users can view business tables"
  on public.tables
  for select
  using (business_id = public.get_user_business_id());

-- All staff can update table status
create policy "Staff can update table status"
  on public.tables
  for update
  using (business_id = public.get_user_business_id());

-- Only admins can insert/delete tables
create policy "Admins can manage tables"
  on public.tables
  for all
  using (
    business_id = public.get_user_business_id()
    and public.is_admin()
  );

-- =====================================================
-- ORDERS TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view business orders" on public.orders;
drop policy if exists "Staff can create orders" on public.orders;
drop policy if exists "Staff can update orders" on public.orders;
drop policy if exists "Admins can delete orders" on public.orders;

-- All users in business can view orders
create policy "Users can view business orders"
  on public.orders
  for select
  using (business_id = public.get_user_business_id());

-- All staff can create orders
create policy "Staff can create orders"
  on public.orders
  for insert
  with check (business_id = public.get_user_business_id());

-- Staff can update orders
create policy "Staff can update orders"
  on public.orders
  for update
  using (business_id = public.get_user_business_id());

-- Only admins can delete orders
create policy "Admins can delete orders"
  on public.orders
  for delete
  using (
    business_id = public.get_user_business_id()
    and public.is_admin()
  );

-- =====================================================
-- ORDER_ITEMS TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view order items" on public.order_items;
drop policy if exists "Staff can manage order items" on public.order_items;

-- Users can view items of orders in their business
create policy "Users can view order items"
  on public.order_items
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
      and o.business_id = public.get_user_business_id()
    )
  );

-- Staff can manage order items
create policy "Staff can manage order items"
  on public.order_items
  for all
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
      and o.business_id = public.get_user_business_id()
    )
  );

-- =====================================================
-- DELIVERY_INFO TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view delivery info" on public.delivery_info;
drop policy if exists "Staff can manage delivery info" on public.delivery_info;

-- Users can view delivery info of orders in their business
create policy "Users can view delivery info"
  on public.delivery_info
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
      and o.business_id = public.get_user_business_id()
    )
  );

-- Staff can manage delivery info
create policy "Staff can manage delivery info"
  on public.delivery_info
  for all
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
      and o.business_id = public.get_user_business_id()
    )
  );

-- =====================================================
-- EXPENSES TABLE POLICIES
-- =====================================================

drop policy if exists "Users can view business expenses" on public.expenses;
drop policy if exists "Admins can manage expenses" on public.expenses;
drop policy if exists "Cajeros can create expenses" on public.expenses;

-- All users in business can view expenses
create policy "Users can view business expenses"
  on public.expenses
  for select
  using (business_id = public.get_user_business_id());

-- Admins have full control over expenses
create policy "Admins can manage expenses"
  on public.expenses
  for all
  using (
    business_id = public.get_user_business_id()
    and public.is_admin()
  );

-- Cajeros can create expenses
create policy "Cajeros can create expenses"
  on public.expenses
  for insert
  with check (
    business_id = public.get_user_business_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('Administrador', 'Cajero')
    )
  );
