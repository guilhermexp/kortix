-- Migration: Fix RLS policies for conversations tables
-- Allow service_role to bypass RLS restrictions

BEGIN;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their organization's conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their organization's conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete their organization's conversations" ON public.conversations;

DROP POLICY IF EXISTS "Users can view events from their organization's conversations" ON public.conversation_events;
DROP POLICY IF EXISTS "Users can create events in their organization's conversations" ON public.conversation_events;

DROP POLICY IF EXISTS "Users can view tool results from their organization's conversations" ON public.tool_results;
DROP POLICY IF EXISTS "Users can create tool results in their organization's conversations" ON public.tool_results;

-- Create new policies that allow postgres role (service_role_key uses postgres role)
-- Note: Supabase service_role_key connects as 'postgres' role, not 'service_role'
CREATE POLICY "postgres_full_access_conversations"
  ON public.conversations
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);

CREATE POLICY "postgres_full_access_conversation_events"
  ON public.conversation_events
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);

CREATE POLICY "postgres_full_access_tool_results"
  ON public.tool_results
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);

COMMIT;
