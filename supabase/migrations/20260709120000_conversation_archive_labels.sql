-- Conversation organization: per-side archive flag + labels.
-- Mirrors the existing deleted_by / unread "JSONB per side" pattern, so the
-- client updates these columns through the same conversations RLS policy that
-- already permits softDeleteConversation / markConversationAsRead.
--
--   archived_by : { "user": bool, "admin": bool }   -- hidden from that side's main list
--   labels      : { "user": string[], "admin": string[] }  -- assigned label ids per side

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS archived_by jsonb NOT NULL DEFAULT '{"user": false, "admin": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '{}'::jsonb;
