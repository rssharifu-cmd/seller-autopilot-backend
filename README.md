# Shopify Automation App — Vercel Edition

AI-powered Shopify webhook automation using **Gemini AI** + **Resend** + **MongoDB**, deployed on **Vercel Serverless Functions**.

## Webhook Topics Handled

| Topic | Action |
|-------|--------|
| `checkouts/create` | Sends AI-written abandoned cart recovery email to customer |
| `orders/create` | Sends AI-written order confirmation / welcome email to customer |
| `inventory_levels/update` | Sends low-stock alert email to store owner when stock ≤ threshold |

## Project Structure

```
├── api/
│   ├── webhook.js        ← Main entry point (all 3 topics handled here)
│   └── stats.js          ← Dashboard stats API (email counts + revenue)
├── scripts/
│   └── test-webhook.js   ← Local test runner
├── vercel.json           ← Vercel deployment config
├── package.json
└── .env.example
```

## Quick Start

### 1. Clone & Install
```bash
npm install
```

### 2. Set Environment Variables
```bash
cp .env.example .env.local
# Fill in all values in .env.local
```

### 3. Deploy to Vercel
```bash
# Set each secret in Vercel dashboard or CLI:
vercel env add GEMINI_API_KEY
vercel env add RESEND_API_KEY
vercel env add MONGODB_URI
# ... (repeat for all vars in .env.example)

vercel --prod
```

### 4. Register Webhooks in Shopify
Go to **Shopify Admin → Settings → Notifications → Webhooks** and add:

| Event | URL |
|-------|-----|
| Checkout created | `https://your-app.vercel.app/api/webhook` |
| Order created | `https://your-app.vercel.app/api/webhook` |
| Inventory level update | `https://your-app.vercel.app/api/webhook` |

Copy the **Webhook signing secret** from Shopify and set it as `SHOPIFY_WEBHOOK_SECRET`.

### 5. Test Locally
```bash
vercel dev          # Start local dev server on port 3000
npm run test:webhook  # Run test payloads against local server
```

## MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `email_stats` | Daily email counts + revenue by type |
| `inventory_alerts` | Low-stock alert history per variant |

### Fetch Dashboard Stats
```bash
curl https://your-app.vercel.app/api/stats \
  -H "x-api-key: YOUR_DASHBOARD_API_KEY"
```

## Key Differences from Netlify

| | Netlify | Vercel |
|--|---------|--------|
| Entry point | `netlify/functions/*.js` | `api/webhook.js` |
| Raw body | `event.body` | Async iterator via `for await` |
| Config | `netlify.toml` | `vercel.json` |
| Env secrets | Netlify UI / CLI | Vercel UI / CLI (`vercel env add`) |
| `bodyParser` | N/A | Must set `export const config = { api: { bodyParser: false } }` |

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_WEBHOOK_SECRET` | ✅ | HMAC signing secret from Shopify |
| `SHOPIFY_STORE_DOMAIN` | ✅ | e.g. `your-store.myshopify.com` |
| `GEMINI_API_KEY` | ✅ | Google AI Studio key |
| `RESEND_API_KEY` | ✅ | Resend.com API key |
| `FROM_EMAIL` | ✅ | Verified sender email |
| `STORE_NAME` | ✅ | Shown in email footer |
| `STORE_OWNER_EMAIL` | ✅ | Receives low-stock alerts |
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | ✅ | Database name (default: `shopify_automation`) |
| `LOW_STOCK_THRESHOLD` | ✅ | Alert when stock ≤ this value (default: `5`) |
| `DASHBOARD_API_KEY` | ✅ | Secret key to protect `/api/stats` |
