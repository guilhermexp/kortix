-- Add missing RLS policies for multi-tenant security
-- This migration addresses security gaps in tables that were missing Row Level Security

-- users table - restrict to organization members only
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated
ON public.users
FOR SELECT
TO authenticated
USING (
  -- Users can see other users in their organization
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = users.id
      AND om.organization_id = public.current_request_org()
  )
  OR
  -- Or see themselves
  id = public.current_request_user()
);

-- sessions table - restrict by organization_id
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_select_authenticated ON public.sessions;
CREATE POLICY sessions_select_authenticated
ON public.sessions
FOR SELECT
TO authenticated
USING (organization_id = public.current_request_org());

DROP POLICY IF EXISTS sessions_insert_authenticated ON public.sessions;
CREATE POLICY sessions_insert_authenticated
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.current_request_org());

DROP POLICY IF EXISTS sessions_update_authenticated ON public.sessions;
CREATE POLICY sessions_update_authenticated
ON public.sessions
FOR UPDATE
TO authenticated
USING (organization_id = public.current_request_org())
WITH CHECK (organization_id = public.current_request_org());

DROP POLICY IF EXISTS sessions_delete_authenticated ON public.sessions;
CREATE POLICY sessions_delete_authenticated
ON public.sessions
FOR DELETE
TO authenticated
USING (organization_id = public.current_request_org());

-- organization_settings table - restrict by org_id
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_settings_select_authenticated ON public.organization_settings;
CREATE POLICY organization_settings_select_authenticated
ON public.organization_settings
FOR SELECT
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS organization_settings_insert_authenticated ON public.organization_settings;
CREATE POLICY organization_settings_insert_authenticated
ON public.organization_settings
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS organization_settings_update_authenticated ON public.organization_settings;
CREATE POLICY organization_settings_update_authenticated
ON public.organization_settings
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS organization_settings_delete_authenticated ON public.organization_settings;
CREATE POLICY organization_settings_delete_authenticated
ON public.organization_settings
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

-- memory_relationships table - restrict by org_id
ALTER TABLE public.memory_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memory_relationships_select_authenticated ON public.memory_relationships;
CREATE POLICY memory_relationships_select_authenticated
ON public.memory_relationships
FOR SELECT
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS memory_relationships_insert_authenticated ON public.memory_relationships;
CREATE POLICY memory_relationships_insert_authenticated
ON public.memory_relationships
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS memory_relationships_update_authenticated ON public.memory_relationships;
CREATE POLICY memory_relationships_update_authenticated
ON public.memory_relationships
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS memory_relationships_delete_authenticated ON public.memory_relationships;
CREATE POLICY memory_relationships_delete_authenticated
ON public.memory_relationships
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

-- api_requests table - restrict by org_id
ALTER TABLE public.api_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_requests_select_authenticated ON public.api_requests;
CREATE POLICY api_requests_select_authenticated
ON public.api_requests
FOR SELECT
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS api_requests_insert_authenticated ON public.api_requests;
CREATE POLICY api_requests_insert_authenticated
ON public.api_requests
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS api_requests_update_authenticated ON public.api_requests;
CREATE POLICY api_requests_update_authenticated
ON public.api_requests
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

-- processing_logs table - restrict via ingestion_jobs relationship
-- This table references job_id (FK to ingestion_jobs) which has org_id
ALTER TABLE public.processing_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processing_logs_select_authenticated ON public.processing_logs;
CREATE POLICY processing_logs_select_authenticated
ON public.processing_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ingestion_jobs ij
    WHERE ij.id = processing_logs.job_id
      AND ij.org_id = public.current_request_org()
  )
);

DROP POLICY IF EXISTS processing_logs_insert_authenticated ON public.processing_logs;
CREATE POLICY processing_logs_insert_authenticated
ON public.processing_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ingestion_jobs ij
    WHERE ij.id = processing_logs.job_id
      AND ij.org_id = public.current_request_org()
  )
);

DROP POLICY IF EXISTS processing_logs_delete_authenticated ON public.processing_logs;
CREATE POLICY processing_logs_delete_authenticated
ON public.processing_logs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ingestion_jobs ij
    WHERE ij.id = processing_logs.job_id
      AND ij.org_id = public.current_request_org()
  )
);

-- Allow service_role to bypass all policies (for worker processes)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_logs ENABLE ROW LEVEL SECURITY;
