-- Migration: Add is_fixed column to spaces and create 7 fixed projects
-- Fixed projects act as auto-routing fallback when user doesn't specify a project

-- Add is_fixed column
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT false;

-- Upsert 7 fixed projects (uses org_id from default org)
WITH org AS (SELECT id FROM organizations WHERE slug = 'default' LIMIT 1)
INSERT INTO spaces (org_id, container_tag, name, is_fixed) VALUES
  ((SELECT id FROM org), 'sm_project_youtube', 'Youtube', true),
  ((SELECT id FROM org), 'sm_project_twitter_bookmarks', 'Bookmarks/X', true),
  ((SELECT id FROM org), 'sm_project_skills', 'Skills', true),
  ((SELECT id FROM org), 'sm_project_rich_markdown', 'Rich Markdown', true),
  ((SELECT id FROM org), 'sm_project_github', 'Github', true),
  ((SELECT id FROM org), 'sm_project_pdf', 'PDF', true),
  ((SELECT id FROM org), 'sm_project_audio', 'Audio', true)
ON CONFLICT (org_id, container_tag)
DO UPDATE SET is_fixed = true, name = EXCLUDED.name;
