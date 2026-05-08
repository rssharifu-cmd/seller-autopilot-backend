const { MongoClient } = require('mongodb');
const axios = require('axios');

exports.handler = async (event) => {
  const { code, shop, error } = event.queryStringParameters || {};

  if (error) {
    return { statusCode: 302, headers: { Location: '/?shopify=error&reason=' + error } };
  }

  if (!code || !shop) {
    return { statusCode: 302, headers: { Location: '/?shopify=error&reason=missing_params' } };
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });

    const accessToken = tokenResponse.data.access_token;

    // Save to MongoDB
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('seller-autopilot');

    // Try to find user by session cookie or just update the most recent user
    // Store shop connection globally for now
    await db.collection('shops').updateOne(
      { shop },
      {
        $set: {
          shop,
          accessToken,
          connectedAt: new Date(),
          active: true
        }
      },
      { upsert: true }
    );

    // Register webhooks
    const webhookTopics = ['orders/create', 'carts/create', 'inventory_levels/update'];
    const baseUrl = 'https://seller-autopilot-app.netlify.app/.netlify/functions/automation';

    for (const topic of webhookTopics) {
      try {
        await axios.post(
          `https://${shop}/admin/api/2023-10/webhooks.json`,
          { webhook: { topic, address: baseUrl, format: 'json' } },
          { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        // Webhook may already exist, ignore
      }
    }

    await client.close();

    // Redirect back to dashboard with success
    return {
      statusCode: 302,
      headers: { Location: '/?shopify=success&shop=' + encodeURIComponent(shop) }
    };

  } catch (err) {
    console.error('Shopify callback error:', err.message);
    return {
      statusCode: 302,
      headers: { Location: '/?shopify=error&reason=token_exchange_failed' }
    };
  }
};
