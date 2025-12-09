import { query, withTransaction } from "../../shared/services/db.service";

export async function getOrCreateWalletForUser(userId: string) {
  const res = await query("SELECT * FROM wallets WHERE user_id = $1", [userId]);
  if (res.rowCount > 0) return res.rows[0];

  // Generate unique wallet number with retry logic
  let walletNumber: string;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    walletNumber = Math.floor(Math.random() * 1e13)
      .toString()
      .padStart(13, "0");
    try {
      const insert = await query(
        "INSERT INTO wallets(user_id, balance, wallet_number) VALUES($1, $2, $3) RETURNING *",
        [userId, 0, walletNumber]
      );
      return insert.rows[0];
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
  const res = await query("SELECT balance FROM wallets WHERE user_id = $1", [
    userId,
  ]);
  if (res.rowCount === 0) return 0;
  return res.rows[0].balance;
}

export async function transferFunds(
  senderId: string,
  walletNumber: string,
  amount: number
) {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  return withTransaction(async (client: any) => {
    // Get sender wallet
    const senderRes = await client.query(
      "SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE",
      [senderId]
    );
    if (senderRes.rowCount === 0) throw new Error("Sender wallet not found");
    const sender = senderRes.rows[0];

    if (sender.balance < amount) throw new Error("Insufficient balance");

    // Get recipient
    const recipientRes = await client.query(
      "SELECT * FROM wallets WHERE wallet_number = $1 FOR UPDATE",
      [walletNumber]
    );
    if (recipientRes.rowCount === 0) throw new Error("Recipient not found");
    const recipient = recipientRes.rows[0];

    // Prevent self-transfers
    if (sender.wallet_number === walletNumber) {
      throw new Error("Cannot transfer to your own wallet");
    }

    // Deduct and credit
    await client.query(
      "UPDATE wallets SET balance = balance - $1 WHERE user_id = $2",
      [amount, senderId]
    );
    await client.query(
      "UPDATE wallets SET balance = balance + $1 WHERE wallet_number = $2",
      [amount, walletNumber]
    );

    // Record transactions (simplified)
    const reference = `tr_${Math.random()
      .toString(36)
      .slice(2)}${Date.now().toString(36)}`;

    await client.query(
      "INSERT INTO transactions(type, amount, status, reference, from_user_id, to_wallet_number) VALUES($1,$2,$3,$4,$5,$6)",
      ["transfer", amount, "success", reference, senderId, walletNumber]
    );

    return { status: "success", reference };
  });
}

export async function processPaystackWebhook(
  reference: string,
  amount: number
) {
  return withTransaction(async (client: any) => {
    const txRes = await client.query(
      "SELECT * FROM transactions WHERE reference = $1 FOR UPDATE",
      [reference]
    );
    if (txRes.rowCount === 0) throw new Error("Transaction not found");
    const tx = txRes.rows[0];
    if (tx.status === "success") return { status: "already_processed" };

    // find wallet by wallet_number stored in transaction.to_wallet_number
    const walletNumber = tx.to_wallet_number;
    if (!walletNumber) throw new Error("Transaction missing target wallet");

    // credit wallet
    await client.query(
      "UPDATE wallets SET balance = balance + $1 WHERE wallet_number = $2",
      [amount, walletNumber]
    );

    // update transaction status
    await client.query(
      "UPDATE transactions SET status = $1 WHERE reference = $2",
      ["success", reference]
    );

    return { status: "credited" };
  });
}
