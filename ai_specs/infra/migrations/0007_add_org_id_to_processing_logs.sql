-- Add org_id column to processing_logs for direct RLS filtering
-- Instead of relying on JOIN with ingestion_jobs, we'll have direct org_id

-- Add org_id column
ALTER TABLE public.processing_logs
ADD COLUMN org_id uuid NOT NULL DEFAULT (
  SELECT org_id FROM public.ingestion_jobs
  WHERE id = processing_logs.job_id
);

-- Add foreign key constraint
ALTER TABLE public.processing_logs
ADD CONSTRAINT processing_logs_org_id_fkey
FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Update RLS policy to use direct org_id (simpler and more efficient)
DROP POLICY IF EXISTS processing_logs_select_authenticated ON public.processing_logs;
CREATE POLICY processing_logs_select_authenticated
ON public.processing_logs
FOR SELECT
TO authenticated
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS processing_logs_insert_authenticated ON public.processing_logs;
CREATE POLICY processing_logs_insert_authenticated
ON public.processing_logs
FOR INSERT
TO authenticated
WITH CHECK (org_id = public.current_request_org());

DROP POLICY IF EXISTS processing_logs_delete_authenticated ON public.processing_logs;
CREATE POLICY processing_logs_delete_authenticated
ON public.processing_logs
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

-- Create index for better performance on org_id queries
CREATE INDEX IF NOT EXISTS idx_processing_logs_org_id
ON public.processing_logs(org_id);

-- Create index on job_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_processing_logs_job_id
ON public.processing_logs(job_id);
