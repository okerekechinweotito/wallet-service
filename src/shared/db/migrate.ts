import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  (typeof Bun !== "undefined" && Bun.env && Bun.env.DATABASE_URL) ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

async function runMigrations() {
  console.log("Starting database migrations...");

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    await migrate(db, { migrationsFolder: "./src/shared/db/migrations" });
    console.log("✅ Migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigrations();
