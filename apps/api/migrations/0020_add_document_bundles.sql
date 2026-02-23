-- Add bundle support: parent_id links child documents to a parent bundle document
-- child_order preserves the order of items within a bundle

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS child_order INTEGER;

-- Fast lookup of children for a given parent
CREATE INDEX IF NOT EXISTS idx_documents_parent_id
  ON documents(parent_id) WHERE parent_id IS NOT NULL;

-- Efficient listing of top-level documents (excludes children)
CREATE INDEX IF NOT EXISTS idx_documents_org_no_parent
  ON documents(org_id, created_at DESC) WHERE parent_id IS NULL;
