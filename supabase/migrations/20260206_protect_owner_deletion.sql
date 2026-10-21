-- =====================================================
-- Migration: Protect business owner from deletion
-- Date: 2026-02-06
-- Description: Prevents the business owner from being deleted
-- =====================================================

-- Create a function to check if a profile can be deleted
-- Returns false if the profile is the business owner
CREATE OR REPLACE FUNCTION public.can_delete_profile(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.businesses b
    JOIN public.profiles p ON p.business_id = b.id
    WHERE p.id = profile_id AND b.owner_id = profile_id
  );
$$;

-- Add RLS policy to prevent owner deletion
-- First, drop existing delete policy if any
DROP POLICY IF EXISTS "Users can delete profiles in their business" ON public.profiles;
DROP POLICY IF EXISTS "Prevent owner deletion" ON public.profiles;

-- Create new delete policy that checks if user can be deleted
CREATE POLICY "Delete profile except owner"
  ON public.profiles
  FOR DELETE
  USING (
    -- Must be in same business
    business_id = public.get_user_business_id()
    -- Cannot delete the business owner
    AND public.can_delete_profile(id)
  );

-- Add comment for documentation
COMMENT ON FUNCTION public.can_delete_profile IS 
  'Checks if a profile can be deleted. Returns false if the profile is the business owner.';
