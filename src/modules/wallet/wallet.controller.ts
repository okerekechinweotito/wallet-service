import { Hono } from "hono";
import { z } from "zod";
import {
  getOrCreateWalletForUser,
  getBalance,
  transferFunds,
  processPaystackWebhook,
} from "./wallet.service";
import authMiddleware from "../../middlewares/auth.middleware";
import { db } from "../../shared/services/db.service";
import { users, wallets, transactions } from "../../shared/db/schema";
import { eq, or, inArray, desc } from "drizzle-orm";
import crypto from "crypto";
import logger from "../../utils/logger";

const router = new Hono();

// Public endpoints (no auth required - webhook uses signature validation)
// Paystack webhook endpoint - must validate signature and be idempotent
router.post("/paystack/webhook", async (c) => {
  try {
    const PAYSTACK_SECRET =
      (typeof Bun !== "undefined" && Bun.env && Bun.env.PAYSTACK_SECRET) ||
      process.env.PAYSTACK_SECRET;
    if (!PAYSTACK_SECRET)
      return c.json(
        {
          statusCode: 500,
          message: "PAYSTACK_SECRET not configured",
          data: { message: "PAYSTACK_SECRET not configured" },
        },
        500
      );

    const signature = c.req.header("x-paystack-signature") || "";
    const bodyText = await c.req.text();

    const hmac = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(bodyText)
      .digest("hex");

    // Debug logging
    console.log("=== Webhook Debug ===");
    console.log("Received signature:", signature);
    console.log("Computed signature:", hmac);
    console.log("Body length:", bodyText.length);
    console.log("Body:", bodyText);
    console.log("Match:", hmac === signature);
    console.log("===================");

    if (hmac !== signature)
      return c.json(
        {
          statusCode: 401,
          message: "Invalid signature",
          data: { message: "Invalid signature" },
        },
        401
      );

    const payload = JSON.parse(bodyText);
    const event = payload.event;
    const data = payload.data;
    const reference = data.reference;
    const amountKobo = data.amount;
    const amount = Math.floor(amountKobo / 100);

    if (!reference)
      return c.json(
        {
          statusCode: 400,
          message: "Missing reference",
          data: { message: "Missing reference" },
        },
        400
      );

    if (event === "charge.success" || data.status === "success") {
      // process webhook: mark transaction success and credit wallet (idempotent)
      try {
        const result = await processPaystackWebhook(reference, amount);
        logger.info("Webhook processed", { reference, amount, result });
        return c.json({ status: true });
      } catch (err: any) {
        logger.error("Webhook processing failed", {
          error: err.message,
          reference,
        });
        return c.json({ status: false, error: err.message }, 500);
      }
    }

    return c.json({ status: true });
  } catch (err: any) {
    logger.error("Webhook error", { error: err.message });
    return c.json({ status: false, error: err.message }, 500);
  }
});

// Paystack redirect (browser) after payment — public and performs a verify+process
router.get("/paystack/webhook", async (c) => {
  try {
    const reference = c.req.query("reference") || c.req.query("trxref");
    if (!reference) return c.text("Missing reference", 400);

    const PAYSTACK_SECRET =
      (typeof Bun !== "undefined" && Bun.env && Bun.env.PAYSTACK_SECRET) ||
      process.env.PAYSTACK_SECRET;
    if (!PAYSTACK_SECRET) return c.text("PAYSTACK_SECRET not configured", 500);

    // Verify with Paystack (read-only). This endpoint is used for browser redirects.
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }
    );
    const json = await res.json();
    if (!json.status) {
      logger.warn("Paystack verify failed (redirect)", {
        reference,
        detail: json,
      });
      return c.html(
        `<h3>Payment verification failed</h3><pre>${JSON.stringify(
          json
        )}</pre>`,
        200
      );
    }

    const status = json.data.status;
    const amount = Math.floor(json.data.amount / 100);

    if (status === "success") {
      try {
        const result = await processPaystackWebhook(reference, amount);
        logger.info("Redirect processed and credited if needed", {
          reference,
          amount,
          result,
        });
        return c.html(
          `<h3>Payment successful</h3><p>Reference: ${reference}</p><p>Status: ${status}</p>`,
          200
        );
      } catch (err: any) {
        logger.error("Error processing redirect credit", {
          error: err.message,
          reference,
        });
        return c.html(
          `<h3>Payment verified but processing failed</h3><pre>${err.message}</pre>`,
          500
        );
      }
    }

    return c.html(
      `<h3>Payment status: ${status}</h3><p>Reference: ${reference}</p>`,
      200
    );
  } catch (err: any) {
    logger.error("Redirect handler error", { error: err.message });
    return c.text(err.message || "Error", 500);
  }
});

