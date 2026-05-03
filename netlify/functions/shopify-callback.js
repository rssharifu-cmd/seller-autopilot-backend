const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    const { shop, code, state } = event.queryStringParameters || {};

    if (!shop || !code) {
      return { statusCode: 400, body: 'Missing parameters' };
    }

    // Exchange code for access token
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });

    const accessToken = tokenRes.data.access_token;

    // Get shop info
    const shopRes = await axios.get(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });

    const shopInfo = shopRes.data.shop;

    // Save to MongoDB — find user by state or update by shop
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const users = client.db('seller-autopilot').collection('users');

    // Update the most recently created user (in production, use state to match user)
    await users.findOneAndUpdate(
      { 'shopify.shop': { $exists: false } },
      {
        $set: {
          'shopify.shop': shop,
          'shopify.accessToken': accessToken,
          'shopify.shopName': shopInfo.name,
          'shopify.connectedAt': new Date()
        }
      },
      { sort: { createdAt: -1 } }
    );

    await client.close();

    // Redirect to dashboard
    return {
      statusCode: 302,
      headers: {
        Location: 'https://seller-autopilot-app.netlify.app?shopify=connected'
      },
      body: ''
    };
  } catch (err) {
    console.error('Shopify callback error:', err.message);
    return {
      statusCode: 302,
      headers: {
        Location: 'https://seller-autopilot-app.netlify.app?shopify=error'
      },
      body: ''
    };
  }
};
