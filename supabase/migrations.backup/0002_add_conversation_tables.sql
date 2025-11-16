-- Migration: Add conversation tracking tables
-- This migration creates tables to store conversation history, events, and tool results
-- for the Claude Agent SDK integration

BEGIN;

-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create conversation_events table
CREATE TABLE IF NOT EXISTS public.conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('user', 'assistant', 'tool_use', 'tool_result', 'error')),
  role TEXT CHECK (role IN ('user', 'assistant')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create tool_results table
CREATE TABLE IF NOT EXISTS public.tool_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.conversation_events(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_use_id TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  is_error BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON public.conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON public.conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation_id ON public.conversation_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_type ON public.conversation_events(type);
CREATE INDEX IF NOT EXISTS idx_conversation_events_created_at ON public.conversation_events(created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation_created ON public.conversation_events(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tool_results_event_id ON public.tool_results(event_id);
CREATE INDEX IF NOT EXISTS idx_tool_results_tool_name ON public.tool_results(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_results_tool_use_id ON public.tool_results(tool_use_id);
CREATE INDEX IF NOT EXISTS idx_tool_results_executed_at ON public.tool_results(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_results_is_error ON public.tool_results(is_error);

-- Enable RLS on new tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for conversations
CREATE POLICY "Users can view their organization's conversations"
  ON public.conversations FOR SELECT
  USING (org_id = current_request_org());

CREATE POLICY "Users can create conversations in their organization"
  ON public.conversations FOR INSERT
  WITH CHECK (org_id = current_request_org());

CREATE POLICY "Users can update their organization's conversations"
  ON public.conversations FOR UPDATE
  USING (org_id = current_request_org());

CREATE POLICY "Users can delete their organization's conversations"
  ON public.conversations FOR DELETE
  USING (org_id = current_request_org());

-- Create RLS policies for conversation_events
CREATE POLICY "Users can view events from their organization's conversations"
  ON public.conversation_events FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE org_id = current_request_org()
    )
  );

CREATE POLICY "Users can create events in their organization's conversations"
  ON public.conversation_events FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE org_id = current_request_org()
    )
  );

-- Create RLS policies for tool_results
CREATE POLICY "Users can view tool results from their organization's conversations"
  ON public.tool_results FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM public.conversation_events e
      JOIN public.conversations c ON e.conversation_id = c.id
      WHERE c.org_id = current_request_org()
    )
  );

CREATE POLICY "Users can create tool results in their organization's conversations"
  ON public.tool_results FOR INSERT
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM public.conversation_events e
      JOIN public.conversations c ON e.conversation_id = c.id
      WHERE c.org_id = current_request_org()
    )
  );

-- Create function to update conversations.updated_at on event insertion
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update conversation timestamp
CREATE TRIGGER trigger_update_conversation_timestamp
  AFTER INSERT ON public.conversation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_timestamp();

COMMIT;
