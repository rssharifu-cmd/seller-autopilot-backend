# Seller Autopilot — Backend

## Setup করার steps

### 1. MongoDB Atlas (Free database)
- mongodb.com/atlas এ যাও
- Free account খোলো
- New cluster বানাও (M0 Free)
- Database user বানাও
- Connection string copy করো → .env এ MONGODB_URI তে দাও

### 2. Shopify Partner App
- partners.shopify.com এ যাও
- Apps → Create App → Custom App
- API Key ও Secret copy করো → .env এ দাও
- App URL: https://your-app.railway.app
- Redirect URL: https://your-app.railway.app/auth/shopify/callback

### 3. Gemini API (Free)
- aistudio.google.com এ যাও
- API Key বানাও → .env এ GEMINI_API_KEY তে দাও
- Free tier: 15 requests/minute, 1M tokens/day (যথেষ্ট)

### 4. Stripe
- stripe.com এ account খোলো
- Dashboard → API Keys → Secret Key copy করো
- Products → Create Product → Monthly $19 → Price ID copy করো
- Webhooks → Add endpoint → https://your-app.railway.app/webhooks/stripe

### 5. Railway Deploy (Free tier)
- railway.app এ যাও
- GitHub দিয়ে login
- New Project → Deploy from GitHub
- এই folder টা GitHub এ upload করো
- Environment Variables এ .env এর সব values দাও
- Deploy!

## Local এ test করতে
\`\`\`bash
npm install
cp .env.example .env
# .env fill করো
npm run dev
\`\`\`

## API Endpoints
- POST /auth/signup
- POST /auth/login
- GET  /auth/me
- GET  /auth/shopify/connect?shop=xxx
- GET  /auth/shopify/callback
- GET  /api/dashboard
- GET  /api/automations
- PATCH /api/automations
- POST /api/billing/subscribe
- POST /api/billing/portal
