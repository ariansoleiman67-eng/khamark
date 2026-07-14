-- Supabase Postgres Schema for Chat System

CREATE TABLE public.conversations (
  id TEXT PRIMARY KEY,
  tenant_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.parts(id) ON DELETE SET NULL,
  product_snapshot JSONB,
  last_message JSONB,
  unread JSONB DEFAULT '{"user": 0, "admin": 0}'::jsonb,
  started_by TEXT,
  deleted_by JSONB DEFAULT '{"user": false, "admin": false}'::jsonb,
  is_blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  sender_type TEXT,
  sender_name TEXT,
  type TEXT DEFAULT 'text',
  text TEXT,
  attachment_url TEXT,
  file_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow ALL for conversations" ON public.conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow ALL for messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
