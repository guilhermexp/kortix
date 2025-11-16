-- ============================================================================
-- Migration 0004: Normalize legacy document statuses to current enum
-- - fetching   -> extracting
-- - processing -> embedding
-- This aligns existing rows with the allowed values used by the API schemas.
-- ============================================================================

BEGIN;

-- Normalize legacy statuses on documents
UPDATE documents SET status = 'extracting' WHERE status = 'fetching';
UPDATE documents SET status = 'embedding' WHERE status = 'processing';

COMMIT;

