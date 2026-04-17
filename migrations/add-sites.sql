-- Site/location foundations: sites table, inventory_items.site_id, default site backfill.
-- Idempotent-ish: safe to re-run after partial apply (check logs if NOT NULL fails).

CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sites_company_id_idx ON sites(company_id);

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id);

INSERT INTO sites (name, slug)
SELECT 'Principal', 'default'
WHERE NOT EXISTS (SELECT 1 FROM sites WHERE slug = 'default');

UPDATE inventory_items
SET site_id = (SELECT id FROM sites WHERE slug = 'default' LIMIT 1)
WHERE site_id IS NULL;

CREATE OR REPLACE FUNCTION default_site_id() RETURNS INTEGER AS $$
  SELECT id FROM sites WHERE slug = 'default' LIMIT 1;
$$ LANGUAGE SQL STABLE;

ALTER TABLE inventory_items ALTER COLUMN site_id SET DEFAULT default_site_id();

ALTER TABLE inventory_items ALTER COLUMN site_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_items_site_id_idx ON inventory_items(site_id);
