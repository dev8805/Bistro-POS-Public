-- Add kitchen_enabled column to businesses table
-- This allows business owners to disable kitchen functionality

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS kitchen_enabled BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN businesses.kitchen_enabled IS 'When false, hides Kitchen screen, Orders screen, and disables delivery functionality';
