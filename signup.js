const crypto = require('crypto');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    const token = event.headers.authorization?.replace('Bearer ', '');
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { shop } = event.queryStringParameters || {};

    if (!shop) return { statusCode: 400, body: JSON.stringify({ error: 'Shop parameter required' }) };

    const state = crypto.randomBytes(16).toString('hex');
    const scopes = 'read_orders,write_orders,read_inventory,read_products';
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
    const apiKey = process.env.SHOPIFY_API_KEY;

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}&grant_options[]=value`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: installUrl, state })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