// Verify deposit status (read-only, does not credit) - public for checking
router.get("/deposit/:reference/status", async (c) => {
  try {
    const reference = c.req.param("reference");
    const PAYSTACK_SECRET =
      (typeof Bun !== "undefined" && Bun.env && Bun.env.PAYSTACK_SECRET) ||
      process.env.PAYSTACK_SECRET;
    if (!PAYSTACK_SECRET)
      return c.json(
        {
          statusCode: 500,
          message: "PAYSTACK_SECRET not configured",
          data: { message: "PAYSTACK_SECRET not configured" },
        },
        500
      );

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }
    );
    const json = await res.json();
    if (!json.status)
      return c.json(
        {
          statusCode: 500,
          message: "Paystack verify failed",
          data: { message: "Paystack verify failed" },
        },
        500
      );

    const status = json.data.status;
    const amount = Math.floor(json.data.amount / 100);
    logger.info("Deposit status checked", { reference, status, amount });
    return c.json({ reference, status, amount }, 200);
  } catch (err: any) {
    logger.error("Verify failed", { error: err.message });
    return c.json(
      {
        statusCode: 500,
        message: err.message || "Verify failed",
        data: { message: err.message || "Verify failed" },
      },
      500
    );
  }
});

// Apply auth middleware to all other endpoints
router.use("*", authMiddleware as any);

router.get("/balance", async (c) => {
  try {
    const user = c.get("user");
    const apiKey = c.get("apiKey");
    let userId: string | undefined;
    if (user) userId = (user as any).sub || (user as any).id;
    // In case of API key, a service may need to specify target user via query param
    if (!userId) {
      const q = c.req.query("user_id");
      if (q) userId = q;
    }
    if (!userId)
      return c.json(
        {
          statusCode: 400,
          message: "Missing user context",
          data: { message: "Missing user context" },
        },
        400
      );

    // permission check for API keys
    if (apiKey) {
      const perms: string[] = c.get("apiKeyPermissions") || [];
      if (!perms.includes("read"))
        return c.json(
          {
            statusCode: 403,
            message: "API key missing read permission",
            data: { message: "API key missing read permission" },
          },
          403
        );
    }

    await getOrCreateWalletForUser(userId);
    const balance = await getBalance(userId);
    logger.info("Fetched balance", { userId, balance });
    return c.json({ balance }, 200);
  } catch (err: any) {
    logger.error("Failed to fetch balance", { error: err.message });
    return c.json(
      {
        statusCode: 500,
        message: err.message || "Failed to get balance",
        data: { message: err.message || "Failed to get balance" },
      },
      500
    );
  }
});

const transferSchema = z.object({
  wallet_number: z.string(),
  amount: z.number().positive(),
});

