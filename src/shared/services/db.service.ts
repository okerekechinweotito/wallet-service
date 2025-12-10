import { Pool } from "pg";
import type { PoolClient } from "pg";

const connectionString =
  (typeof Bun !== "undefined" && Bun.env && Bun.env.DATABASE_URL) ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Log the DB host for easier debugging (don't log full credentials in production)
try {
  const parsed = new URL(connectionString);
  console.info("DB host:", parsed.hostname, "port:", parsed.port);
} catch (err) {
  console.warn("Could not parse DATABASE_URL for host info");
}

let pool: Pool;
try {
  pool = new Pool({ connectionString });
} catch (err: any) {
  console.error("Failed to create Postgres pool", { error: err.message });
  throw err;
}

// Surface pool-level errors (e.g., DNS/connectivity)
try {
  pool.on("error", (err: Error) => {
    console.error("Postgres pool error", {
      message: err.message,
      stack: (err as any).stack,
    });
  });
} catch (err) {
  console.warn("Could not attach pool error handler", {
    error: (err as any).message,
  });
}

export async function query(text: string, params?: any[]) {
  try {
    return await pool.query(text, params);
  } catch (err: any) {
    console.error("DB query error", { message: err.message, stack: err.stack });
    throw err;
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
import type { Strings_GET } from "../../modules/strings/string.schema";

export const analyzedStrings = new Map<string, Strings_GET>();
