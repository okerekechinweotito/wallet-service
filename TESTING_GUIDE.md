# Quick Start & Testing Guide

## Prerequisites

1. **PostgreSQL Database**

   ```bash
   docker run --name wallet-postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_DB=wallet_db \
     -p 5432:5432 -d postgres:15
   ```

2. **Environment Variables**
   Create a `.env` file (or export):

   ```bash
   export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/wallet_db'
   export JWT_SECRET='your-super-secret-jwt-key-change-in-production'
   export GOOGLE_CLIENT_ID='your-google-client-id.apps.googleusercontent.com'
   export GOOGLE_CLIENT_SECRET='your-google-client-secret'
   export PAYSTACK_SECRET='sk_test_your_paystack_secret_key'
   ```

3. **Google OAuth Setup**

   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `http://localhost:3000/auth/google/callback`

4. **Paystack Setup**
   - Sign up at [Paystack](https://paystack.com/)
   - Get your test secret key from the dashboard

## Installation & Setup

```bash
# Install dependencies
bun install

# Initialize database
psql "$DATABASE_URL" -f src/shared/db/init.sql

# Start development server
bun run dev
```

Server will start at `http://localhost:3000`

## Testing the API

### 1. View Documentation

```bash
# Open in browser:
http://localhost:3000/swagger    # Swagger UI
http://localhost:3000/scalar     # Scalar Docs
http://localhost:3000/openapi    # Raw OpenAPI JSON
```

### 2. Authenticate with Google

```bash
# Open in browser (will redirect to Google):
http://localhost:3000/auth/google

# After successful login, you'll get a JWT token:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

# Save this token for subsequent requests
export TOKEN="your-jwt-token-here"
```

### 3. Create an API Key

```bash
curl -X POST http://localhost:3000/keys/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-wallet-service",
    "permissions": ["deposit", "transfer", "read"],
    "expiry": "1D"
  }'

# Response:
{
  "api_key": "sk_live_xxxxx",
  "expires_at": "2025-01-09T12:00:00Z"
}

# Save the API key
export API_KEY="sk_live_xxxxx"
```

### 4. Check Wallet Balance

```bash
# Using JWT
curl http://localhost:3000/wallet/balance \
  -H "Authorization: Bearer $TOKEN"

# Using API Key
curl http://localhost:3000/wallet/balance \
  -H "x-api-key: $API_KEY"

# Response:
{
  "balance": 0
}
```

### 5. Initialize a Deposit

```bash
curl -X POST http://localhost:3000/wallet/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000
  }'

# Response:
{
  "reference": "ps_abc123...",
  "authorization_url": "https://checkout.paystack.com/..."
}

# Open the authorization_url in a browser to complete payment
# After payment, Paystack will call the webhook
```

### 6. Check Deposit Status

```bash
curl http://localhost:3000/wallet/deposit/ps_abc123.../status

# Response:
{
  "reference": "ps_abc123...",
  "status": "success",
  "amount": 10000
}
```

### 7. Transfer to Another Wallet

First, you need another user's wallet number. For testing, you can:

1. Create another user via Google OAuth
2. Check their wallet balance to get their wallet_number from the database

```bash
# Transfer funds
curl -X POST http://localhost:3000/wallet/transfer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_number": "1234567890123",
    "amount": 5000
  }'

# Response:
{
  "status": "success",
  "message": "Transfer completed",
  "reference": "tr_abc123..."
}
```

### 8. View Transaction History

```bash
curl http://localhost:3000/wallet/transactions \
  -H "Authorization: Bearer $TOKEN"

# With pagination:
curl "http://localhost:3000/wallet/transactions?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Response:
[
  {
    "type": "deposit",
    "amount": 10000,
    "status": "success",
    "reference": "ps_abc123...",
    "from_user_id": null,
    "to_wallet_number": "1234567890123",
    "created_at": "2025-01-08T12:00:00Z"
  },
  {
    "type": "transfer",
    "amount": 5000,
    "status": "success",
    "reference": "tr_abc123...",
    "from_user_id": "google-oauth|123456",
    "to_wallet_number": "9876543210987",
    "created_at": "2025-01-08T12:30:00Z"
  }
]
```

### 9. Test Webhook (Manual)

```bash
# Generate signature
BODY='{"event":"charge.success","data":{"reference":"ps_test123","status":"success","amount":500000}}'
SIGNATURE=$(printf "%s" "$BODY" | openssl dgst -sha512 -hmac "$PAYSTACK_SECRET" -hex | sed 's/^.* //')

# Send webhook request
curl -X POST http://localhost:3000/wallet/paystack/webhook \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: $SIGNATURE" \
  -d "$BODY"

# Response:
{
  "status": true
}
```

### 10. Rollover an Expired API Key

```bash
# First, get the ID of an expired key (from database or wait for expiry)
# Assuming you have an expired key ID:
curl -X POST http://localhost:3000/keys/rollover \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "expired_key_id": "old-key-uuid",
    "expiry": "1M"
  }'

# Response:
{
  "api_key": "sk_live_new_key",
  "expires_at": "2025-02-08T12:00:00Z"
}
```

## Testing Scenarios

### Error Cases to Test:

1. **Insufficient Balance**

   ```bash
   # Try to transfer more than balance
   curl -X POST http://localhost:3000/wallet/transfer \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"wallet_number": "1234567890123", "amount": 999999999}'
   ```

2. **Invalid API Key Permission**

   ```bash
   # Create API key with only 'read' permission
   # Try to use it for deposit (should fail)
   curl -X POST http://localhost:3000/wallet/deposit \
     -H "x-api-key: $READ_ONLY_KEY" \
     -H "Content-Type: application/json" \
     -d '{"amount": 1000}'
   ```

3. **Expired API Key**

   ```bash
   # Create key with 1H expiry, wait 1 hour, then try to use it
   ```

4. **Max 5 API Keys Limit**

   ```bash
   # Create 5 API keys, then try to create a 6th (should fail)
   ```

5. **Self-Transfer**

   ```bash
   # Try to transfer to your own wallet_number (should fail)
   ```

6. **Invalid Webhook Signature**
   ```bash
   curl -X POST http://localhost:3000/wallet/paystack/webhook \
     -H "Content-Type: application/json" \
     -H "x-paystack-signature: invalid_signature" \
     -d '{"event":"charge.success","data":{"reference":"ps_test","status":"success","amount":100000}}'
   ```

## Database Queries for Testing

```sql
-- View all users
SELECT * FROM users;

-- View all wallets
SELECT * FROM wallets;

-- View all transactions
SELECT * FROM transactions ORDER BY created_at DESC;

-- View all API keys
SELECT id, user_id, LEFT(key, 20) as key_prefix, permissions, expires_at, revoked
FROM api_keys;

-- Manually expire an API key for testing rollover
UPDATE api_keys SET expires_at = NOW() - INTERVAL '1 day' WHERE id = 'your-key-id';
```

## Troubleshooting

### Port already in use

```bash
lsof -ti:3000 | xargs kill -9
```

### Database connection issues

```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT 1"

# Recreate database
dropdb wallet_db
createdb wallet_db
psql "$DATABASE_URL" -f src/shared/db/init.sql
```

### View logs

Check console output for detailed logs of all operations.

## Production Considerations

Before deploying to production:

1. Use strong `JWT_SECRET` (at least 32 random characters)
2. Use Paystack live keys (starts with `sk_live_`)
3. Enable HTTPS only
4. Set up proper database backups
5. Add rate limiting
6. Consider hashing API keys at rest
7. Set up monitoring and alerting
8. Use environment-specific configurations
9. Review and test webhook idempotency thoroughly
10. Implement proper error tracking (e.g., Sentry)
