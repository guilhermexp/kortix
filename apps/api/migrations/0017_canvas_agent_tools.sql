-- Canvas agent tooling support:
-- 1) optimistic versioning on canvases
-- 2) checkpoints for iterative restore/edit flow
-- 3) operations audit trail

ALTER TABLE canvases
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS canvas_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES spaces(id) ON DELETE SET NULL,
  snapshot_content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_checkpoints_canvas_id
  ON canvas_checkpoints(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_checkpoints_user_id
  ON canvas_checkpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_checkpoints_created_at
  ON canvas_checkpoints(created_at DESC);

ALTER TABLE canvas_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own canvas checkpoints"
  ON canvas_checkpoints FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own canvas checkpoints"
  ON canvas_checkpoints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own canvas checkpoints"
  ON canvas_checkpoints FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS canvas_ops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  checkpoint_id UUID REFERENCES canvas_checkpoints(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  base_version INTEGER,
  result_version INTEGER,
  ops_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_ops_canvas_id
  ON canvas_ops(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_ops_user_id
  ON canvas_ops(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_ops_created_at
  ON canvas_ops(created_at DESC);

ALTER TABLE canvas_ops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own canvas ops"
  ON canvas_ops FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own canvas ops"
  ON canvas_ops FOR INSERT
  WITH CHECK (auth.uid() = user_id);
