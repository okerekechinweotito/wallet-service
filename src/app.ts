import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { logger } from "hono/logger";
import keysRoutes from "./modules/keys/keys.route";
import walletRoutes from "./modules/wallet/wallet.route";
import authRoutes from "./modules/auth/auth.route";
import { swaggerUI } from "@hono/swagger-ui";
import { Scalar } from "@scalar/hono-api-reference";

const app = new Hono();

app.use("*", cors());
app.use("*", prettyJSON());
app.use("*", logger());

app.get("/", (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json(
    {
      status: "200",
      message: "Welcome to the User Service API",
      data: {
        docs: {
          scalar: `${baseUrl}/scalar`,
          swagger: `${baseUrl}/swagger`,
          openapi: `${baseUrl}/openapi`,
        },
      },
    },
    200
  );
});

app.get("/openapi", async (c) => {
  const openapiText = await Bun.file("src/shared/docs/openapi.json").text();
  return c.newResponse(openapiText, 200, {
    "content-type": "application/json",
  });
});

app.get("/swagger", swaggerUI({ url: "/openapi" }));

app.get(
  "/scalar",
  Scalar({
    url: "/openapi",
    theme: "purple",
    pageTitle: "API Docs",
  })
);

app.route("/keys", keysRoutes);
app.route("/wallet", walletRoutes);
app.route("/auth", authRoutes);

export default app;
