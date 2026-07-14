-- Supabase Postgres Schema for HAryad App Migration

-- 1. Create Users Table (extends Supabase Auth auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  full_name TEXT,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  profile_image_url TEXT,
  cover_url TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  date_of_birth DATE,
  gender TEXT,
  preferred_currency TEXT DEFAULT 'IQD',
  language TEXT DEFAULT 'en',
  role TEXT DEFAULT 'customer',
  is_admin BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  auth_provider TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Parts (Products) Table
CREATE TABLE public.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  name_ku TEXT,
  part_number TEXT,
  category TEXT,
  category_ar TEXT,
  category_ku TEXT,
  price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  purchase_price NUMERIC(10,2),
  stock_qty INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  description_ar TEXT,
  description_ku TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  brand TEXT,
  image_urls JSONB DEFAULT '[]'::jsonb,
  compatible_models JSONB DEFAULT '[]'::jsonb,
  variations JSONB DEFAULT '[]'::jsonb,
  color_variations JSONB DEFAULT '[]'::jsonb,
  price_tiers JSONB DEFAULT '[]'::jsonb,
  shipping_rates JSONB DEFAULT '[]'::jsonb,
  specifications JSONB DEFAULT '{}'::jsonb,
  weight NUMERIC,
  video_url TEXT,
  tenant_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Orders Table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  order_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  subtotal_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_usd NUMERIC(10,2) DEFAULT 0,
  total_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid_usd NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'IQD',
  exchange_rate NUMERIC,
  payment_method JSONB,
  shipping_address JSONB NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  special_instructions TEXT,
  tracking_number TEXT,
  stock_status TEXT DEFAULT 'pending',
  tenant_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create Banners Table
CREATE TABLE public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create Tenants / Settings Table
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES public.users(id),
  store_name TEXT,
  logo_url TEXT,
  cover_url TEXT,
  business_info JSONB,
  operating_hours JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on Row Level Security (RLS) but allow ALL for now (migration phase)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow ALL for users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow ALL for parts" ON public.parts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow ALL for orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow ALL for banners" ON public.banners FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow ALL for tenants" ON public.tenants FOR ALL USING (true) WITH CHECK (true);
