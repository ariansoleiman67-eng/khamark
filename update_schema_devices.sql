-- Add devices and push_tokens tables

CREATE TABLE IF NOT EXISTS public.devices (
  id TEXT PRIMARY KEY,
  uid UUID REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id TEXT,
  fcm_token TEXT,
  platform TEXT,
  app_version TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  channel_version INTEGER DEFAULT 1,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ALL for devices" ON public.devices FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id TEXT PRIMARY KEY, -- deviceId
  token TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  platform TEXT,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow ALL for push_tokens" ON public.push_tokens FOR ALL USING (true) WITH CHECK (true);
