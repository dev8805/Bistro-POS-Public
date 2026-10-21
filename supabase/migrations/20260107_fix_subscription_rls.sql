-- Fix RLS policies for subscription tables
-- Add missing INSERT and UPDATE policies

-- Allow businesses to create their own subscription
create policy "Businesses can create own subscription" on public.business_subscriptions 
  for insert with check (business_id = public.get_user_business_id());

-- Allow businesses to update their own subscription (for status changes, etc)
create policy "Businesses can update own subscription" on public.business_subscriptions
  for update using (business_id = public.get_user_business_id());
