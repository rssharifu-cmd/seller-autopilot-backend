const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');

const REDIRECT_URI = 'https://seller-autopilot-app.netlify.app/.netlify/functions/shopify-callback';
const DASHBOARD_URL = 'https://seller-autopilot-app.netlify.app';

exports.handler = async (event) => {
  let client;
  try {
    const { shop, code, state } = event.queryStringParameters || {};

    if (!shop || !code) {
      console.error('Missing params:', { shop, code, state });
      return redirect(`${DASHBOARD_URL}?shopify=error&reason=missing_params`);
    }

    const cleanShop = shop.trim().toLowerCase();

    // 1. Exchange code for permanent access token
    const tokenRes = await axios.post(
      `https://${cleanShop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
      }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      console.error('Shopify returned no access token');
      return redirect(`${DASHBOARD_URL}?shopify=error&reason=no_token`);
    }

    // 2. Fetch shop info
    const shopRes = await axios.get(
      `https://${cleanShop}/admin/api/2024-01/shop.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    const shopInfo = shopRes.data.shop;

    // 3. Save to MongoDB
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI is not set');
      return redirect(`${DASHBOARD_URL}?shopify=error&reason=db_config`);
    }

    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const users = client.db('seller-autopilot').collection('users');

    // Upsert by shop domain — creates record if not exists, updates if does
    const result = await users.findOneAndUpdate(
      { 'shopify.shop': cleanShop },
      {
        $set: {
          'shopify.shop': cleanShop,
          'shopify.accessToken': accessToken,
          'shopify.shopName': shopInfo.name,
          'shopify.shopEmail': shopInfo.email,
          'shopify.currency': shopInfo.currency,
          'shopify.plan': shopInfo.plan_name,
          'shopify.connectedAt': new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    console.log('Shopify connected for shop:', cleanShop);

    // 4. Register webhooks (best-effort, non-blocking)
    const webhooks = ['orders/create', 'orders/cancelled', 'orders/fulfilled', 'inventory_levels/update'];
    const webhookAddr = `${DASHBOARD_URL}/.netlify/functions/automation`;

    for (const topic of webhooks) {
      try {
        await axios.post(
          `https://${cleanShop}/admin/api/2024-01/webhooks.json`,
          { webhook: { topic, address: webhookAddr, format: 'json' } },
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        console.log('Webhook registered:', topic);
      } catch (e) {
        console.log('Webhook skip (may exist):', topic);
      }
    }

    return redirect(`${DASHBOARD_URL}?shopify=connected&shop=${encodeURIComponent(shopInfo.name)}`);

  } catch (err) {
    console.error('shopify-callback error:', err.response?.data || err.message);
    return redirect(`${DASHBOARD_URL}?shopify=error&reason=server_error`);
  } finally {
    if (client) {
      try { await client.close(); } catch (_) {}
    }
  }
};

function redirect(url) {
  return { statusCode: 302, headers: { Location: url }, body: '' };
}
