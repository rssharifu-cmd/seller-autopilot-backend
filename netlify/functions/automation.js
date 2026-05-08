const { MongoClient } = require('mongodb');
const axios = require('axios');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    const { shop, code } = event.queryStringParameters || {};

    if (!shop || !code) {
      return { statusCode: 302, headers: { Location: 'https://seller-autopilot-app.netlify.app/?shopify=error&reason=missing_params' }, body: '' };
    }

    // Exchange code for access token
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });

    const accessToken = tokenRes.data.access_token;

    // Save to MongoDB
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const users = client.db('seller-autopilot').collection('users');

    // Update most recent user without shopify connected
    await users.findOneAndUpdate(
      { 'shopify.shop': { $exists: false } },
      {
        $set: {
          'shopify.shop': shop,
          'shopify.accessToken': accessToken,
          'shopify.connectedAt': new Date()
        }
      },
      { sort: { createdAt: -1 } }
    );

    await client.close();

    // Register webhooks
    const webhookUrl = 'https://seller-autopilot-app.netlify.app/.netlify/functions/automation';
    const topics = ['orders/create', 'orders/cancelled', 'checkouts/create', 'inventory_levels/update'];

    for (const topic of topics) {
      try {
        await axios.post(
          `https://${shop}/admin/api/2024-01/webhooks.json`,
          { webhook: { topic, address: webhookUrl, format: 'json' } },
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
      } catch (e) { /* webhook may already exist */ }
    }

    return {
      statusCode: 302,
      headers: { Location: 'https://seller-autopilot-app.netlify.app/?shopify=connected' },
      body: ''
    };
  } catch (err) {
    console.error('Shopify callback error:', err.message);
    return {
      statusCode: 302,
      headers: { Location: `https://seller-autopilot-app.netlify.app/?shopify=error&reason=${encodeURIComponent(err.message)}` },
      body: ''
    };
  }
};
