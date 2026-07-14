-- Add addresses table

CREATE TABLE public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  full_name TEXT,
  phone TEXT,
  address TEXT,
  country_code TEXT,
  city_code TEXT,
  city TEXT,
  region TEXT,
  landmark TEXT,
  coordinates JSONB,
  formatted_address TEXT,
  address_components JSONB,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ALL for addresses" ON public.addresses FOR ALL USING (true) WITH CHECK (true);
