import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const sqlPath = path.join(process.cwd(), "migrations", "add-webhooks.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");
    await pool.query(sql);
    console.log("Migration done: webhook tables created.");
  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
