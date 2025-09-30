-- Helper functions to read organization and user identifiers from request headers
CREATE OR REPLACE FUNCTION public.current_request_org()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
  org_id uuid;
BEGIN
  raw := current_setting('request.headers.x-supermemory-organization', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    org_id := raw::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_request_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
  user_id uuid;
BEGIN
  raw := current_setting('request.headers.x-supermemory-user', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    user_id := raw::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN user_id;
END;
$$;

-- Organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_authenticated ON public.organizations;
CREATE POLICY organizations_select_authenticated
ON public.organizations
FOR SELECT
TO authenticated, anon
USING (id = public.current_request_org());

DROP POLICY IF EXISTS organizations_service_role_all ON public.organizations;
CREATE POLICY organizations_service_role_all
ON public.organizations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Organization members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_members_select_authenticated ON public.organization_members;
CREATE POLICY organization_members_select_authenticated
ON public.organization_members
FOR SELECT
TO authenticated, anon
USING (organization_id = public.current_request_org());

DROP POLICY IF EXISTS organization_members_insert_authenticated ON public.organization_members;
CREATE POLICY organization_members_insert_authenticated
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.current_request_org());

DROP POLICY IF EXISTS organization_members_update_authenticated ON public.organization_members;
CREATE POLICY organization_members_update_authenticated
ON public.organization_members
FOR UPDATE
TO authenticated
USING (organization_id = public.current_request_org())
WITH CHECK (organization_id = public.current_request_org());

DROP POLICY IF EXISTS organization_members_service_role_all ON public.organization_members;
CREATE POLICY organization_members_service_role_all
ON public.organization_members
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Spaces / projects
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spaces_select_authenticated ON public.spaces;
CREATE POLICY spaces_select_authenticated
ON public.spaces
FOR SELECT
TO authenticated, anon
USING (organization_id = public.current_request_org());

DROP POLICY IF EXISTS spaces_insert_authenticated ON public.spaces;
CREATE POLICY spaces_insert_authenticated
ON public.spaces
FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.current_request_org());

DROP POLICY IF EXISTS spaces_update_authenticated ON public.spaces;
CREATE POLICY spaces_update_authenticated
ON public.spaces
FOR UPDATE
TO authenticated
USING (organization_id = public.current_request_org())
WITH CHECK (organization_id = public.current_request_org());

DROP POLICY IF EXISTS spaces_service_role_all ON public.spaces;
CREATE POLICY spaces_service_role_all
ON public.spaces
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_select_authenticated ON public.documents;
CREATE POLICY documents_select_authenticated
ON public.documents
FOR SELECT
TO authenticated, anon
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS documents_insert_authenticated ON public.documents;
CREATE POLICY documents_insert_authenticated
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS documents_update_authenticated ON public.documents;
CREATE POLICY documents_update_authenticated
ON public.documents
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS documents_delete_authenticated ON public.documents;
CREATE POLICY documents_delete_authenticated
ON public.documents
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS documents_service_role_all ON public.documents;
CREATE POLICY documents_service_role_all
ON public.documents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Document chunks
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_chunks_select_authenticated ON public.document_chunks;
CREATE POLICY document_chunks_select_authenticated
ON public.document_chunks
FOR SELECT
TO authenticated, anon
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS document_chunks_insert_authenticated ON public.document_chunks;
CREATE POLICY document_chunks_insert_authenticated
ON public.document_chunks
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS document_chunks_update_authenticated ON public.document_chunks;
CREATE POLICY document_chunks_update_authenticated
ON public.document_chunks
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS document_chunks_delete_authenticated ON public.document_chunks;
CREATE POLICY document_chunks_delete_authenticated
ON public.document_chunks
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS document_chunks_service_role_all ON public.document_chunks;
CREATE POLICY document_chunks_service_role_all
ON public.document_chunks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Documents to spaces (join table)
ALTER TABLE public.documents_to_spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_to_spaces_select_authenticated ON public.documents_to_spaces;
CREATE POLICY documents_to_spaces_select_authenticated
ON public.documents_to_spaces
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM public.spaces s
    WHERE s.id = documents_to_spaces.space_id
      AND s.organization_id = public.current_request_org()
  )
);

DROP POLICY IF EXISTS documents_to_spaces_insert_authenticated ON public.documents_to_spaces;
CREATE POLICY documents_to_spaces_insert_authenticated
ON public.documents_to_spaces
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.spaces s
    WHERE s.id = documents_to_spaces.space_id
      AND s.organization_id = public.current_request_org()
  )
);

DROP POLICY IF EXISTS documents_to_spaces_delete_authenticated ON public.documents_to_spaces;
CREATE POLICY documents_to_spaces_delete_authenticated
ON public.documents_to_spaces
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.spaces s
    WHERE s.id = documents_to_spaces.space_id
      AND s.organization_id = public.current_request_org()
  )
);

DROP POLICY IF EXISTS documents_to_spaces_service_role_all ON public.documents_to_spaces;
CREATE POLICY documents_to_spaces_service_role_all
ON public.documents_to_spaces
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Memories
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memories_select_authenticated ON public.memories;
CREATE POLICY memories_select_authenticated
ON public.memories
FOR SELECT
TO authenticated, anon
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS memories_insert_authenticated ON public.memories;
CREATE POLICY memories_insert_authenticated
ON public.memories
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS memories_update_authenticated ON public.memories;
CREATE POLICY memories_update_authenticated
ON public.memories
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS memories_delete_authenticated ON public.memories;
CREATE POLICY memories_delete_authenticated
ON public.memories
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS memories_service_role_all ON public.memories;
CREATE POLICY memories_service_role_all
ON public.memories
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Connections
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connections_select_authenticated ON public.connections;
CREATE POLICY connections_select_authenticated
ON public.connections
FOR SELECT
TO authenticated, anon
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS connections_insert_authenticated ON public.connections;
CREATE POLICY connections_insert_authenticated
ON public.connections
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS connections_update_authenticated ON public.connections;
CREATE POLICY connections_update_authenticated
ON public.connections
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS connections_delete_authenticated ON public.connections;
CREATE POLICY connections_delete_authenticated
ON public.connections
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS connections_service_role_all ON public.connections;
CREATE POLICY connections_service_role_all
ON public.connections
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Connection states
ALTER TABLE public.connection_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connection_states_select_authenticated ON public.connection_states;
CREATE POLICY connection_states_select_authenticated
ON public.connection_states
FOR SELECT
TO authenticated, anon
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS connection_states_insert_authenticated ON public.connection_states;
CREATE POLICY connection_states_insert_authenticated
ON public.connection_states
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS connection_states_delete_authenticated ON public.connection_states;
CREATE POLICY connection_states_delete_authenticated
ON public.connection_states
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS connection_states_service_role_all ON public.connection_states;
CREATE POLICY connection_states_service_role_all
ON public.connection_states
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ingestion jobs
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_jobs_select_authenticated ON public.ingestion_jobs;
CREATE POLICY ingestion_jobs_select_authenticated
ON public.ingestion_jobs
FOR SELECT
TO authenticated, anon
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS ingestion_jobs_insert_authenticated ON public.ingestion_jobs;
CREATE POLICY ingestion_jobs_insert_authenticated
ON public.ingestion_jobs
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS ingestion_jobs_update_authenticated ON public.ingestion_jobs;
CREATE POLICY ingestion_jobs_update_authenticated
ON public.ingestion_jobs
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS ingestion_jobs_service_role_all ON public.ingestion_jobs;
CREATE POLICY ingestion_jobs_service_role_all
ON public.ingestion_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
