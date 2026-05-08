const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');

async function callGemini(prompt) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    return res.data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}

async function sendEmail(to, subject, body) {
  if (!to) return console.log('No recipient');
  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: 'Seller Autopilot <onboarding@resend.dev>',
        to: [to],
        subject,
        text: body
      },
      { headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    console.log(`✅ Email sent to ${to}`);
  } catch (err) {
    console.error('Email error:', err.response?.data || err.message);
  }
}

async function getUserByShop(shop) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const user = await client.db('seller-autopilot').collection('users').findOne({ 'shopify.shop': shop });
  await client.close();
  return user;
}

async function updateStats(shop, field) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  await client.db('seller-autopilot').collection('users').updateOne(
    { 'shopify.shop': shop },
    { $inc: { [`stats.${field}`]: 1 } }
  );
  await client.close();
}

exports.handler = async (event) => {
  try {
    const shop = event.headers['x-shopify-shop-domain'];
    const topic = event.headers['x-shopify-topic'];
    if (!shop || !topic) return { statusCode: 400, body: 'Missing headers' };

    const data = JSON.parse(event.body);
    const user = await getUserByShop(shop);
    if (!user) return { statusCode: 200, body: 'No user found' };

    switch(topic) {
      case 'orders/create': {
        if (!user.automations?.welcomeEmail) break;
        const emailBody = await callGemini(`Write a warm order confirmation email. Customer: ${data.customer?.first_name || 'Customer'}. Order #${data.order_number}. Total: ${data.total_price} ${data.currency}. Under 100 words. Email body only.`);
        if (emailBody) {
          await sendEmail(data.customer?.email, `Order #${data.order_number} Confirmed! 🎉`, emailBody);
          await updateStats(shop, 'emailsSent');
        }
        break;
      }
      case 'orders/cancelled': {
        if (!user.automations?.refundAutoReply) break;
        const emailBody = await callGemini(`Write a refund acknowledgment email. Customer: ${data.customer?.first_name || 'Customer'}. Order #${data.order_number}. 3-5 business days. Under 80 words. Email body only.`);
        if (emailBody) {
          await sendEmail(data.customer?.email, `Refund Request Received - Order #${data.order_number}`, emailBody);
          await updateStats(shop, 'emailsSent');
        }
        break;
      }
      case 'inventory_levels/update': {
        if (!user.automations?.lowStockAlert) break;
        if (data.available <= 5) {
          await sendEmail(user.email, `⚠️ Low Stock Alert`, `Product ID ${data.inventory_item_id} has only ${data.available} units left. Time to reorder!`);
        }
        break;
      }
      case 'checkouts/create': {
        if (!user.automations?.abandonedCart) break;
        setTimeout(async () => {
          const emailBody = await callGemini(`Write abandoned cart recovery email. Customer: ${data.customer?.first_name || 'there'}. Items: ${data.line_items?.map(i=>i.title).join(', ')}. Under 80 words. Email body only.`);
          if (emailBody && data.email) {
            await sendEmail(data.email, '🛒 You left something behind!', emailBody);
            await updateStats(shop, 'emailsSent');
          }
        }, 60 * 60 * 1000);
        break;
      }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Automation error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
