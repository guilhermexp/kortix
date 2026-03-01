-- Tabela document_attachments
CREATE TABLE IF NOT EXISTS public.document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  user_id UUID,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  content_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_attachments_doc_id ON public.document_attachments(document_id);
CREATE INDEX idx_doc_attachments_org_id ON public.document_attachments(org_id);

ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_attachments" ON public.document_attachments FOR SELECT USING (true);
CREATE POLICY "insert_attachments" ON public.document_attachments FOR INSERT WITH CHECK (true);
CREATE POLICY "delete_attachments" ON public.document_attachments FOR DELETE USING (true);

-- Bucket (privado, 50MB, qualquer MIME type)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('document-attachments', 'document-attachments', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "read_doc_attachments"
  ON storage.objects FOR SELECT USING (bucket_id = 'document-attachments');
CREATE POLICY "insert_doc_attachments"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'document-attachments');
CREATE POLICY "update_doc_attachments"
  ON storage.objects FOR UPDATE USING (bucket_id = 'document-attachments');
CREATE POLICY "delete_doc_attachments"
  ON storage.objects FOR DELETE USING (bucket_id = 'document-attachments');
