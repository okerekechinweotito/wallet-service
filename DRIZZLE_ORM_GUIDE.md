# Drizzle ORM Integration

This project now uses **Drizzle ORM** for database operations, providing type-safe queries and easy schema migrations.

## Overview

- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Schema Location**: `src/shared/db/schema.ts`
- **Migrations**: `src/shared/db/migrations/`
- **Configuration**: `drizzle.config.ts`

## Features

✅ **Type-safe queries** - Full TypeScript support with autocompletion  
✅ **Easy migrations** - Generate migrations automatically from schema changes  
✅ **Transaction support** - Built-in transaction handling  
✅ **Hashed API keys** - Secure storage with bcrypt + SHA-256 fingerprints  
✅ **Relations** - Foreign keys and cascading deletes

## Database Schema

### Tables

- **`users`** - User accounts (from OAuth)
- **`wallets`** - User wallets with balances and unique wallet numbers
- **`transactions`** - Transfer and deposit records
- **`api_keys`** - Hashed API keys with fingerprints for secure authentication

### Key Features

- API keys are stored as bcrypt hashes (never plaintext)
- SHA-256 fingerprints enable fast lookups without exposing keys
- Foreign key constraints with cascade deletes
- Indexes for performance on common queries

## Scripts

```json
{
  "db:generate": "Generate migration files from schema changes",
  "db:migrate": "Run pending migrations on the database",
  "db:push": "Push schema directly to database (dev only)",
  "db:studio": "Open Drizzle Studio UI for database browsing"
}
```

## Migration Workflow

### 1. Making Schema Changes

Edit the schema in `src/shared/db/schema.ts`:

```typescript
// Example: Add a new column
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  avatar: text("avatar"), // NEW COLUMN
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

### 2. Generate Migration

```bash
bun run db:generate
```

This creates a SQL migration file in `src/shared/db/migrations/`.

### 3. Apply Migration

**Option A: Run migration script (recommended for production)**

```bash
bun run db:migrate
```

**Option B: Push directly (dev/testing only)**

```bash
bun run db:push
```

⚠️ `db:push` skips migration files and directly syncs schema. Use only in development.

### 4. Verify Migration

Check the database or use Drizzle Studio:

```bash
bun run db:studio
```

Opens a web UI at `https://local.drizzle.studio` to browse your database.

## Usage Examples

### Querying Data

```typescript
import { db } from "./shared/services/db.service";
import { users, wallets, apiKeys } from "./shared/db/schema";
import { eq, and, gt } from "drizzle-orm";

// Select
const [user] = await db
  .select()
  .from(users)
  .where(eq(users.id, userId))
  .limit(1);

// Insert
await db.insert(wallets).values({
  userId: "user123",
  balance: 0,
  walletNumber: "1234567890123",
});

// Update
await db
  .update(wallets)
  .set({ balance: 5000 })
  .where(eq(wallets.userId, userId));

// Delete
await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
```

### Transactions

```typescript
const result = await db.transaction(async (tx) => {
  // All queries in this block run in a transaction
  await tx
    .update(wallets)
    .set({ balance: sql`${wallets.balance} - ${amount}` })
    .where(eq(wallets.userId, senderId));

  await tx
    .update(wallets)
    .set({ balance: sql`${wallets.balance} + ${amount}` })
    .where(eq(wallets.walletNumber, recipientWallet));

  // If any query fails, entire transaction rolls back
  return { success: true };
});
```

### Joins

```typescript
const result = await db
  .select({
    userName: users.name,
    walletBalance: wallets.balance,
  })
  .from(users)
  .leftJoin(wallets, eq(wallets.userId, users.id))
  .where(eq(users.id, userId));
```

## Migration from Raw SQL

The project has been fully migrated from raw SQL queries to Drizzle ORM:

- ✅ `auth.controller.ts` - User creation with upsert
- ✅ `keys.controller.ts` - API key creation and rollover with hashing
- ✅ `auth.middleware.ts` - API key verification with fingerprints
- ✅ `wallet.controller.ts` - Transaction queries
- ✅ `wallet.service.ts` - Wallet operations with transactions

### API Key Hashing

API keys are now securely stored:

1. **Generated**: Plaintext key like `sk_live_abc123...`
2. **Fingerprint**: SHA-256 hash for fast lookup (indexed)
3. **Storage**: bcrypt hash of the key (cost factor 12)
4. **Verification**: Lookup by fingerprint, verify with bcrypt.compare

This ensures leaked database dumps don't expose valid API keys.

## Environment Variables

Required:

```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname"
JWT_SECRET="your-jwt-secret"
PAYSTACK_SECRET="your-paystack-secret"  # for payments
GOOGLE_CLIENT_ID="your-google-oauth-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-secret"
BASE_URL="http://localhost:3000"  # or your production URL
```

## Production Deployment

1. **Set DATABASE_URL** in your environment
2. **Run migrations** before deploying new code:
   ```bash
   bun run db:migrate
   ```
3. **Deploy** your application

**Do NOT use `db:push` in production** - it bypasses migrations and can cause data loss.

## Troubleshooting

### "Column does not exist" error

Run migrations:

```bash
bun run db:migrate
```

### Schema out of sync

Regenerate and apply migration:

```bash
bun run db:generate
bun run db:migrate
```

### Existing tables conflict

If you have old tables from `init.sql`, the migration will detect them. You can:

1. **Push schema** (overwrites, dev only): `bun run db:push`
2. **Manual migration**: Drop old tables and run migrations
3. **Keep both**: Rename old tables and let migrations create new ones

### Check migration status

Drizzle stores applied migrations in a `__drizzle_migrations` table. Query it to see what's been run.

## Benefits Over Raw SQL

| Feature              | Raw SQL       | Drizzle ORM |
| -------------------- | ------------- | ----------- |
| Type safety          | ❌            | ✅          |
| Auto-completion      | ❌            | ✅          |
| Migration management | Manual        | Automatic   |
| Query builder        | String concat | Composable  |
| SQL injection risk   | Higher        | Lower       |
| Refactoring          | Manual search | IDE support |

## Resources

- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Drizzle Kit (migrations)](https://orm.drizzle.team/kit-docs/overview)
- [PostgreSQL Drizzle Guide](https://orm.drizzle.team/docs/get-started-postgresql)

## Support

For issues or questions about the ORM setup, check:

1. Error logs in the terminal
2. Drizzle Studio for database state
3. Generated migration SQL files
4. This README for common solutions
