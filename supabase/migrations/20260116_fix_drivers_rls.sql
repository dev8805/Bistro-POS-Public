-- Fix drivers RLS policy to allow INSERT
-- Problem: FOR ALL USING without WITH CHECK blocks INSERT operations
-- because there's no existing row to evaluate the USING clause against

DROP POLICY IF EXISTS "Users can manage drivers for their business" ON public.drivers;

CREATE POLICY "Users can manage drivers for their business" ON public.drivers
    FOR ALL 
    USING (business_id = public.get_user_business_id())
    WITH CHECK (business_id = public.get_user_business_id());
