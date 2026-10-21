-- Add is_tables_enabled and pound_in_grams columns to businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_tables_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pound_in_grams numeric NOT NULL DEFAULT 500;
