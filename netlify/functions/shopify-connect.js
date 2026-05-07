const crypto = require('crypto');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    // Auth check
    const token = event.headers.authorization?.replace('Bearer ', '') ||
                  event.headers.Authorization?.replace('Bearer ', '');

    if (!token) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated. Please login first.' })
      };
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid or expired token.' })
      };
    }

    const { shop } = event.queryStringParameters || {};

    if (!shop) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Shop parameter required. Example: mystore.myshopify.com' })
      };
    }

    // Validate shop format
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
    if (!shopRegex.test(shop)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid shop URL format. Use: yourstore.myshopify.com' })
      };
    }

    const state = crypto.randomBytes(16).toString('hex');
    const scopes = 'read_orders,write_orders,read_inventory,read_products,read_customers';
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
    const apiKey = process.env.SHOPIFY_API_KEY;

    if (!redirectUri || !apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error. Contact support.' })
      };
    }

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ url: installUrl, state, shop })
    };

  } catch (err) {
    console.error('shopify-connect error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error.' })
    };
  }
};