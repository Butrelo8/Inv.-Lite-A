CREATE TABLE IF NOT EXISTS inventory_assignments (
  id serial PRIMARY KEY,
  item_id integer NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  assignee text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  condition_at_assign text,
  notes text,
  assigned_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  returned_at timestamptz,
  return_condition text,
  return_notes text,
  returned_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_assignments_active_item_idx
  ON inventory_assignments (item_id)
  WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS inventory_assignments_item_assigned_idx
  ON inventory_assignments (item_id, assigned_at DESC);
