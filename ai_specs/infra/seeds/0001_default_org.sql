INSERT INTO organizations (slug, name)
VALUES ('default', 'Default Organization')
ON CONFLICT (slug) DO NOTHING;

WITH org AS (
  SELECT id FROM organizations WHERE slug = 'default' LIMIT 1
)
INSERT INTO users (email, name)
SELECT 'admin@local.host', 'Admin User'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@local.host');

WITH org AS (
  SELECT id FROM organizations WHERE slug = 'default' LIMIT 1
), usr AS (
  SELECT id FROM users WHERE email = 'admin@local.host' LIMIT 1
)
INSERT INTO organization_members (organization_id, user_id, role, is_owner)
SELECT org.id, usr.id, 'owner', true FROM org, usr
ON CONFLICT (organization_id, user_id) DO NOTHING;

WITH org AS (
  SELECT id FROM organizations WHERE slug = 'default' LIMIT 1
)
INSERT INTO spaces (organization_id, container_tag, name)
SELECT org.id, 'sm_project_default', 'Default Project'
FROM org
WHERE NOT EXISTS (
  SELECT 1 FROM spaces WHERE container_tag = 'sm_project_default'
);
