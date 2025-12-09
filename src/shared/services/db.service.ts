import { Pool } from "pg";
import type { PoolClient } from "pg";

const connectionString =
  (typeof Bun !== "undefined" && Bun.env && Bun.env.DATABASE_URL) ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({ connectionString });

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
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