router.post("/transfer", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = transferSchema.parse(body);
    const user = c.get("user");
    const userId: string | undefined = user
      ? (user as any).sub || (user as any).id
      : undefined;
    if (!userId)
      return c.json(
        {
          statusCode: 401,
          message: "Missing user context",
          data: { message: "Missing user context" },
        },
        401
      );
    // permission check for API keys
    const apiKey = c.get("apiKey");
    if (apiKey) {
      const perms: string[] = c.get("apiKeyPermissions") || [];
      if (!perms.includes("transfer"))
        return c.json(
          {
            statusCode: 403,
            message: "API key missing transfer permission",
            data: { message: "API key missing transfer permission" },
          },
          403
        );
    }

    const result = await transferFunds(
      userId,
      parsed.wallet_number,
      parsed.amount
    );
    logger.info("Transfer completed", {
      from: userId,
      to: parsed.wallet_number,
      amount: parsed.amount,
      reference: result.reference,
    });
    return c.json(
      {
        status: "success",
        message: "Transfer completed",
        reference: result.reference,
      },
      200
    );
  } catch (err: any) {
    logger.error("Transfer failed", { error: err.message });
    return c.json(
      {
        statusCode: 400,
        message: err.message || "Transfer failed",
        data: { message: err.message || "Transfer failed" },
      },
      400
    );
  }
});

// Transaction history
router.get("/transactions", async (c) => {
  try {
    const user = c.get("user");
    const apiKey = c.get("apiKey");
    let userId: string | undefined = user
      ? (user as any).sub || (user as any).id
      : undefined;
    if (!userId) {
      const q = c.req.query("user_id");
      if (q) userId = q;
    }
    if (!userId) return c.json({ error: "Missing user context" }, 400);

    if (apiKey) {
      const perms: string[] = c.get("apiKeyPermissions") || [];
      if (!perms.includes("read"))
        return c.json({ error: "API key missing read permission" }, 403);
    }

    const page = parseInt(c.req.query("page") || "1");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
    const offset = (page - 1) * limit;

    // Get user's wallet numbers
    const userWallets = await db
      .select({ walletNumber: wallets.walletNumber })
      .from(wallets)
      .where(eq(wallets.userId, userId));
    const walletNumbers = userWallets
      .map((w) => w.walletNumber)
      .filter(Boolean) as string[];

    // Get transactions
    const txs = await db
      .select({
        type: transactions.type,
        amount: transactions.amount,
        status: transactions.status,
        reference: transactions.reference,
        fromUserId: transactions.fromUserId,
        toWalletNumber: transactions.toWalletNumber,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(
        or(
          eq(transactions.fromUserId, userId),
          walletNumbers.length > 0
            ? inArray(transactions.toWalletNumber, walletNumbers)
            : undefined
        )
      )
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    // Simplify transaction response to match spec exactly
    const formatted = txs.map((tx) => ({
      type: tx.type || "unknown",
      amount: Number(tx.amount || 0),
      status: tx.status || "unknown",
    }));

    return c.json(formatted, 200);
  } catch (err: any) {
    logger.error("Failed to fetch transactions", { error: err.message });
    return c.json(
      {
        statusCode: 500,
        message: err.message || "Failed to fetch transactions",
        data: { message: err.message || "Failed to fetch transactions" },
      },
      500
    );
  }
});

const depositSchema = z.object({ amount: z.number().positive() });

function hasPermission(c: any, perm: string) {
  const apiKey = c.get("apiKey");
  if (!apiKey) return true; // JWT users have full access
  const perms: string[] = c.get("apiKeyPermissions") || [];
  return perms.includes(perm);
}

// Initialize Paystack deposit
router.post("/deposit", async (c) => {
  try {
    if (!hasPermission(c, "deposit"))
      return c.json(
        {
          statusCode: 403,
          message: "API key missing deposit permission",
          data: { message: "API key missing deposit permission" },
        },
        403
      );
    const body = await c.req.json();
    const parsed = depositSchema.parse(body);
    const user = c.get("user");
    const userId: string | undefined = user
      ? (user as any).sub || (user as any).id
      : undefined;
    if (!userId)
      return c.json(
        {
          statusCode: 401,
          message: "Missing user context",
          data: { message: "Missing user context" },
        },
        401
      );

    // ensure wallet exists and get wallet_number
    const wallet = await getOrCreateWalletForUser(userId);
    if (!wallet || !wallet.walletNumber) {
      return c.json(
        {
          statusCode: 500,
          message: "Failed to get wallet",
          data: { message: "Failed to get wallet" },
        },
        500
      );
    }

    // try to get user's email
    const [userRecord] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const email = userRecord?.email || "no-reply@example.com";

    // create unique reference
    const reference = `ps_${crypto.randomUUID()}`;

    // store transaction as pending
    await db.insert(transactions).values({
      type: "deposit",
      amount: parsed.amount,
      status: "pending",
      reference,
      fromUserId: null,
      toWalletNumber: wallet.walletNumber,
    });

    const PAYSTACK_SECRET =
      (typeof Bun !== "undefined" && Bun.env && Bun.env.PAYSTACK_SECRET) ||
      process.env.PAYSTACK_SECRET;
    if (!PAYSTACK_SECRET)
      return c.json(
        {
          statusCode: 500,
          message: "PAYSTACK_SECRET not configured",
          data: { message: "PAYSTACK_SECRET not configured" },
        },
        500
      );

    const baseUrl = new URL(c.req.url).origin;
    const callbackUrl = `${baseUrl}/wallet/paystack/webhook`;

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: parsed.amount * 100,
        reference,
        callback_url: callbackUrl,
      }),
    });
    const json = await res.json();
    if (!json.status)
      return c.json(
        {
          statusCode: 500,
          message: "Paystack init failed",
          data: { message: "Paystack init failed" },
        },
        500
      );

    return c.json(
      { reference: reference, authorization_url: json.data.authorization_url },
      200
    );
  } catch (err: any) {
    logger.error("Deposit init failed", { error: err.message });
    return c.json(
      {
        statusCode: 400,
        message: err.message || "Deposit init failed",
        data: { message: err.message || "Deposit init failed" },
      },
      400
    );
  }
});

