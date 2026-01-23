-- =====================================================
-- ADD RLS POLICIES FOR AUTHENTICATED USERS
-- Fixes: Authenticated users cannot access their own data
-- =====================================================

-- Helper function to get user's organization IDs based on auth.uid()
-- This is used in RLS policies to check organization membership
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM organization_members om
  INNER JOIN users u ON u.id = om.user_id
  WHERE u.auth_id = auth.uid();
$$;

-- Helper function to get user's internal ID based on auth.uid()
CREATE OR REPLACE FUNCTION public.get_internal_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- =====================================================
-- USERS TABLE POLICIES
-- =====================================================

-- Authenticated users can view their own user record
CREATE POLICY authenticated_users_select ON users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

-- Authenticated users can update their own user record
CREATE POLICY authenticated_users_update ON users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- =====================================================
-- ORGANIZATIONS TABLE POLICIES
-- =====================================================

-- Authenticated users can view organizations they are members of
CREATE POLICY authenticated_organizations_select ON organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT get_user_org_ids()));

-- =====================================================
-- ORGANIZATION_MEMBERS TABLE POLICIES
-- =====================================================

-- Authenticated users can view their own memberships
CREATE POLICY authenticated_org_members_select ON organization_members
  FOR SELECT TO authenticated
  USING (user_id = get_internal_user_id());

-- =====================================================
-- DOCUMENTS TABLE POLICIES
-- =====================================================

-- Authenticated users can view documents in their organizations
CREATE POLICY authenticated_documents_select ON documents
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- Authenticated users can insert documents in their organizations
CREATE POLICY authenticated_documents_insert ON documents
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

-- Authenticated users can update documents in their organizations
CREATE POLICY authenticated_documents_update ON documents
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

-- Authenticated users can delete documents in their organizations
CREATE POLICY authenticated_documents_delete ON documents
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- DOCUMENT_CHUNKS TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_document_chunks_select ON document_chunks
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_document_chunks_insert ON document_chunks
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_document_chunks_update ON document_chunks
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_document_chunks_delete ON document_chunks
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- SPACES TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_spaces_select ON spaces
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_spaces_insert ON spaces
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_spaces_update ON spaces
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_spaces_delete ON spaces
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- MEMORIES TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_memories_select ON memories
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_memories_insert ON memories
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_memories_update ON memories
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_memories_delete ON memories
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- CANVAS_POSITIONS TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_canvas_positions_select ON canvas_positions
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_positions_insert ON canvas_positions
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_positions_update ON canvas_positions
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_positions_delete ON canvas_positions
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- CANVAS_STATES TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_canvas_states_select ON canvas_states
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_states_insert ON canvas_states
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_states_update ON canvas_states
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_states_delete ON canvas_states
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- CANVAS_PROJECTS TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_canvas_projects_select ON canvas_projects
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_projects_insert ON canvas_projects
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_projects_update ON canvas_projects
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_canvas_projects_delete ON canvas_projects
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- CONVERSATIONS TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_conversations_select ON conversations
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_conversations_insert ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_conversations_update ON conversations
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_conversations_delete ON conversations
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- CONVERSATION_EVENTS TABLE POLICIES
-- (Access through conversation ownership)
-- =====================================================

CREATE POLICY authenticated_conversation_events_select ON conversation_events
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE org_id IN (SELECT get_user_org_ids())
    )
  );

CREATE POLICY authenticated_conversation_events_insert ON conversation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE org_id IN (SELECT get_user_org_ids())
    )
  );

CREATE POLICY authenticated_conversation_events_update ON conversation_events
  FOR UPDATE TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE org_id IN (SELECT get_user_org_ids())
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE org_id IN (SELECT get_user_org_ids())
    )
  );

CREATE POLICY authenticated_conversation_events_delete ON conversation_events
  FOR DELETE TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE org_id IN (SELECT get_user_org_ids())
    )
  );

-- =====================================================
-- TOOL_RESULTS TABLE POLICIES
-- (Access through conversation_events ownership)
-- =====================================================

CREATE POLICY authenticated_tool_results_select ON tool_results
  FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT ce.id FROM conversation_events ce
      INNER JOIN conversations c ON c.id = ce.conversation_id
      WHERE c.org_id IN (SELECT get_user_org_ids())
    )
  );

CREATE POLICY authenticated_tool_results_insert ON tool_results
  FOR INSERT TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT ce.id FROM conversation_events ce
      INNER JOIN conversations c ON c.id = ce.conversation_id
      WHERE c.org_id IN (SELECT get_user_org_ids())
    )
  );

-- =====================================================
-- EVENTS TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_events_select ON events
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_events_insert ON events
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- INGESTION_JOBS TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_ingestion_jobs_select ON ingestion_jobs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_ingestion_jobs_insert ON ingestion_jobs
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_ingestion_jobs_update ON ingestion_jobs
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- SESSIONS TABLE POLICIES
-- (Users can only access their own sessions)
-- =====================================================

CREATE POLICY authenticated_sessions_select ON sessions
  FOR SELECT TO authenticated
  USING (user_id = get_internal_user_id());

CREATE POLICY authenticated_sessions_insert ON sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = get_internal_user_id());

CREATE POLICY authenticated_sessions_delete ON sessions
  FOR DELETE TO authenticated
  USING (user_id = get_internal_user_id());

-- =====================================================
-- CONNECTIONS TABLE POLICIES
-- =====================================================

CREATE POLICY authenticated_connections_select ON connections
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_connections_insert ON connections
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_connections_update ON connections
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY authenticated_connections_delete ON connections
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- =====================================================
-- GRANT NECESSARY PERMISSIONS
-- =====================================================

-- Grant execute on helper functions to authenticated role
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_user_id() TO authenticated;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
