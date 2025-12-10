import { db } from "../../shared/services/db.service";
import { wallets, transactions } from "../../shared/db/schema";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";

export async function getOrCreateWalletForUser(userId: string) {
  const [existing] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  if (existing) return existing;

  // Generate unique wallet number with retry logic
  let walletNumber: string;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    walletNumber = Math.floor(Math.random() * 1e13)
      .toString()
      .padStart(13, "0");
    try {
      const [newWallet] = await db
        .insert(wallets)
        .values({
          userId,
          balance: 0,
          walletNumber,
        })
        .returning();
      return newWallet;
    } catch (err: any) {
      // Check if it's a unique constraint violation
      if (err.code === "23505") {
        attempts++;
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to generate unique wallet number");
}

export async function getBalance(userId: string) {
  const [wallet] = await db
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  if (!wallet) return 0;
  return wallet.balance || 0;
}

export async function transferFunds(
  senderId: string,
  walletNumber: string,
  amount: number
) {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  return await db.transaction(async (tx) => {
    // Get sender wallet with lock
    const [sender] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, senderId))
      .for("update")
      .limit(1);

    if (!sender) throw new Error("Sender wallet not found");
    if ((sender.balance || 0) < amount) throw new Error("Insufficient balance");

    // Get recipient with lock
    const [recipient] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.walletNumber, walletNumber))
      .for("update")
      .limit(1);

    if (!recipient) throw new Error("Recipient not found");

    // Prevent self-transfers
    if (sender.walletNumber === walletNumber) {
      throw new Error("Cannot transfer to your own wallet");
    }

    // Deduct and credit
    await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} - ${amount}` })
      .where(eq(wallets.userId, senderId));

    await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} + ${amount}` })
      .where(eq(wallets.walletNumber, walletNumber));

    // Record transaction
    const reference = `tr_${Math.random()
      .toString(36)
      .slice(2)}${Date.now().toString(36)}`;

    await tx.insert(transactions).values({
      type: "transfer",
      amount,
      status: "success",
      reference,
      fromUserId: senderId,
      toWalletNumber: walletNumber,
    });

    return { status: "success", reference };
  });
}

export async function processPaystackWebhook(
  reference: string,
  amount: number
) {
  return await db.transaction(async (tx) => {
    const [txn] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.reference, reference))
      .for("update")
      .limit(1);

    if (!txn) throw new Error("Transaction not found");
    if (txn.status === "success") return { status: "already_processed" };

    // find wallet by wallet_number stored in transaction.to_wallet_number
    const walletNumber = txn.toWalletNumber;
    if (!walletNumber) throw new Error("Transaction missing target wallet");

    // credit wallet
    await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} + ${amount}` })
      .where(eq(wallets.walletNumber, walletNumber));

    // update transaction status
    await tx
      .update(transactions)
      .set({ status: "success" })
      .where(eq(transactions.reference, reference));

    return { status: "credited" };
  });
}
