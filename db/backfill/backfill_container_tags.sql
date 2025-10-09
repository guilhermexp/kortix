-- Backfill containerTags into documents.metadata based on spaces mapping
-- Run this in Supabase SQL Editor. Replace <ORG_ID> if you want to limit to one org.

-- Optional: set your organization id to scope the update
-- DO $$ BEGIN PERFORM 1; END $$;

UPDATE documents d
SET metadata = coalesce(d.metadata, '{}'::jsonb)
  || jsonb_build_object(
       'containerTags',
       (
         SELECT jsonb_agg(s.container_tag)
         FROM documents_to_spaces ds
         JOIN spaces s ON s.id = ds.space_id
         WHERE ds.document_id = d.id
       )
     )
WHERE
  -- Uncomment AND set your org id if needed:
  -- d.org_id = '<ORG_ID>' AND
  (
    d.metadata IS NULL
    OR (d.metadata->'containerTags') IS NULL
  );

-- Verify
-- SELECT id, metadata->'containerTags' AS tags FROM documents WHERE org_id = '<ORG_ID>' LIMIT 50;

