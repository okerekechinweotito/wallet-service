import { Context } from "hono";
import jwt from "jsonwebtoken";
import { query } from "../shared/services/db.service";

const JWT_SECRET =
  (typeof Bun !== "undefined" && Bun.env && Bun.env.JWT_SECRET) ||
  process.env.JWT_SECRET ||
  "";

export async function authMiddleware(c: Context, next: any) {
  try {
    const apiKey = c.req.header("x-api-key");
    if (apiKey) {
      // Lookup API key in DB
      try {
        const res = await query("SELECT * FROM api_keys WHERE key = $1", [
          apiKey,
        ]);
        if (res.rowCount === 0)
          return c.json({ error: "Invalid API key" }, 401);
        const key = res.rows[0];
        if (key.revoked) return c.json({ error: "API key revoked" }, 401);
        if (key.expires_at && new Date(key.expires_at) < new Date())
          return c.json({ error: "API key expired" }, 401);

        // attach api key info and user context
        c.set("apiKey", apiKey);
        c.set("apiKeyId", key.id);
        c.set("apiKeyPermissions", key.permissions || []);
        c.set("user", { id: key.user_id });
        return next();
      } catch (err) {
        return c.json({ error: "API key lookup error" }, 500);
      }
    }

    const auth = c.req.header("authorization");
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.replace("Bearer ", "").trim();
      if (!JWT_SECRET) {
        return c.json({ error: "JWT_SECRET not configured" }, 500);
      }
      try {
        const payload = jwt.verify(token, JWT_SECRET as string);
        c.set("user", payload);
        return next();
      } catch (err) {
        return c.json({ error: "Invalid token" }, 401);
      }
    }

    return c.json({ error: "Unauthorized" }, 401);
  } catch (err) {
    return c.json({ error: "Auth middleware error" }, 500);
  }
}

export default authMiddleware;
