const crypto = require('crypto');

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { shop } = event.queryStringParameters || {};

    if (!shop) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Shop parameter required. Example: mystore.myshopify.com' })
      };
    }

    // Clean and validate shop format
    const cleanShop = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
    if (!shopRegex.test(cleanShop)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid shop URL. Use format: yourstore.myshopify.com' })
      };
    }

    const apiKey = process.env.SHOPIFY_API_KEY;
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;

    if (!apiKey || !redirectUri) {
      console.error('Missing env vars: SHOPIFY_API_KEY or SHOPIFY_REDIRECT_URI');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Server configuration error. Contact support.' })
      };
    }

    // Generate secure state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');
    const scopes = 'read_orders,write_orders,read_inventory,read_products,read_customers,write_script_tags';

    const installUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
      },
      body: JSON.stringify({ url: installUrl, state, shop: cleanShop })
    };

  } catch (err) {
    console.error('shopify-connect error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + err.message })
    };
  }
};
