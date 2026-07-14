-- Supabase Postgres Schema for Carts

CREATE TABLE public.carts (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ALL for carts" ON public.carts FOR ALL USING (true) WITH CHECK (true);
