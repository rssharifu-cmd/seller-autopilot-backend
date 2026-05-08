const { MongoClient } = require('mongodb');
const axios = require('axios');

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const topic = event.headers['x-shopify-topic'] || '';
    const shop = event.headers['x-shopify-shop-domain'] || '';

    console.log('Webhook received:', topic, 'from:', shop);

    if (!topic) {
      return { statusCode: 200, body: 'OK' };
    }

    // Get shop access token from MongoDB
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('seller-autopilot');
    const shopData = await db.collection('shops').findOne({ shop });
    await client.close();

    const customerEmail = body.email || body.customer?.email || '';
    const customerName = body.customer?.first_name || 'there';
    const orderNumber = body.order_number || body.name || '';
    const totalPrice = body.total_price || '0';

    let emailContent = '';
    let subject = '';

    if (topic === 'orders/create' || topic === 'orders/paid') {
      subject = `Thank you for your order! 🎉`;
      emailContent = `
        <h2>Hi ${customerName}!</h2>
        <p>Thank you for your order ${orderNumber ? '#' + orderNumber : ''}.</p>
        <p>Your order of <strong>$${totalPrice}</strong> has been received and is being processed.</p>
        <p>We'll notify you when it ships!</p>
        <br>
        <p>Thanks for shopping with us! 🛍️</p>
      `;
    } else if (topic === 'checkouts/create') {
      subject = `You left something behind! 🛒`;
      emailContent = `
        <h2>Hi ${customerName}!</h2>
        <p>You left some items in your cart.</p>
        <p>Come back and complete your purchase!</p>
        <a href="${body.abandoned_checkout_url || '#'}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">Complete Purchase</a>
      `;
    } else if (topic === 'inventory_levels/update') {
      console.log('Inventory update:', body);
      return { statusCode: 200, body: 'Inventory logged' };
    }

    // Send email via Resend
    if (customerEmail && emailContent) {
      const resendResponse = await axios.post('https://api.resend.com/emails', {
        from: 'onboarding@resend.dev',
        to: customerEmail,
        subject: subject,
        html: emailContent
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Email sent:', resendResponse.data);

      // Update stats in MongoDB
      const statsClient = new MongoClient(process.env.MONGODB_URI);
      await statsClient.connect();
      const statsDb = statsClient.db('seller-autopilot');
      await statsDb.collection('shops').updateOne(
        { shop },
        { $inc: { emailsSent: 1 } }
      );
      await statsClient.close();
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Automation error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
