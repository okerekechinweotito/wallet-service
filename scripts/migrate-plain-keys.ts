import { Client } from "pg";
import crypto from "crypto";
import bcrypt from "bcryptjs";

async function main() {
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) {
    console.error("DATABASE_URL is required to run this migration");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Select rows that appear to be plaintext keys (no fingerprint) or non-bcrypt values
    const res = await client.query(
      `SELECT id, key FROM api_keys WHERE key_fingerprint IS NULL OR key NOT LIKE '$2%';`
    );

    console.log(`Found ${res.rowCount} keys to migrate`);
    for (const row of res.rows) {
      const id = row.id;
      const plain = row.key;
      if (!plain) continue;

      // compute fingerprint and bcrypt hash
      const fingerprint = crypto
        .createHash("sha256")
        .update(plain)
        .digest("hex");
      const hashed = await bcrypt.hash(plain, 12);

      await client.query(
        `UPDATE api_keys SET key = $1, key_fingerprint = $2 WHERE id = $3`,
        [hashed, fingerprint, id]
      );
      console.log(`Migrated key ${id}`);
    }

    console.log("Migration completed");
  } catch (err: any) {
    console.error("Migration failed:", err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
