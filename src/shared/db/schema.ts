import {
  pgTable,
  text,
  bigint,
  timestamp,
  boolean,
  serial,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const wallets = pgTable(
  "wallets",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    balance: bigint("balance", { mode: "number" }).default(0),
    walletNumber: text("wallet_number").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_wallets_user_id").on(table.userId),
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    type: text("type"),
    amount: bigint("amount", { mode: "number" }),
    status: text("status"),
    reference: text("reference").unique(),
    fromUserId: text("from_user_id"),
    toWalletNumber: text("to_wallet_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    fromUserIdx: index("idx_transactions_from_user").on(table.fromUserId),
    toWalletIdx: index("idx_transactions_to_wallet").on(table.toWalletNumber),
    referenceIdx: index("idx_transactions_reference").on(table.reference),
  })
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    key: text("key").unique(),
    keyFingerprint: text("key_fingerprint"),
    name: text("name"),
    permissions: text("permissions").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revoked: boolean("revoked").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_api_keys_user_id").on(table.userId),
    keyIdx: index("idx_api_keys_key").on(table.key),
    fingerprintIdx: index("idx_api_keys_fingerprint").on(table.keyFingerprint),
  })
);
