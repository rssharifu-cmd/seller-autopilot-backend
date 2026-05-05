const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function generateEmail(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function sendEmail({ to, subject, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'Seller Autopilot <onboarding@resend.dev>',
      to,
      subject,
      html
    })
  });
  return response.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'OK' };
  }

  try {
    const topic = event.headers['x-shopify-topic'] || '';
    const body = JSON.parse(event.body || '{}');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('seller-autopilot');

    // Find seller by shop domain
    const shopDomain = event.headers['x-shopify-shop-domain'] || '';
    const seller = await db.collection('users').findOne({ shopDomain });

    if (!seller) {
      await client.close();
      return { statusCode: 200, body: 'Seller not found' };
    }

    // NEW ORDER → Welcome Email
    if (topic === 'orders/create') {
      const order = body;
      const customerEmail = order.email;
      const customerName = order.billing_address?.first_name || 'Valued Customer';
      const storeName = order.shop_name || seller.name || 'Our Store';
      const orderNumber = order.order_number || order.name;
      const total = order.total_price;

      if (customerEmail && seller.automations?.welcomeEmail) {
        const emailContent = await generateEmail(
          `Write a warm, friendly order confirmation email for:
          - Customer name: ${customerName}
          - Store name: ${storeName}
          - Order number: ${orderNumber}
          - Total: $${total}
          Keep it under 150 words. Be warm and professional. HTML format.`
        );

        await sendEmail({
          to: customerEmail,
          subject: `Thank you for your order, ${customerName}! 🎉`,
          html: emailContent
        });

        // Update stats
        await db.collection('users').updateOne(
          { shopDomain },
          { $inc: { 'stats.emailsSent': 1, 'stats.totalOrders': 1 } }
        );
      }
    }

    // ABANDONED CART → Recovery Email
    if (topic === 'checkouts/create' && seller.automations?.abandonedCart) {
      const checkout = body;
      const customerEmail = checkout.email;
      const customerName = checkout.billing_address?.first_name || 'there';
      const cartUrl = checkout.abandoned_checkout_url;
      const storeName = seller.name || 'Our Store';

      if (customerEmail && cartUrl) {
        // Wait 1 hour logic — for now send immediately in test
        const emailContent = await generateEmail(
          `Write a friendly abandoned cart recovery email for:
          - Customer name: ${customerName}
          - Store name: ${storeName}
          - Recovery link: ${cartUrl}
          Keep it under 100 words. Include a call-to-action button. HTML format.`
        );

        await sendEmail({
          to: customerEmail,
          subject: `You left something behind, ${customerName}! 🛒`,
          html: emailContent
        });

        await db.collection('users').updateOne(
          { shopDomain },
          { $inc: { 'stats.emailsSent': 1 } }
        );
      }
    }

    // LOW STOCK ALERT → Seller Email
    if (topic === 'inventory_levels/update' && seller.automations?.lowStockAlert) {
      const inventory = body;
      const available = inventory.available;

      if (available !== null && available <= 5) {
        await sendEmail({
          to: seller.email,
          subject: `⚠️ Low Stock Alert — Only ${available} left!`,
          html: `
            <h2>Low Stock Warning</h2>
            <p>A product in your store has only <strong>${available} units</strong> remaining.</p>
            <p>Inventory Item ID: ${inventory.inventory_item_id}</p>
            <p>Location ID: ${inventory.location_id}</p>
            <p><a href="https://admin.shopify.com">Go to Shopify Admin →</a></p>
          `
        });
      }
    }

    await client.close();
    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error('Automation error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
