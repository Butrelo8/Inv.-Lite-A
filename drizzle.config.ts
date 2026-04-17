import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and set DATABASE_URL to your PostgreSQL connection string (e.g. postgresql://user:password@localhost:5432/inventario).");
  process.exit(1);
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
