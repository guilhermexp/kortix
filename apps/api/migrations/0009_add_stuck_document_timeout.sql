-- Migration: Add automatic timeout for stuck documents
-- Date: 2025-11-04
-- Purpose: Prevent documents from being stuck in processing states indefinitely

-- Function to mark stuck documents as failed
-- A document is considered stuck if it's been in a processing state for more than 5 minutes
CREATE OR REPLACE FUNCTION mark_stuck_documents_as_failed()
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
  timeout_minutes INTEGER := 5;
BEGIN
  -- Update documents stuck in processing states
  UPDATE documents
  SET
    status = 'failed',
    updated_at = NOW()
  WHERE
    status IN ('extracting', 'processing', 'embedding', 'fetching')
    AND updated_at < NOW() - (timeout_minutes || ' minutes')::INTERVAL
    AND status != 'failed';

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  -- Log the action
  RAISE NOTICE 'Marked % stuck documents as failed (timeout: % minutes)', affected_count, timeout_minutes;

  RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run this every minute (if pg_cron is available)
-- Note: This requires the pg_cron extension to be enabled
-- If pg_cron is not available, this can be called from the application layer

-- Add comment to the function
COMMENT ON FUNCTION mark_stuck_documents_as_failed() IS
  'Automatically marks documents stuck in processing states as failed after 5 minutes of inactivity';

-- Example: To manually run this function
-- SELECT mark_stuck_documents_as_failed();

-- Example: To check for stuck documents without updating
-- SELECT id, title, status, created_at, updated_at,
--        EXTRACT(EPOCH FROM (NOW() - updated_at)) as seconds_stuck
-- FROM documents
-- WHERE status IN ('extracting', 'processing', 'embedding', 'fetching')
--   AND updated_at < NOW() - INTERVAL '5 minutes';
