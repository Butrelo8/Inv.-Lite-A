CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id serial PRIMARY KEY,
  item_id integer NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  schedule_type text NOT NULL,
  title text NOT NULL,
  interval_days integer NOT NULL,
  start_date date NOT NULL,
  next_due_at date NOT NULL,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_schedules_item_type_active_idx
  ON maintenance_schedules (item_id, schedule_type)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS maintenance_schedules_next_due_idx
  ON maintenance_schedules (next_due_at);

CREATE TABLE IF NOT EXISTS maintenance_events (
  id serial PRIMARY KEY,
  schedule_id integer NOT NULL REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
  performed_at date NOT NULL,
  condition_result text,
  notes text NOT NULL,
  evidence_url text,
  completed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_events_schedule_idx
  ON maintenance_events (schedule_id, performed_at DESC);