// Return API key id — requires API key auth only
router.get("/api-key/id", async (c) => {
  try {
    const apiKey = c.get("apiKey");
    if (!apiKey)
      return c.json(
        {
          statusCode: 401,
          message: "API key required",
          data: { message: "API key required" },
        },
        401
      );
    const apiKeyId = c.get("apiKeyId");
    return c.json({ id: apiKeyId }, 200);
  } catch (err: any) {
    logger.error("Failed to fetch api key id", { error: err.message });
    return c.json(
      {
        statusCode: 500,
        message: err.message || "Failed to fetch api key id",
        data: { message: err.message || "Failed to fetch api key id" },
      },
      500
    );
  }
});

// Return wallet id for the authenticated context (API key or Bearer)
router.get("/id", async (c) => {
  try {
    const user = c.get("user");
    const apiKey = c.get("apiKey");
    let userId: string | undefined = user
      ? (user as any).sub || (user as any).id || (user as any).id
      : undefined;

    // Allow API key to specify target user via query param
    if (!userId) {
      const q = c.req.query("user_id");
      if (q) userId = q;
    }

    if (!userId)
      return c.json(
        {
          statusCode: 400,
          message: "Missing user context",
          data: { message: "Missing user context" },
        },
        400
      );

    if (apiKey) {
      const perms: string[] = c.get("apiKeyPermissions") || [];
      if (!perms.includes("read"))
        return c.json(
          {
            statusCode: 403,
            message: "API key missing read permission",
            data: { message: "API key missing read permission" },
          },
          403
        );
    }

    const wallet = await getOrCreateWalletForUser(userId);
    if (!wallet || !wallet.walletNumber)
      return c.json(
        {
          statusCode: 404,
          message: "Wallet not found",
          data: { message: "Wallet not found" },
        },
        404
      );
    return c.json({ wallet_number: wallet.walletNumber }, 200);
  } catch (err: any) {
    logger.error("Failed to fetch wallet id", { error: err.message });
    return c.json(
      {
        statusCode: 500,
        message: err.message || "Failed to fetch wallet id",
        data: { message: err.message || "Failed to fetch wallet id" },
      },
      500
    );
  }
});

export default router;
