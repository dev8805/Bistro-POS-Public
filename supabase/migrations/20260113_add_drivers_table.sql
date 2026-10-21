-- Create drivers table
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id),
    name TEXT NOT NULL,
    phone TEXT,
    vehicle_info TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for drivers
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view drivers for their business" ON public.drivers;
DROP POLICY IF EXISTS "Users can manage drivers for their business" ON public.drivers;

CREATE POLICY "Users can view drivers for their business" ON public.drivers
    FOR SELECT USING (business_id = public.get_user_business_id());

CREATE POLICY "Users can manage drivers for their business" ON public.drivers
    FOR ALL USING (business_id = public.get_user_business_id());

-- Update delivery_info
ALTER TABLE public.delivery_info
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.drivers(id);
