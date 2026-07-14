-- Add global settings table

CREATE TABLE public.global_settings (
  id TEXT PRIMARY KEY,
  data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ALL for global_settings" ON public.global_settings FOR ALL USING (true) WITH CHECK (true);
