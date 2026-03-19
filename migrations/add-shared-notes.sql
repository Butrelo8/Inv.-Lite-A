-- Create shared-notes table (viewer read-only, editor/admin write).
-- Idempotent: safe to run multiple times.
CREATE TABLE IF NOT EXISTS shared_notes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);

