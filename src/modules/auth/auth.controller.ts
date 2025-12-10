import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { db } from "../../shared/services/db.service";
import { users } from "../../shared/db/schema";
import { sql } from "drizzle-orm";
import logger from "../../utils/logger";

const router = new Hono();

const GOOGLE_CLIENT_ID =
  (typeof Bun !== "undefined" && Bun.env && Bun.env.GOOGLE_CLIENT_ID) ||
  process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET =
  (typeof Bun !== "undefined" && Bun.env && Bun.env.GOOGLE_CLIENT_SECRET) ||
  process.env.GOOGLE_CLIENT_SECRET;
const JWT_SECRET =
  (typeof Bun !== "undefined" && Bun.env && Bun.env.JWT_SECRET) ||
  process.env.JWT_SECRET ||
  "";

// Redirect to Google for consent
router.get("/google", async (c) => {
  if (!GOOGLE_CLIENT_ID)
    return c.json(
      {
        statusCode: 500,
        message: "GOOGLE_CLIENT_ID not configured",
        data: { message: "GOOGLE_CLIENT_ID not configured" },
      },
      500
    );
  const baseUrl =
    (typeof Bun !== "undefined" && Bun.env && Bun.env.BASE_URL) ||
    process.env.BASE_URL ||
    new URL(c.req.url).origin;
  const redirectUri = `${baseUrl.replace(/\/$/, "")}/auth/google/callback`;
  logger.info("Auth redirect URI", { redirectUri });
  const scope = encodeURIComponent("openid email profile");
  const state = encodeURIComponent("state-");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${scope}&access_type=online&state=${state}`;
  return c.redirect(url, 302);
});

// Callback to exchange code for tokens and create/return JWT
router.get("/google/callback", async (c) => {
  try {
    const code = c.req.query("code") || "";
    const baseUrl =
      (typeof Bun !== "undefined" && Bun.env && Bun.env.BASE_URL) ||
      process.env.BASE_URL ||
      new URL(c.req.url).origin;
    const redirectUri = `${baseUrl.replace(/\/$/, "")}/auth/google/callback`;
    logger.info("Auth callback invoked", { redirectUri, codePresent: !!code });
    if (!code)
      return c.json(
        {
          statusCode: 400,
          message: "Missing code",
          data: { message: "Missing code" },
        },
        400
      );
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET)
      return c.json(
        {
          statusCode: 500,
          message: "Google credentials not configured",
          data: { message: "Google credentials not configured" },
        },
        500
      );

    logger.info("Exchanging code for token", {
      code: code.substring(0, 10) + "...",
    });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: GOOGLE_CLIENT_ID as string,
        client_secret: GOOGLE_CLIENT_SECRET as string,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      logger.error("Google token exchange request failed", {
        status: tokenRes.status,
        error: errorText,
      });
      return c.json(
        {
          statusCode: 500,
          message: "Failed to exchange code for token",
          data: { message: "Failed to exchange code for token" },
        },
        500
      );
    }

    const tokenJson = await tokenRes.json();
    logger.info("Token exchange response", {
      hasIdToken: !!tokenJson.id_token,
      hasAccessToken: !!tokenJson.access_token,
    });
    const id_token = tokenJson.id_token;
    if (!id_token) {
      logger.error("Google token exchange failed", { detail: tokenJson });
      return c.json(
        {
          statusCode: 500,
          message: "Failed to get id_token from Google",
          data: { message: "Failed to get id_token from Google" },
        },
        500
      );
    }

    // Verify id_token with Google (or decode locally)
    logger.info("Verifying id_token with Google");
    const userInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${id_token}`
    );
    const userInfo = await userInfoRes.json();
    logger.info("User info retrieved", {
      sub: userInfo.sub,
      email: userInfo.email,
    });
    const userId = userInfo.sub;
    const email = userInfo.email;
    const name = userInfo.name;

    // create user if not exists
    logger.info("Creating/updating user in database", { userId, email });
    await db
      .insert(users)
      .values({ id: userId, email, name })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: sql`EXCLUDED.email`, name: sql`EXCLUDED.name` },
      });
    logger.info("User created/updated successfully");

    // sign JWT for our service
    if (!JWT_SECRET) {
      logger.error("JWT_SECRET not configured for signing");
      return c.json(
        {
          statusCode: 500,
          message: "JWT_SECRET not configured",
          data: { message: "JWT_SECRET not configured" },
        },
        500
      );
    }
    const token = jwt.sign({ sub: userId, email, name }, JWT_SECRET as string, {
      expiresIn: "7d",
    });

    logger.info("User logged in via Google", { userId, email });
    return c.json({ token }, 200);
  } catch (err: any) {
    logger.error("Auth callback error", {
      error: err?.message,
      stack: err?.stack,
    });
    return c.json(
      {
        statusCode: 500,
        message: err?.message || "Auth callback error",
        data: { message: err?.message || "Auth callback error" },
      },
      500
    );
  }
});

export default router;
