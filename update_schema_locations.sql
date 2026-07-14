-- Add live_tracking and store_locations tables

CREATE TABLE IF NOT EXISTS public.live_tracking (
  id TEXT PRIMARY KEY, -- orderId
  tenant_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT FALSE,
  coords JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.live_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ALL for live_tracking" ON public.live_tracking FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.store_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  name_ku TEXT,
  address TEXT NOT NULL,
  address_ar TEXT,
  address_ku TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  type TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  working_hours JSONB,
  created_by_admin_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ALL for store_locations" ON public.store_locations FOR ALL USING (true) WITH CHECK (true);
