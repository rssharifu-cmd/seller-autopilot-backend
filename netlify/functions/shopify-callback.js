const { MongoClient } = require('mongodb');
const axios = require('axios');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  let client;
  try {
    const { shop, code, state } = event.queryStringParameters || {};
    const DASHBOARD_URL = process.env.FRONTEND_URL || 'https://seller-autopilot-app.netlify.app';

    if (!shop || !code || !state) {
      return {
        statusCode: 302,
        headers: { Location: `${DASHBOARD_URL}?shopify=error&reason=missing_params` },
        body: ''
      };
    }

    // Validate shop format
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
    if (!shopRegex.test(shop)) {
      return {
        statusCode: 302,
        headers: { Location: `${DASHBOARD_URL}?shopify=error&reason=invalid_shop` },
        body: ''
      };
    }

    // Exchange code for permanent access token
    const tokenRes = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      console.error('No access token returned from Shopify');
      return {
        statusCode: 302,
        headers: { Location: `${DASHBOARD_URL}?shopify=error&reason=no_token` },
        body: ''
      };
    }

    // Get shop info from Shopify
    const shopRes = await axios.get(
      `https://${shop}/admin/api/2024-01/shop.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    const shopInfo = shopRes.data.shop;

    // Connect to MongoDB
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('seller-autopilot');
    const users = db.collection('users');

    // Try to decode state as JWT to find user
    let userId = null;
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      userId = decoded.id || decoded._id || decoded.userId;
    } catch (e) {
      console.log('State is not a JWT, using shop-based lookup');
    }

    let updateResult;
    if (userId) {
      // Best case: match by user ID
      const { ObjectId } = require('mongodb');
      updateResult = await users.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        {
          $set: {
            'shopify.shop': shop,
            'shopify.accessToken': accessToken,
            'shopify.shopName': shopInfo.name,
            'shopify.shopEmail': shopInfo.email,
            'shopify.currency': shopInfo.currency,
            'shopify.connectedAt': new Date()
          }
        },
        { returnDocument: 'after' }
      );
    } else {
      // Fallback: update by existing shop domain or most recent user
      updateResult = await users.findOneAndUpdate(
        { $or: [{ 'shopify.shop': shop }, { 'shopify.shop': { $exists: false } }] },
        {
          $set: {
            'shopify.shop': shop,
            'shopify.accessToken': accessToken,
            'shopify.shopName': shopInfo.name,
            'shopify.shopEmail': shopInfo.email,
            'shopify.currency': shopInfo.currency,
            'shopify.connectedAt': new Date()
          }
        },
        { sort: { createdAt: -1 }, returnDocument: 'after' }
      );
    }

    if (!updateResult) {
      console.error('No user found to update with Shopify data');
    }

    // Register webhooks (non-blocking)
    const webhookBaseUrl = process.env.WEBHOOK_URL || `${DASHBOARD_URL}/.netlify/functions`;
    const topics = [
      'orders/create',
      'orders/cancelled',
      'orders/fulfilled',
      'checkouts/create',
      'inventory_levels/update'
    ];

    for (const topic of topics) {
      try {
        await axios.post(
          `https://${shop}/admin/api/2024-01/webhooks.json`,
          { webhook: { topic, address: `${webhookBaseUrl}/webhooks`, format: 'json' } },
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        console.log(`Webhook registered: ${topic}`);
      } catch (e) {
        console.log(`Webhook ${topic} already exists or failed:`, e.response?.data?.errors || e.message);
      }
    }

    return {
      statusCode: 302,
      headers: { Location: `${DASHBOARD_URL}?shopify=connected&shop=${encodeURIComponent(shopInfo.name)}` },
      body: ''
    };

  } catch (err) {
    console.error('Shopify callback error:', err.response?.data || err.message);
    const DASHBOARD_URL = process.env.FRONTEND_URL || 'https://seller-autopilot-app.netlify.app';
    return {
      statusCode: 302,
      headers: { Location: `${DASHBOARD_URL}?shopify=error&reason=server_error` },
      body: ''
    };
  } finally {
    if (client) await client.close();
  }
};
