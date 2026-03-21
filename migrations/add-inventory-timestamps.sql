-- Add created_at and updated_at to inventory_items (for "recently added/modified" filters).
-- Idempotent: safe to run multiple times.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
