CREATE TABLE IF NOT EXISTS inventory_bulk_undo (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  action_type text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_bulk_undo_token_idx
  ON inventory_bulk_undo (token);

CREATE INDEX IF NOT EXISTS inventory_bulk_undo_expires_at_idx
  ON inventory_bulk_undo (expires_at);

