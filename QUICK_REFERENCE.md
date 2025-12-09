# Quick Reference Card - Wallet Service API

## Base URL

```
http://localhost:3000
```

## Documentation URLs

```
http://localhost:3000/swagger    # Swagger UI
http://localhost:3000/scalar     # Scalar Docs
http://localhost:3000/openapi    # OpenAPI JSON
```

## Authentication Headers

### JWT Token

```
Authorization: Bearer <your-jwt-token>
```

### API Key

```
x-api-key: <your-api-key>
```

## Quick Command Reference

### 1. Start Database (Docker)

```bash
docker run --name wallet-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=wallet_db \
  -p 5432:5432 -d postgres:15
```

### 2. Setup Environment

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/wallet_db'
export JWT_SECRET='your-secret-key'
export GOOGLE_CLIENT_ID='your-google-client-id'
export GOOGLE_CLIENT_SECRET='your-google-client-secret'
export PAYSTACK_SECRET='sk_test_your-key'
```

### 3. Initialize Database

```bash
psql "$DATABASE_URL" -f src/shared/db/init.sql
```

### 4. Install & Run

```bash
bun install
bun run dev
```

## API Endpoints Quick Reference

| Endpoint                      | Method | Auth        | Description                 |
| ----------------------------- | ------ | ----------- | --------------------------- |
| `/auth/google`                | GET    | None        | Redirect to Google login    |
| `/auth/google/callback`       | GET    | None        | OAuth callback, returns JWT |
| `/keys/create`                | POST   | JWT         | Create API key              |
| `/keys/rollover`              | POST   | JWT         | Rollover expired API key    |
| `/wallet/balance`             | GET    | JWT/API Key | Get wallet balance          |
| `/wallet/deposit`             | POST   | JWT/API Key | Initialize Paystack deposit |
| `/wallet/transfer`            | POST   | JWT/API Key | Transfer to another wallet  |
| `/wallet/transactions`        | GET    | JWT/API Key | Get transaction history     |
| `/wallet/paystack/webhook`    | POST   | Signature   | Paystack webhook receiver   |
| `/wallet/deposit/:ref/status` | GET    | None        | Check deposit status        |

## API Key Permissions

| Permission | Allows                        |
| ---------- | ----------------------------- |
| `deposit`  | Initialize deposits           |
| `transfer` | Make transfers                |
| `read`     | View balance and transactions |

## Expiry Format

| Format | Duration |
| ------ | -------- |
| `1H`   | 1 hour   |
| `1D`   | 1 day    |
| `1M`   | 1 month  |
| `1Y`   | 1 year   |

## Common Request Bodies

### Create API Key

```json
{
  "name": "my-service",
  "permissions": ["deposit", "transfer", "read"],
  "expiry": "1D"
}
```

### Deposit

```json
{
  "amount": 10000
}
```

### Transfer

```json
{
  "wallet_number": "1234567890123",
  "amount": 5000
}
```

### Rollover API Key

```json
{
  "expired_key_id": "uuid-of-expired-key",
  "expiry": "1M"
}
```

## cURL Examples

### Get Balance (JWT)

```bash
curl http://localhost:3000/wallet/balance \
  -H "Authorization: Bearer $TOKEN"
```

### Get Balance (API Key)

```bash
curl http://localhost:3000/wallet/balance \
  -H "x-api-key: $API_KEY"
```

### Create API Key

```bash
curl -X POST http://localhost:3000/keys/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-service",
    "permissions": ["deposit", "read"],
    "expiry": "1D"
  }'
```

### Initialize Deposit

```bash
curl -X POST http://localhost:3000/wallet/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 10000}'
```

### Transfer Funds

```bash
curl -X POST http://localhost:3000/wallet/transfer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_number": "1234567890123",
    "amount": 5000
  }'
```

### Get Transactions

```bash
curl "http://localhost:3000/wallet/transactions?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

## Error Codes

| Code | Meaning                        |
| ---- | ------------------------------ |
| 200  | Success                        |
| 201  | Created (API key)              |
| 400  | Bad request / Validation error |
| 401  | Unauthorized / Invalid token   |
| 403  | Forbidden / Missing permission |
| 404  | Not found                      |
| 500  | Server error                   |

## Common Errors & Solutions

### "Maximum of 5 active API keys allowed"

**Solution:** Revoke or wait for an existing key to expire

### "Insufficient balance"

**Solution:** Deposit more funds before transferring

### "API key missing [permission] permission"

**Solution:** Use JWT or create a new API key with the required permission

### "Invalid signature" (webhook)

**Solution:** Ensure PAYSTACK_SECRET is correct and signature is properly generated

### "Key not expired" (rollover)

**Solution:** Wait for the key to expire or use a different expired key

### "Cannot transfer to your own wallet"

**Solution:** Use a different recipient wallet number

## Database Quick Queries

```sql
-- View users
SELECT * FROM users;

-- View wallets
SELECT * FROM wallets;

-- View recent transactions
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;

-- View API keys
SELECT id, user_id, LEFT(key, 20) as key_prefix,
       permissions, expires_at, revoked
FROM api_keys;

-- Manually expire an API key for testing
UPDATE api_keys
SET expires_at = NOW() - INTERVAL '1 day'
WHERE id = 'key-uuid';
```

## Troubleshooting

### Kill process on port 3000

```bash
lsof -ti:3000 | xargs kill -9
```

### Reset database

```bash
dropdb wallet_db
createdb wallet_db
psql "$DATABASE_URL" -f src/shared/db/init.sql
```

### Test database connection

```bash
psql "$DATABASE_URL" -c "SELECT 1"
```

## Important Notes

⚠️ **Production Checklist:**

- Use strong JWT_SECRET
- Use Paystack live keys (sk*live*\*)
- Enable HTTPS only
- Set up proper monitoring
- Implement rate limiting
- Consider hashing API keys

💡 **Remember:**

- JWT tokens expire in 7 days
- API keys can have custom expiry
- Amounts in Paystack are in kobo (×100)
- Webhook uses signature validation
- Transfers are atomic (all or nothing)
- Maximum 5 active API keys per user

📚 **More Details:**

- See `README.md` for setup instructions
- See `TESTING_GUIDE.md` for comprehensive testing
- See `IMPLEMENTATION_CHECKLIST.md` for feature verification
- See `/swagger` or `/scalar` for interactive API docs
