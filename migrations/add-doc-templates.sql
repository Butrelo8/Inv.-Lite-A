-- Dynamic document templates for modular PDF/DOCX generation (Handlebars HTML).
CREATE TABLE IF NOT EXISTS doc_templates (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  body_html TEXT NOT NULL,
  header_html TEXT,
  footer_html TEXT,
  css_styles TEXT,
  variables JSONB NOT NULL,
  page_config JSONB,
  category TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS doc_templates_category_idx ON doc_templates (category);
CREATE INDEX IF NOT EXISTS doc_templates_active_idx ON doc_templates (active);
