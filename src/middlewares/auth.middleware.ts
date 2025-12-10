import type { Context } from "hono";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../shared/services/db.service";
import { apiKeys } from "../shared/db/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET =
  (typeof Bun !== "undefined" && Bun.env && Bun.env.JWT_SECRET) ||
  process.env.JWT_SECRET ||
  "";

export async function authMiddleware(c: Context, next: any) {
  try {
    const apiKey = c.req.header("x-api-key");
    if (apiKey) {
      // Lookup API key in DB using fingerprint then verify bcrypt hash
      try {
        const fingerprint = crypto
          .createHash("sha256")
          .update(apiKey)
          .digest("hex");
        const [key] = await db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyFingerprint, fingerprint))
          .limit(1);

        if (!key)
          return c.json(
            {
              statusCode: 401,
              message: "Invalid API key",
              data: { message: "Invalid API key" },
            },
            401
          );
        const match = await bcrypt.compare(apiKey, key.key!);
        if (!match)
          return c.json(
            {
              statusCode: 401,
              message: "Invalid API key",
              data: { message: "Invalid API key" },
            },
            401
          );
        if (key.revoked)
          return c.json(
            {
              statusCode: 401,
              message: "API key revoked",
              data: { message: "API key revoked" },
            },
            401
          );
        if (key.expiresAt && new Date(key.expiresAt) < new Date())
          return c.json(
            {
              statusCode: 401,
              message: "API key expired",
              data: { message: "API key expired" },
            },
            401
          );

        // attach api key info and user context
        c.set("apiKey", apiKey);
        c.set("apiKeyId", key.id);
        c.set("apiKeyPermissions", key.permissions || []);
        c.set("user", { id: key.userId });
        return next();
      } catch (err) {
        return c.json(
          {
            statusCode: 500,
            message: "API key lookup error",
            data: { message: "API key lookup error" },
          },
          500
        );
      }
    }

    const auth = c.req.header("authorization");
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.replace("Bearer ", "").trim();
      if (!JWT_SECRET) {
        return c.json(
          {
            statusCode: 500,
            message: "JWT_SECRET not configured",
            data: { message: "JWT_SECRET not configured" },
          },
          500
        );
      }
      try {
        const payload = jwt.verify(token, JWT_SECRET as string);
        c.set("user", payload);
        return next();
      } catch (err) {
        return c.json(
          {
            statusCode: 401,
            message: "Invalid token",
            data: { message: "Invalid token" },
          },
          401
        );
      }
    }

    return c.json(
      {
        statusCode: 401,
        message: "Unauthorized",
        data: { message: "Unauthorized" },
      },
      401
    );
  } catch (err) {
    return c.json(
      {
        statusCode: 500,
        message: "Auth middleware error",
        data: { message: "Auth middleware error" },
      },
      500
    );
  }
}

export default authMiddleware;
