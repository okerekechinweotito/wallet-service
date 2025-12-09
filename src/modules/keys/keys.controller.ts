import { Hono } from "hono";
import { z } from "zod";
import crypto from "crypto";
import { query } from "../../shared/services/db.service";
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
        { error: "Only authenticated users can create API keys" },
        401
      );
    }
    const userId = (user as any).sub || (user as any).id;

    const body = await c.req.json();
    const parsed = createKeySchema.parse(body);

    // enforce max 5 active keys
    const activeRes = await query(
      "SELECT count(*)::int as cnt FROM api_keys WHERE user_id = $1 AND revoked = false AND (expires_at IS NULL OR expires_at > now())",
      [userId]
    );
    const activeCount = activeRes.rows[0].cnt || 0;
    if (activeCount >= 5)
      return c.json({ error: "Maximum of 5 active API keys allowed" }, 400);

    const expiresAt = parseExpiryToDate(parsed.expiry).toISOString();
    const id = crypto.randomUUID();
    const apiKeyValue = `sk_live_${Math.random()
      .toString(36)
      .slice(2)}${Date.now().toString(36)}`;

    await query(
      "INSERT INTO api_keys(id, user_id, key, name, permissions, expires_at) VALUES($1,$2,$3,$4,$5,$6)",
      [id, userId, apiKeyValue, parsed.name, parsed.permissions, expiresAt]
    );

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
      return c.json({ error: message }, 400);
    }
    logger.error("Failed to create API key", { error: err.message });
    return c.json({ error: err.message || "Invalid request" }, 400);
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
        { error: "Only authenticated users can rollover API keys" },
        401
      );
    }
    const userId = (user as any).sub || (user as any).id;

    const body = await c.req.json();
    const parsed = rolloverSchema.parse(body);

    const res = await query("SELECT * FROM api_keys WHERE id = $1", [
      parsed.expired_key_id,
    ]);
    if (res.rowCount === 0) return c.json({ error: "Key not found" }, 404);
    const key = res.rows[0];
    if (key.user_id !== userId) return c.json({ error: "Forbidden" }, 403);
    if (key.expires_at && new Date(key.expires_at) > new Date())
      return c.json({ error: "Key not expired" }, 400);

    // create new key reusing permissions
    const expiresAt = parseExpiryToDate(parsed.expiry).toISOString();
    const id = crypto.randomUUID();
    const apiKeyValue = `sk_live_${Math.random()
      .toString(36)
      .slice(2)}${Date.now().toString(36)}`;

    await query(
      "INSERT INTO api_keys(id, user_id, key, name, permissions, expires_at) VALUES($1,$2,$3,$4,$5,$6)",
      [id, userId, apiKeyValue, key.name || null, key.permissions, expiresAt]
    );

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
    return c.json({ error: err.message || "Invalid request" }, 400);
  }
});

export default router;
