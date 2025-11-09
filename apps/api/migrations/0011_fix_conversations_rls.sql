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

-- Create new policies that allow service_role bypass
-- Conversations
CREATE POLICY "Allow service_role full access to conversations"
  ON public.conversations
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view their organization's conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM public.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create conversations in their organization"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (
    SELECT org_id FROM public.users WHERE id = auth.uid()
  ));

-- Conversation Events
CREATE POLICY "Allow service_role full access to conversation_events"
  ON public.conversation_events
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view events from their organization's conversations"
  ON public.conversation_events FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      JOIN public.users u ON c.org_id = u.org_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Users can create events in their organization's conversations"
  ON public.conversation_events FOR INSERT
  TO authenticated
  WITH CHECK (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      JOIN public.users u ON c.org_id = u.org_id
      WHERE u.id = auth.uid()
    )
  );

-- Tool Results
CREATE POLICY "Allow service_role full access to tool_results"
  ON public.tool_results
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view tool results from their organization's conversations"
  ON public.tool_results FOR SELECT
  TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM public.conversation_events e
      JOIN public.conversations c ON e.conversation_id = c.id
      JOIN public.users u ON c.org_id = u.org_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Users can create tool results in their organization's conversations"
  ON public.tool_results FOR INSERT
  TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM public.conversation_events e
      JOIN public.conversations c ON e.conversation_id = c.id
      JOIN public.users u ON c.org_id = u.org_id
      WHERE u.id = auth.uid()
    )
  );

COMMIT;
