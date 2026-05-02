const router = require('express').Router();
const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, SHOPIFY_REDIRECT_URI, APP_URL, FRONTEND_URL } = process.env;

// GET /auth/shopify/connect?shop=mystore.myshopify.com
router.get('/connect', authMiddleware, (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Shop parameter required' });

  const state = crypto.randomBytes(16).toString('hex');
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${SHOPIFY_REDIRECT_URI}&state=${state}`;

  // Store state + userId in cookie for verification
  res.cookie('shopify_state', state, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  res.cookie('shopify_user', req.user._id.toString(), { httpOnly: true, maxAge: 10 * 60 * 1000 });

  res.json({ url: installUrl });
});

// GET /auth/shopify/callback
router.get('/callback', async (req, res) => {
  try {
    const { shop, code, state } = req.query;
    const storedState = req.cookies.shopify_state;
    const userId = req.cookies.shopify_user;

    // Verify state
    if (state !== storedState) return res.status(403).send('State mismatch');

    // Exchange code for access token
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });

    const accessToken = tokenRes.data.access_token;

    // Save to user
    await User.findByIdAndUpdate(userId, {
      'shopify.shop': shop,
      'shopify.accessToken': accessToken,
      'shopify.connectedAt': new Date()
    });

    // Register webhooks on their store
    await registerWebhooks(shop, accessToken);

    // Redirect to dashboard
    res.redirect(`${FRONTEND_URL}/dashboard?shopify=connected`);
  } catch (err) {
    console.error('Shopify callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/dashboard?shopify=error`);
  }
});

// Register Shopify webhooks
async function registerWebhooks(shop, accessToken) {
  const webhooks = [
    { topic: 'orders/create',     address: `${process.env.APP_URL}/webhooks/shopify/order-created` },
    { topic: 'orders/cancelled',  address: `${process.env.APP_URL}/webhooks/shopify/order-cancelled` },
    { topic: 'checkouts/create',  address: `${process.env.APP_URL}/webhooks/shopify/checkout-created` },
    { topic: 'inventory_levels/update', address: `${process.env.APP_URL}/webhooks/shopify/inventory-update` }
  ];

  for (const webhook of webhooks) {
    try {
      await axios.post(
        `https://${shop}/admin/api/2024-01/webhooks.json`,
        { webhook: { topic: webhook.topic, address: webhook.address, format: 'json' } },
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      console.log(`✅ Webhook registered: ${webhook.topic}`);
    } catch (err) {
      console.error(`❌ Webhook failed: ${webhook.topic}`, err.message);
    }
  }
}

module.exports = router;
