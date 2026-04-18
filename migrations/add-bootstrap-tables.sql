-- Reconciliation migration for the three "bootstrap" tables that live in the app's
-- startup code (server/auth.ts, server/rate-limiter.ts, server/ops-events.ts).
-- Safe to apply against:
--   (a) a fresh database — creates the tables and indexes;
--   (b) an existing database that already has them — every statement is guarded
--       by IF NOT EXISTS or a DO $$ block and is a no-op.
--
-- Requires `users` to exist before ops_events (FK to users.id).

-- ---------------- user_sessions ----------------
CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

-- Ensure PK is on (sid). Mirrors the repair block in server/auth.ts so operators
-- who imported a backup with a wrong PK get healed here too.
DO $$
DECLARE
  existing_pk_name text;
  existing_pk_is_sid boolean;
BEGIN
  SELECT c.conname,
         EXISTS (
           SELECT 1
           FROM unnest(c.conkey) AS k(attnum)
           JOIN pg_attribute a
             ON a.attrelid = c.conrelid
            AND a.attnum = k.attnum
           WHERE a.attname = 'sid'
         ) AND array_length(c.conkey, 1) = 1
  INTO existing_pk_name, existing_pk_is_sid
  FROM pg_constraint c
  WHERE c.conrelid = 'user_sessions'::regclass
    AND c.contype = 'p'
  LIMIT 1;

  IF existing_pk_name IS NULL THEN
    ALTER TABLE user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);
  ELSIF NOT existing_pk_is_sid THEN
    EXECUTE format('ALTER TABLE user_sessions DROP CONSTRAINT %I', existing_pk_name);
    ALTER TABLE user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS IDX_user_sessions_expire ON user_sessions (expire);

-- ---------------- login_rate_limits ----------------
CREATE TABLE IF NOT EXISTS login_rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL
);

-- ---------------- ops_events ----------------
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
CREATE INDEX IF NOT EXISTS ops_events_event_type_created_at_idx ON ops_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS ops_events_created_at_idx ON ops_events (created_at);
CREATE INDEX IF NOT EXISTS ops_events_severity_created_at_idx ON ops_events (severity, created_at);
