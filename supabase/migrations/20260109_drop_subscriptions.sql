-- Drop subscription related tables to clean up conflicts
DROP TABLE IF EXISTS public.subscription_invoices CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.business_subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
