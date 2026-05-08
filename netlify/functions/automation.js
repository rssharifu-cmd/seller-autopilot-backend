const { MongoClient } = require('mongodb');
const axios = require('axios');

async function callGemini(prompt) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 300
        }
      }
    );
    return res.data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}

async function callGeminiSubject(prompt) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 30
        }
      }
    );
    return res.data.candidates[0].content.parts[0].text.trim();
  } catch (err) {
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
      {
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
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

    switch (topic) {

      // ✅ 1. Order Confirmation — warm, celebratory
      case 'orders/create': {
        if (!user.automations?.welcomeEmail) break;

        const customerName = data.customer?.first_name || 'Friend';
        const orderNumber = data.order_number;
        const total = `${data.total_price} ${data.currency}`;
        const items = data.line_items?.map(i => i.title).join(', ') || 'your items';

        const bodyPrompt = `
You are a friendly, warm email copywriter for an online store.
Write an order confirmation email for a customer who just placed an order.

Details:
- Customer first name: ${customerName}
- Order number: #${orderNumber}
- Items ordered: ${items}
- Total paid: ${total}

Your job:
- Make them feel EXCITED and HAPPY about their purchase
- Be conversational, warm, human — NOT corporate or robotic
- Use 1-2 relevant emojis naturally in the text
- Mention the specific items they bought to make it feel personal
- Add a fun line like "great choice!" or "you're going to love it"
- End with a friendly sign-off
- 80-120 words max
- Write ONLY the email body, no subject line, no "Dear" salutation header
`;

        const subjectPrompt = `
Write a short, catchy email subject line for an order confirmation email.
Customer name: ${customerName}, Order: #${orderNumber}, Items: ${items}
Make it feel exciting, not boring. Under 10 words. No quotes. Just the subject line text.
`;

        const [emailBody, emailSubject] = await Promise.all([
          callGemini(bodyPrompt),
          callGeminiSubject(subjectPrompt)
        ]);

        if (emailBody && data.customer?.email) {
          await sendEmail(
            data.customer.email,
            emailSubject || `✅ Order #${orderNumber} Confirmed!`,
            emailBody
          );
          await updateStats(shop, 'emailsSent');
        }
        break;
      }

      // ✅ 2. Abandoned Cart Recovery — persuasive, FOMO-driven
      case 'checkouts/create': {
        if (!user.automations?.abandonedCart) break;

        const customerName = data.customer?.first_name || 'there';
        const items = data.line_items?.map(i => i.title).join(', ') || 'some items';
        const cartTotal = data.total_price ? `${data.total_price} ${data.currency}` : '';
        const cartUrl = data.abandoned_checkout_url || '';

        const bodyPrompt = `
You are a persuasive, friendly email copywriter for an online store.
Write an abandoned cart recovery email for a customer who left without completing their purchase.

Details:
- Customer first name: ${customerName}
- Items left in cart: ${items}
${cartTotal ? `- Cart total: ${cartTotal}` : ''}
${cartUrl ? `- Recovery link (include this naturally): ${cartUrl}` : ''}

Your job:
- Open with something attention-grabbing — NOT boring "you left your cart"
- Create a gentle sense of FOMO — maybe stock is limited, or they deserve it
- Be friendly and human, like a helpful store assistant talking to a friend
- Mention the specific items by name
- If there's a recovery link, include it as a natural call-to-action
- Use 1-2 emojis naturally, don't overdo it
- 80-100 words max
- Write ONLY the email body, no subject line
`;

        const subjectPrompt = `
Write a catchy email subject line for an abandoned cart recovery email.
Customer name: ${customerName}, Items left: ${items}
Create curiosity or gentle urgency. Under 10 words. No quotes. Just the text.
`;

        const recipientEmail = data.email || data.customer?.email;
        if (!recipientEmail) break;

        const [emailBody, emailSubject] = await Promise.all([
          callGemini(bodyPrompt),
          callGeminiSubject(subjectPrompt)
        ]);

        if (emailBody) {
          await sendEmail(
            recipientEmail,
            emailSubject || `🛒 Hey ${customerName}, you forgot something!`,
            emailBody
          );
          await updateStats(shop, 'emailsSent');
        }
        break;
      }

      // ✅ 3. Order Cancellation — empathetic, win-back offer
      case 'orders/cancelled': {
        if (!user.automations?.refundAutoReply) break;

        const customerName = data.customer?.first_name || 'Friend';
        const orderNumber = data.order_number;
        const cancelReason = data.cancel_reason || 'unknown';
        const items = data.line_items?.map(i => i.title).join(', ') || 'your items';

        const bodyPrompt = `
You are an empathetic, professional email copywriter for an online store.
Write an order cancellation email that makes the customer feel valued despite the cancellation.

Details:
- Customer first name: ${customerName}
- Cancelled order number: #${orderNumber}
- Items that were ordered: ${items}
- Cancellation reason: ${cancelReason}

Your job:
- Acknowledge the cancellation calmly and with genuine empathy
- Make them feel heard and respected — NOT like a support ticket
- Offer a 10% discount code "COMEBACK10" as a goodwill gesture for their next order
- Invite them to come back warmly
- Tone: warm and human, NOT cold, defensive, or corporate
- 1 emoji max
- 80-100 words max
- Write ONLY the email body, no subject line
`;

        const subjectPrompt = `
Write a subject line for an order cancellation email.
Customer: ${customerName}, Order: #${orderNumber}
Be empathetic and calm, not alarming. Under 10 words. No quotes. Just the text.
`;

        const [emailBody, emailSubject] = await Promise.all([
          callGemini(bodyPrompt),
          callGeminiSubject(subjectPrompt)
        ]);

        if (emailBody && data.customer?.email) {
          await sendEmail(
            data.customer.email,
            emailSubject || `About Your Order #${orderNumber}`,
            emailBody
          );
          await updateStats(shop, 'emailsSent');
        }
        break;
      }

      // ✅ 4. Low Stock Alert — urgent, actionable (sent to SELLER)
      case 'inventory_levels/update': {
        if (!user.automations?.lowStockAlert) break;
        if (data.available > 5) break;

        const sellerName = user.name || 'there';
        const stockLeft = data.available;
        const productId = data.inventory_item_id;

        const bodyPrompt = `
You are a smart business assistant writing an urgent inventory alert to a Shopify store owner.

Details:
- Store owner name: ${sellerName}
- Product inventory ID: ${productId}
- Units remaining: ${stockLeft}

Your job:
- Alert them clearly that stock is critically low
- Be direct and actionable — tell them to reorder NOW
- Add urgency: every hour they wait, they might lose sales
- Keep it short and punchy: 60-80 words
- Use 1-2 emojis
- Write ONLY the email body, no subject line
`;

        const subjectPrompt = `
Write an urgent subject line for a low stock inventory alert to a store owner.
Only ${stockLeft} units left. Under 10 words. No quotes.
`;

        const [emailBody, emailSubject] = await Promise.all([
          callGemini(bodyPrompt),
          callGeminiSubject(subjectPrompt)
        ]);

        await sendEmail(
          user.email,
          emailSubject || `⚠️ Low Stock — Only ${stockLeft} Units Left!`,
          emailBody || `Hi ${sellerName}, product ${productId} has only ${stockLeft} units left. Reorder now!`
        );
        break;
      }

      // ✅ 5. Cart Update — gentle, friendly nudge
      case 'carts/update': {
        if (!user.automations?.abandonedCart) break;

        const customerName = data.customer?.first_name || 'there';
        const items = data.line_items?.map(i => i.title).join(', ') || 'some great items';

        const bodyPrompt = `
You are a friendly, witty email copywriter for an online store.
Write a gentle cart reminder email — the customer updated their cart but hasn't bought yet.

Details:
- Customer name: ${customerName}
- Items in cart: ${items}

Your job:
- Be light, fun, and non-pushy — just a friendly nudge
- Maybe add a tiny bit of humor or warmth to make them smile
- Mention what's in their cart
- 50-70 words max
- 1 emoji max
- Write ONLY the email body, no subject line
`;

        const subjectPrompt = `
Write a light, friendly subject line for a cart reminder email.
Customer: ${customerName}, items: ${items}. Non-pushy, a little playful. Under 8 words. No quotes.
`;

        const recipientEmail = data.email || data.customer?.email;
        if (!recipientEmail) break;

        const [emailBody, emailSubject] = await Promise.all([
          callGemini(bodyPrompt),
          callGeminiSubject(subjectPrompt)
        ]);

        if (emailBody) {
          await sendEmail(
            recipientEmail,
            emailSubject || `🛍️ Still thinking it over, ${customerName}?`,
            emailBody
          );
          await updateStats(shop, 'emailsSent');
        }
        break;
      }

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Automation error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
