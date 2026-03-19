/**
 * One-off migration: add timestamps to inventory_items and create shared_notes.
 * Run with: npm run db:migrate (requires DATABASE_URL in .env)
 * When using Docker Compose, use: DATABASE_URL=postgresql://inventario:inventario@localhost:5432/inventario
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Set it in .env (e.g. postgresql://inventario:inventario@localhost:5432/inventario for Docker).");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(`
      ALTER TABLE inventory_items
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shared_notes (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        item_id INTEGER REFERENCES inventory_items(id) ON DELETE CASCADE,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
      );
    `);

    // Ensure per-item linkage exists even if shared_notes was created earlier without item_id.
    await pool.query(`
      ALTER TABLE shared_notes ADD COLUMN IF NOT EXISTS item_id INTEGER;
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
    `);

    console.log("Migration done: inventory_items timestamps + shared_notes table.");
  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
