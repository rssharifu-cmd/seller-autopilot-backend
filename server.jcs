require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const app = express();

// ─── Middleware ───────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'https://remarkable-naiad-9a20e1.netlify.app'
  ],
  credentials: true
}));

// Stripe webhook needs raw body — must come BEFORE express.json()
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/webhooks/shopify', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cookieParser());

// ─── Routes ──────────────────────────────────────────
app.use('/auth',       require('./routes/auth'));
app.use('/auth/shopify', require('./routes/shopify'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/dashboard',   require('./routes/dashboard'));
app.use('/api/billing',     require('./routes/billing'));
app.use('/webhooks/shopify', require('./routes/webhooks'));
app.use('/webhooks/stripe',  require('./routes/stripeWebhook'));

// ─── Health check ─────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'Seller Autopilot API running ✅', version: '1.0.0' });
});

// ─── Database ─────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── Start ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
