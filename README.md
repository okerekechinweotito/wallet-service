To install dependencies:
```sh
```bash
bun install
```

## Run (development)

```bash
bun run dev
```

open http://localhost:3000

---

# Wallet Service (Stage 8)

This repository implements a backend Wallet Service with:

- Google Sign-in (issues JWT tokens)
- API Key management for service-to-service access (permissions, expiry, rollover)
- Paystack deposit initialization and webhook handling (mandatory webhook)
- Wallet balances, transaction history, and wallet-to-wallet transfers
- PostgreSQL persistence
- OpenAPI documentation served at `/openapi`, `/swagger`, and `/scalar`

This README explains how to set up, run, and test the service locally.

## Prerequisites

- Bun (runtime and package manager)
- A running PostgreSQL instance (a Docker postgres is assumed available locally)
- `psql` (or another way to run SQL scripts)

Example Docker for Postgres (optional):

```bash
docker run --name wallet-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=wallet_db -p 5432:5432 -d postgres:15
```

## Environment Variables

Set the following environment variables (we rely on Bun's env support or process.env):

- `DATABASE_URL` — PostgreSQL connection string, e.g.: `postgresql://postgres:postgres@localhost:5432/wallet_db`
- `JWT_SECRET` — secret used to sign JWTs (keep private)
- `GOOGLE_CLIENT_ID` — OAuth client id for Google sign-in
- `GOOGLE_CLIENT_SECRET` — OAuth client secret for Google sign-in
- `PAYSTACK_SECRET` — Paystack secret key for API calls and webhook verification

You can export them in zsh before running the app:

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/wallet_db'
export JWT_SECRET='a_strong_random_secret'
export GOOGLE_CLIENT_ID='your_google_client_id'
export GOOGLE_CLIENT_SECRET='your_google_client_secret'
export PAYSTACK_SECRET='sk_test_xxx'
```

## Install

```bash
bun install
```

## Database initialization

Run the SQL migration to create the required tables:

```bash
psql "$DATABASE_URL" -f src/shared/db/init.sql
```

This creates the `users`, `wallets`, `transactions`, and `api_keys` tables used by the service.

## Run (development)

```bash
bun run dev
```

The server serves:

- API root: `http://localhost:3000/`
- Raw OpenAPI JSON: `http://localhost:3000/openapi`
- Swagger UI: `http://localhost:3000/swagger`
- Scalar docs: `http://localhost:3000/scalar`

## Key Endpoints (summary)

Authentication
- `GET /auth/google` — redirect to Google sign-in
- `GET /auth/google/callback` — callback, returns `{ token: <JWT> }`

API Keys (requires JWT auth)
- `POST /keys/create` — create API key. Body: `{ name, permissions: ["deposit","transfer","read"], expiry: "1D" }` → returns `{ api_key, expires_at }`.
- `POST /keys/rollover` — rollover an expired key. Body: `{ expired_key_id, expiry }`.

Wallet
- `POST /wallet/deposit` — init Paystack deposit. Body: `{ amount }`. Requires `deposit` permission for API keys.
- `POST /wallet/paystack/webhook` — Paystack webhook (signature validated). Server credits wallet only on success.
- `GET /wallet/deposit/{reference}/status` — query Paystack for reference status (does not credit).
- `GET /wallet/balance` — get wallet balance (JWT or API key with `read` permission). Optional `user_id` query param for API key usage.
- `POST /wallet/transfer` — transfer to another wallet. Body: `{ wallet_number, amount }`. Requires `transfer` permission for API keys.
- `GET /wallet/transactions` — list transactions (JWT or API key with `read` permission). Supports `page` and `limit`.

See the full API documentation at `/openapi`, or use Swagger UI at `/swagger`.

## Testing Paystack webhook locally

You can simulate a Paystack webhook by making a POST to `/wallet/paystack/webhook` with a JSON body similar to Paystack's and a correct `x-paystack-signature` header.

Example (generate signature using `PAYSTACK_SECRET`):

```bash
BODY='{"event":"charge.success","data":{"reference":"ps_testref","status":"success","amount":500000}}'
SIGNATURE=$(printf "%s" "$BODY" | openssl dgst -sha512 -hmac "$PAYSTACK_SECRET" -hex | sed 's/^.* //')

curl -X POST http://localhost:3000/wallet/paystack/webhook \
	-H "Content-Type: application/json" \
	-H "x-paystack-signature: $SIGNATURE" \
	-d "$BODY"
```

Note: amounts are in kobo (multiply by 100 when initializing Paystack transactions in `POST /wallet/deposit`). The code stores and returns base-unit (e.g., Naira) amounts.

## OpenAPI / Swagger

The OpenAPI specification is in `src/shared/docs/openapi.json`. The server exposes it at `/openapi` and provides Swagger UI at `/swagger` and Scalar docs at `/scalar`.

If you change endpoints, update the OpenAPI JSON accordingly.

## Security notes

- API keys are stored in the `api_keys` table. For production, consider storing only hashed API keys and never returning stored key values after creation.
- Validate webhooks using `PAYSTACK_SECRET` (already implemented).
- Enforce HTTPS and secure storage of secrets in production.

## Next steps / TODOs

- Add automated DB migrations (instead of manual `init.sql`).
- Add unit and integration tests (especially for webhook idempotency and transfers).
- Hash API keys at rest, avoid storing plaintext keys.
- Add monitoring/metrics and rate limiting for payment endpoints.

---

If you'd like, I can also add a `README.dev.md` with quick dev commands, or generate a Postman collection from the OpenAPI spec.
