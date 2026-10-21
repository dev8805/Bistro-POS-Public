-- Migration: add_category_options_and_product_exclusions
-- Date: 2026-06-03
-- Description: Adds customizable_options to categories (shared labels) 
--              and excluded_options to products (per-product exclusion)

-- Add customizable_options to categories (shared labels for all products in category)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS customizable_options jsonb DEFAULT '[]'::jsonb;

-- Add excluded_options to products (per-product exclusion of category labels)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS excluded_options jsonb DEFAULT '[]'::jsonb;
