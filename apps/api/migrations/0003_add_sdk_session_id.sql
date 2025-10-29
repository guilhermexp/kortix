-- Migration: Add SDK session ID to conversations
-- This adds the sdk_session_id field to track Claude Agent SDK sessions

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS sdk_session_id TEXT;

-- Create index for faster lookups by SDK session ID
CREATE INDEX IF NOT EXISTS idx_conversations_sdk_session_id
ON public.conversations(sdk_session_id)
WHERE sdk_session_id IS NOT NULL;

COMMIT;
