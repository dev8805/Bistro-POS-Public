-- Migration: Add payment_method column and purchase type to cash_movements
-- Run this in Supabase SQL Editor

-- 1. Add payment_method column to cash_movements
ALTER TABLE public.cash_movements 
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

-- 2. Update the type constraint to include 'purchase'
-- First drop the existing constraint if it exists
ALTER TABLE public.cash_movements 
DROP CONSTRAINT IF EXISTS cash_movements_type_check;

-- Then add the new constraint with purchase
ALTER TABLE public.cash_movements 
ADD CONSTRAINT cash_movements_type_check 
CHECK (type IN ('opening', 'cash_in', 'cash_out', 'sale', 'expense', 'refund', 'purchase'));

-- 3. Add total_purchases column to cash_shifts for tracking
ALTER TABLE public.cash_shifts 
ADD COLUMN IF NOT EXISTS total_purchases NUMERIC(12,2) DEFAULT 0;

-- 4. Add index for payment_method for faster queries
CREATE INDEX IF NOT EXISTS cash_movements_payment_method_idx 
ON public.cash_movements(payment_method);

-- 5. Comment for documentation
COMMENT ON COLUMN public.cash_movements.payment_method IS 'Payment method used: cash, nequi, daviplata, card, transfer, other';
COMMENT ON COLUMN public.cash_movements.type IS 'Movement type: opening, cash_in, cash_out, sale, expense, refund, purchase';
COMMENT ON COLUMN public.cash_shifts.total_purchases IS 'Total amount of inventory purchases during the shift';
