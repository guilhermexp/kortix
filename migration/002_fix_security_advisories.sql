-- =====================================================
-- SECURITY FIX MIGRATION
-- Fixes: function_search_path_mutable, rls_policy_always_true
-- =====================================================

-- 1. Create extensions schema if not exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. Fix handle_new_auth_user function search_path
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'handle_new_auth_user'
        AND pronamespace = 'public'::regnamespace
    ) THEN
        DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;
    END IF;
END $$;

-- Recreate the function with proper search_path
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_user_id UUID;
    new_org_id UUID;
    org_slug TEXT;
BEGIN
    INSERT INTO public.users (email, name, auth_id)
    VALUES (
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.id
    )
    RETURNING id INTO new_user_id;

    org_slug := 'personal-' || REPLACE(new_user_id::text, '-', '');

    INSERT INTO public.organizations (slug, name)
    VALUES (org_slug, 'Personal')
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role, is_owner)
    VALUES (new_org_id, new_user_id, 'owner', true);

    RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. Fix RLS policies - restrict to service_role only

-- Users
DROP POLICY IF EXISTS "Service role has full access to users" ON users;
CREATE POLICY service_role_users ON users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Organizations
DROP POLICY IF EXISTS "Service role has full access to organizations" ON organizations;
CREATE POLICY service_role_organizations ON organizations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Organization members
DROP POLICY IF EXISTS "Service role has full access to organization_members" ON organization_members;
CREATE POLICY service_role_organization_members ON organization_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Spaces
DROP POLICY IF EXISTS "Service role has full access to spaces" ON spaces;
CREATE POLICY service_role_spaces ON spaces FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Documents
DROP POLICY IF EXISTS "Service role has full access to documents" ON documents;
CREATE POLICY service_role_documents ON documents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Document chunks
DROP POLICY IF EXISTS "Service role has full access to document_chunks" ON document_chunks;
CREATE POLICY service_role_document_chunks ON document_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Memories
DROP POLICY IF EXISTS "Service role has full access to memories" ON memories;
CREATE POLICY service_role_memories ON memories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Canvas positions
DROP POLICY IF EXISTS "Service role has full access to canvas_positions" ON canvas_positions;
CREATE POLICY service_role_canvas_positions ON canvas_positions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Canvas states
DROP POLICY IF EXISTS "Service role has full access to canvas_states" ON canvas_states;
CREATE POLICY service_role_canvas_states ON canvas_states FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Canvas projects
DROP POLICY IF EXISTS "Service role has full access to canvas_projects" ON canvas_projects;
CREATE POLICY service_role_canvas_projects ON canvas_projects FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Conversations
DROP POLICY IF EXISTS "Service role has full access to conversations" ON conversations;
CREATE POLICY service_role_conversations ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Conversation events
DROP POLICY IF EXISTS "Service role has full access to conversation_events" ON conversation_events;
CREATE POLICY service_role_conversation_events ON conversation_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tool results
DROP POLICY IF EXISTS "Service role has full access to tool_results" ON tool_results;
CREATE POLICY service_role_tool_results ON tool_results FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Events
DROP POLICY IF EXISTS "Service role has full access to events" ON events;
CREATE POLICY service_role_events ON events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Ingestion jobs
DROP POLICY IF EXISTS "Service role has full access to ingestion_jobs" ON ingestion_jobs;
CREATE POLICY service_role_ingestion_jobs ON ingestion_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Sessions
DROP POLICY IF EXISTS "Service role has full access to sessions" ON sessions;
CREATE POLICY service_role_sessions ON sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Connections
DROP POLICY IF EXISTS "Service role has full access to connections" ON connections;
CREATE POLICY service_role_connections ON connections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

-- NOTE: Enable "Leaked password protection" manually in
-- Supabase Dashboard > Authentication > Settings
