import { Hono } from "hono";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../../shared/services/db.service";
import { apiKeys } from "../../shared/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import authMiddleware from "../../middlewares/auth.middleware";
import logger from "../../utils/logger";

const router = new Hono();
router.use("*", authMiddleware as any);

const VALID_PERMISSIONS = ["deposit", "transfer", "read"] as const;

const createKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
  permissions: z
    .array(z.enum(VALID_PERMISSIONS))
    .min(1, "At least one permission is required"),
  expiry: z
    .string()
    .regex(/^[1-9]\d*[HDMY]$/, "Invalid expiry format. Use 1H, 1D, 1M, or 1Y"),
});

function parseExpiryToDate(expiry: string) {
  const now = new Date();
  const unit = expiry.slice(-1).toUpperCase();
  const value = parseInt(expiry.slice(0, -1), 10) || 1;
  switch (unit) {
    case "H":
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case "D":
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    case "M":
      return new Date(now.setMonth(now.getMonth() + value));
    case "Y":
      return new Date(now.setFullYear(now.getFullYear() + value));
    default:
      throw new Error("Invalid expiry format. Use 1H,1D,1M,1Y");
  }
}

router.post("/create", async (c) => {
  try {
    const user = c.get("user");
    if (!user || (!(user as any).sub && !(user as any).id)) {
      return c.json(
        {
          statusCode: 401,
          message: "Only authenticated users can create API keys",
          data: { message: "Only authenticated users can create API keys" },
        },
        401
      );
    }
    const userId = (user as any).sub || (user as any).id;

    const body = await c.req.json();
    const parsed = createKeySchema.parse(body);

    // enforce max 5 active keys
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.userId, userId),
          eq(apiKeys.revoked, false),
          sql`(${apiKeys.expiresAt} IS NULL OR ${apiKeys.expiresAt} > now())`
        )
      );
    const activeCount = result[0]?.count || 0;
    if (activeCount >= 5)
      return c.json(
        {
          statusCode: 400,
          message: "Maximum of 5 active API keys allowed",
          data: { message: "Maximum of 5 active API keys allowed" },
        },
        400
      );

    const expiresAt = parseExpiryToDate(parsed.expiry).toISOString();
    const id = crypto.randomUUID();
    const apiKeyValue = `sk_live_${Math.random()
      .toString(36)
      .slice(2)}${Date.now().toString(36)}`;
    const keyFingerprint = crypto
      .createHash("sha256")
      .update(apiKeyValue)
      .digest("hex");
    const hashed = await bcrypt.hash(apiKeyValue, 12);

    await db.insert(apiKeys).values({
      id,
      userId,
      key: hashed,
      keyFingerprint,
      name: parsed.name,
      permissions: parsed.permissions,
      expiresAt: new Date(expiresAt),
    });

    logger.info("API key created", {
      userId,
      apiKeyId: id,
      name: parsed.name,
      expiresAt,
    });

    return c.json(
      { api_key: apiKeyValue, name: parsed.name, expires_at: expiresAt },
      201
    );
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const message = err.errors
        .map((e) =>
          e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message
        )
        .join("; ");
      logger.error("Failed to create API key", { error: message });
      return c.json({ statusCode: 400, message, data: { message } }, 400);
    }
    logger.error("Failed to create API key", { error: err.message });
    return c.json(
      {
        statusCode: 400,
        message: err.message || "Invalid request",
        data: { message: err.message || "Invalid request" },
      },
      400
    );
  }
});

const rolloverSchema = z.object({
  expired_key_id: z.string().min(1, "Expired key ID is required"),
  expiry: z
    .string()
    .regex(/^[1-9]\d*[HDMY]$/, "Invalid expiry format. Use 1H, 1D, 1M, or 1Y"),
});

router.post("/rollover", async (c) => {
  try {
    const user = c.get("user");
    if (!user || (!(user as any).sub && !(user as any).id)) {
      return c.json(
        {
          statusCode: 401,
          message: "Only authenticated users can rollover API keys",
          data: { message: "Only authenticated users can rollover API keys" },
        },
        401
      );
    }
    const userId = (user as any).sub || (user as any).id;

    const body = await c.req.json();
    const parsed = rolloverSchema.parse(body);

    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, parsed.expired_key_id))
      .limit(1);

    if (!key)
      return c.json(
        {
          statusCode: 404,
          message: "Key not found",
          data: { message: "Key not found" },
        },
        404
      );
    if (key.userId !== userId)
      return c.json(
        {
          statusCode: 403,
          message: "Forbidden",
          data: { message: "Forbidden" },
        },
        403
      );
    if (key.expiresAt && new Date(key.expiresAt) > new Date())
      return c.json(
        {
          statusCode: 400,
          message: "Key not expired",
          data: { message: "Key not expired" },
        },
        400
      );

    // create new key reusing permissions
    const expiresAt = parseExpiryToDate(parsed.expiry).toISOString();
    const id = crypto.randomUUID();
    const apiKeyValue = `sk_live_${Math.random()
      .toString(36)
      .slice(2)}${Date.now().toString(36)}`;
    const keyFingerprint = crypto
      .createHash("sha256")
      .update(apiKeyValue)
      .digest("hex");
    const hashed = await bcrypt.hash(apiKeyValue, 12);

    await db.insert(apiKeys).values({
      id,
      userId,
      key: hashed,
      keyFingerprint,
      name: key.name || null,
      permissions: key.permissions || [],
      expiresAt: new Date(expiresAt),
    });

    logger.info("API key rolled over", {
      userId,
      oldKeyId: parsed.expired_key_id,
      newApiKeyId: id,
      name: key.name,
      expiresAt,
    });

    return c.json(
      { api_key: apiKeyValue, name: key.name || null, expires_at: expiresAt },
      201
    );
  } catch (err: any) {
    logger.error("Failed to rollover API key", { error: err.message });
    return c.json(
      {
        statusCode: 400,
        message: err.message || "Invalid request",
        data: { message: err.message || "Invalid request" },
      },
      400
    );
  }
});

export default router;
