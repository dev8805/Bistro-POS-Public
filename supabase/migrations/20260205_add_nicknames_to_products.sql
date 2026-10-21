-- Migration: Add nicknames column to products
-- Description: Allows products to have alternative names for easier searching
-- Date: 2026-02-05

-- Add nicknames array column to products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS nicknames TEXT[] DEFAULT '{}';

-- Create GIN index for fast array search
CREATE INDEX IF NOT EXISTS products_nicknames_idx 
ON public.products USING GIN (nicknames);
