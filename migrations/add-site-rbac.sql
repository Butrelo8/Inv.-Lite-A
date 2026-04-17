-- Per-site role templates and user grants (see DECISIONS.md, SITE_RBAC_ENABLED).

CREATE TABLE IF NOT EXISTS role_templates (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb
);

INSERT INTO role_templates (id, key, display_name, capabilities) VALUES
  (1, 'site_viewer', 'Visor de sitio', '["inventory:read"]'::jsonb),
  (2, 'site_editor', 'Editor de sitio', '["inventory:read","inventory:write","assignments:manage"]'::jsonb),
  (3, 'site_manager', 'Gestor de sitio', '["inventory:read","inventory:write","assignments:manage","employees:read","reports:site"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('role_templates', 'id'),
  COALESCE((SELECT MAX(id) FROM role_templates), 1)
);

CREATE TABLE IF NOT EXISTS user_site_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES role_templates(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, site_id)
);

CREATE INDEX IF NOT EXISTS user_site_roles_user_id_idx ON user_site_roles (user_id);
