CREATE TABLE IF NOT EXISTS ops_events (
  id serial PRIMARY KEY,
  event_type text NOT NULL,
  severity text NOT NULL,
  source text NOT NULL DEFAULT 'api',
  environment text NOT NULL DEFAULT 'development',
  payload jsonb,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  ip text,
  request_id text,
  endpoint text,
  method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_events_event_type_created_at_idx
  ON ops_events (event_type, created_at);

CREATE INDEX IF NOT EXISTS ops_events_created_at_idx
  ON ops_events (created_at);

CREATE INDEX IF NOT EXISTS ops_events_severity_created_at_idx
  ON ops_events (severity, created_at);
