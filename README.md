# Wallet Service Backend

This project is a backend wallet service built with Bun, Hono, and PostgreSQL. It provides:

- Google Sign-in (JWT authentication)
- API key management (permissions, expiry, rollover)
- Paystack deposit integration (with mandatory webhook)
- Wallet balances, transaction history, wallet-to-wallet transfers
- OpenAPI documentation at `/openapi`, `/swagger`, and `/scalar`

## Quick Start

### 1. Install dependencies
```bash
bun install
```

### 2. Setup PostgreSQL (Docker recommended)
Run a local Postgres instance for development:
```bash
docker run --name wallet-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=wallet_db \
  -p 5432:5432 -d postgres:15
```

### 3. Configure environment variables
Create a `.env` file at the repo root or export these in your shell. Example values shown for local development only:
```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/wallet_db'
export JWT_SECRET='your-strong-jwt-secret'
export GOOGLE_CLIENT_ID='your-google-client-id.apps.googleusercontent.com'
export GOOGLE_CLIENT_SECRET='your-google-client-secret'
export PAYSTACK_SECRET='sk_test_your_paystack_secret'
```

### 4. Initialize the database
```bash
psql "$DATABASE_URL" -f src/shared/db/init.sql
```

### 5. Run the development server
```bash
bun run dev
```

Server will be available at: http://localhost:3000

## Documentation Endpoints

- OpenAPI JSON: `http://localhost:3000/openapi`
- Swagger UI: `http://localhost:3000/swagger`
- Scalar docs: `http://localhost:3000/scalar`

Open any of these in the browser to explore and test the API.

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing secret (keep secret in production)
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `PAYSTACK_SECRET` — Paystack secret key (used for verify and webhook validation)

## Key Endpoints (Overview)
See the OpenAPI docs for full request/response schemas and examples.

### Authentication
- `GET /auth/google` — Redirect to Google sign-in
- `GET /auth/google/callback` — OAuth callback, returns JWT

### API Keys (JWT required)
- `POST /keys/create` — Create API key
- `POST /keys/rollover` — Rollover an expired API key

### Wallet Operations
- `GET /wallet/balance` — Get wallet balance
- `POST /wallet/deposit` — Initialize Paystack deposit
- `POST /wallet/paystack/webhook` — Paystack webhook (server-to-server)
- `GET /wallet/paystack/webhook` — Paystack browser redirect (callback_url)
- `GET /wallet/deposit/{reference}/status` — Verify deposit status (read-only)
- `POST /wallet/transfer` — Transfer funds to another wallet
- `GET /wallet/transactions` — Transaction history


## Next Steps / Improvements

- Add automated DB migrations (e.g., migrate tool)
- Add unit and integration tests
- Hash API keys at rest
- Add monitoring and rate limiting

---
