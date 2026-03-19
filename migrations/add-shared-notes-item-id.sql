-- Link shared_notes to inventory_items (per-item shared notes).
-- Idempotent.

ALTER TABLE shared_notes
  ADD COLUMN IF NOT EXISTS item_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shared_notes_item_id_fkey'
  ) THEN
    ALTER TABLE shared_notes
      ADD CONSTRAINT shared_notes_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;
  END IF;
END $$;

