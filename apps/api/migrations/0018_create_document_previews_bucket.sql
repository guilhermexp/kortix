-- Migration: Create document-previews storage bucket
-- Purpose: Store preview images locally instead of relying on external URLs
--          that may rate-limit (GitHub 429), expire, or become unavailable.

-- 1. Create the bucket (public, 5MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-previews',
  'document-previews',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Public read access (anyone can view preview images)
CREATE POLICY IF NOT EXISTS "Public read access for document previews"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'document-previews');

-- 3. Service role write access (only backend can upload)
CREATE POLICY IF NOT EXISTS "Service role write access for document previews"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'document-previews');

CREATE POLICY IF NOT EXISTS "Service role update access for document previews"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'document-previews');

CREATE POLICY IF NOT EXISTS "Service role delete access for document previews"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'document-previews');
