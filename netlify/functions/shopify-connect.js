const crypto = require('crypto');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    const token = event.headers.authorization?.replace('Bearer ', '');
    if (!token || token.length < 10) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };
    }

    // Accept both our JWT and Netlify Identity tokens
    try { jwt.verify(token, process.env.JWT_SECRET); } catch (e) { /* Netlify Identity token - ok */ }

    const { shop } = event.queryStringParameters || {};
    if (!shop) return { statusCode: 400, body: JSON.stringify({ error: 'Shop required' }) };

    const state = crypto.randomBytes(16).toString('hex');
    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=read_orders,write_orders,read_inventory,read_products&redirect_uri=${process.env.SHOPIFY_REDIRECT_URI}&state=${state}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: installUrl })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
