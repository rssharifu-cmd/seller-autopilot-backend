const crypto = require('crypto');

const REDIRECT_URI = 'https://seller-autopilot-app.netlify.app/.netlify/functions/shopify-callback';
const SCOPES = 'read_orders,write_orders,read_inventory,read_products,read_customers';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
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
        body: JSON.stringify({ error: 'Shop parameter is required. Example: mystore.myshopify.com' })
      };
    }

    // Clean shop input
    const cleanShop = shop.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

    // Validate myshopify.com format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(cleanShop)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid shop URL. Format: yourstore.myshopify.com' })
      };
    }

    const apiKey = process.env.SHOPIFY_API_KEY;
    if (!apiKey) {
      console.error('SHOPIFY_API_KEY is not set');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Server misconfiguration: missing API key.' })
      };
    }

    const state = crypto.randomBytes(16).toString('hex');

    // HARDCODED redirect URI — must match exactly what is in Shopify Partner Dashboard
    const authUrl =
      `https://${cleanShop}/admin/oauth/authorize` +
      `?client_id=${apiKey}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${state}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ url: authUrl, state, shop: cleanShop })
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
