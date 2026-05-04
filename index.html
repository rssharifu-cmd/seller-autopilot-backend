const { MongoClient } = require('mongodb');
const axios = require('axios');

async function callGemini(prompt) {
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }] }
  );
  return res.data.candidates[0].content.parts[0].text;
}

exports.handler = async (event) => {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const users = await client.db('seller-autopilot').collection('users').find({
      'shopify.shop': { $exists: true },
      'automations.dailyRevenueSummary': true
    }).toArray();
    await client.close();

    for (const user of users) {
      if (!user.shopify?.accessToken) continue;

      // Get today's orders from Shopify
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const ordersRes = await axios.get(
        `https://${user.shopify.shop}/admin/api/2024-01/orders.json?created_at_min=${today.toISOString()}&status=any`,
        { headers: { 'X-Shopify-Access-Token': user.shopify.accessToken } }
      );

      const orders = ordersRes.data.orders || [];
      const revenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
      const topProduct = orders[0]?.line_items?.[0]?.name || 'N/A';

      const prompt = `Write a brief daily sales summary for a Shopify store owner.
Date: ${new Date().toDateString()}
Orders today: ${orders.length}
Revenue today: $${revenue.toFixed(2)}
Top product: ${topProduct}
Keep it short, friendly, use emojis. Under 60 words.`;

      const summary = await callGemini(prompt);
      console.log(`📊 Daily summary for ${user.email}:\n${summary}`);
    }

    return { statusCode: 200, body: 'Daily summaries sent' };
  } catch (err) {
    console.error('Daily summary error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
