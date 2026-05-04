const { MongoClient } = require('mongodb');
const axios = require('axios');

// Call Gemini AI
async function callGemini(prompt) {
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }] }
  );
  return res.data.candidates[0].content.parts[0].text;
}

// Send email via Gmail API (using fetch)
async function sendEmail(to, subject, body, accessToken) {
  if (!to || !accessToken) {
    console.log(`📧 EMAIL (no send - missing credentials):\nTO: ${to}\nSUBJECT: ${subject}\nBODY: ${body}`);
    return;
  }

  const emailContent = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body
  ].join('\n');

  const encoded = Buffer.from(emailContent).toString('base64url');

  await axios.post(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { raw: encoded },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

// Get user by shop domain
async function getUserByShop(shop) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const user = await client.db('seller-autopilot').collection('users').findOne({ 'shopify.shop': shop });
  await client.close();
  return user;
}

// Update user stats
async function updateStats(userId, field) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  await client.db('seller-autopilot').collection('users').updateOne(
    { _id: userId },
    { $inc: { [`stats.${field}`]: 1 } }
  );
  await client.close();
}

exports.handler = async (event) => {
  try {
    const shop = event.headers['x-shopify-shop-domain'];
    const topic = event.headers['x-shopify-topic'];
    
    if (!shop || !topic) {
      return { statusCode: 400, body: 'Missing headers' };
    }

    const data = JSON.parse(event.body);
    const user = await getUserByShop(shop);
    
    if (!user) {
      console.log(`No user found for shop: ${shop}`);
      return { statusCode: 200, body: 'No user found' };
    }

    // Handle different webhook topics
    switch(topic) {

      case 'orders/create': {
        if (!user.automations?.welcomeEmail) break;

        const prompt = `Write a warm, professional order confirmation email in English.
Customer name: ${data.customer?.first_name || 'Customer'} ${data.customer?.last_name || ''}
Order number: #${data.order_number}
Total: ${data.total_price} ${data.currency}
Items: ${data.line_items?.map(i => i.name).join(', ')}
Estimated delivery: 5-7 business days.
Keep it friendly, under 120 words. Start with "Hi [name]," end with "Thank you for your order!"
Return only the email body.`;

        const emailBody = await callGemini(prompt);
        
        console.log(`✅ Welcome email generated for order #${data.order_number}`);
        console.log(`TO: ${data.customer?.email}`);
        console.log(`BODY: ${emailBody}`);
        
        await updateStats(user._id, 'emailsSent');
        break;
      }

      case 'checkouts/create': {
        if (!user.automations?.abandonedCart) break;

        // Wait 1 hour then send recovery email
        setTimeout(async () => {
          const prompt = `Write a friendly abandoned cart recovery email.
Customer name: ${data.customer?.first_name || 'there'}
Items left: ${data.line_items?.map(i => i.title).join(', ')}
Cart total: ${data.total_price} ${data.currency}
Create urgency gently. Under 100 words. Return only email body.`;

          const emailBody = await callGemini(prompt);
          console.log(`✅ Abandoned cart email generated`);
          console.log(`TO: ${data.email}`);
          console.log(`BODY: ${emailBody}`);
          
          await updateStats(user._id, 'emailsSent');
        }, 60 * 60 * 1000);

        break;
      }

      case 'inventory_levels/update': {
        if (!user.automations?.lowStockAlert) break;

        const LOW_STOCK = 5;
        if (data.available <= LOW_STOCK) {
          console.log(`⚠️ LOW STOCK ALERT for ${user.email}: Product ID ${data.inventory_item_id} has only ${data.available} units left`);
        }
        break;
      }

      case 'orders/cancelled': {
        if (!user.automations?.refundAutoReply) break;

        const prompt = `Write a professional refund acknowledgment email.
Customer name: ${data.customer?.first_name || 'Customer'}
Order: #${data.order_number}
Acknowledge the request, say 3-5 business days, thank for patience.
Under 80 words. Return only email body.`;

        const emailBody = await callGemini(prompt);
        console.log(`✅ Refund reply generated for order #${data.order_number}`);
        console.log(`BODY: ${emailBody}`);
        
        await updateStats(user._id, 'emailsSent');
        break;
      }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Automation error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
