const router = require('express').Router();
const crypto = require('crypto');
const User = require('../models/User');
const gemini = require('../services/gemini');
const axios = require('axios');

// Verify Shopify webhook signature
function verifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(req.body)
    .digest('base64');
  return hmac === hash;
}

// Find user by shop domain
async function getUserByShop(shop) {
  return await User.findOne({ 'shopify.shop': shop });
}

// Send email via Gmail API (simple version)
async function sendEmail(to, subject, body) {
  // For now, log it — connect Gmail API later
  console.log(`📧 EMAIL TO: ${to}\nSUBJECT: ${subject}\nBODY: ${body}\n`);
  // TODO: integrate nodemailer or SendGrid
}

// ─── NEW ORDER ────────────────────────────────────────
router.post('/order-created', async (req, res) => {
  res.sendStatus(200); // Respond fast to Shopify

  try {
    if (!verifyWebhook(req)) return;
    const shop = req.headers['x-shopify-shop-domain'];
    const order = JSON.parse(req.body);
    const user = await getUserByShop(shop);
    if (!user || !user.automations.welcomeEmail) return;

    // Generate AI welcome email
    const emailBody = await gemini.generateWelcomeEmail(order);

    // Send to customer
    await sendEmail(
      order.customer?.email,
      `Order #${order.order_number} Confirmed! 🎉`,
      emailBody
    );

    // Update stats
    await User.findByIdAndUpdate(user._id, { $inc: { 'stats.emailsSent': 1 } });
    console.log(`✅ Welcome email sent for order #${order.order_number}`);
  } catch (err) {
    console.error('Order webhook error:', err.message);
  }
});

// ─── ABANDONED CART ───────────────────────────────────
router.post('/checkout-created', async (req, res) => {
  res.sendStatus(200);

  try {
    if (!verifyWebhook(req)) return;
    const shop = req.headers['x-shopify-shop-domain'];
    const checkout = JSON.parse(req.body);
    const user = await getUserByShop(shop);
    if (!user || !user.automations.abandonedCart) return;

    // Wait 1 hour then send recovery email
    setTimeout(async () => {
      try {
        const emailBody = await gemini.generateAbandonedCartEmail(checkout);
        await sendEmail(
          checkout.email,
          '😮 You left something behind!',
          emailBody
        );
        await User.findByIdAndUpdate(user._id, { $inc: { 'stats.emailsSent': 1 } });
        console.log(`✅ Abandoned cart email sent`);
      } catch (e) {
        console.error('Abandoned cart email error:', e.message);
      }
    }, 60 * 60 * 1000); // 1 hour

  } catch (err) {
    console.error('Checkout webhook error:', err.message);
  }
});

// ─── INVENTORY UPDATE ─────────────────────────────────
router.post('/inventory-update', async (req, res) => {
  res.sendStatus(200);

  try {
    if (!verifyWebhook(req)) return;
    const shop = req.headers['x-shopify-shop-domain'];
    const inventory = JSON.parse(req.body);
    const user = await getUserByShop(shop);
    if (!user || !user.automations.lowStockAlert) return;

    const LOW_STOCK_THRESHOLD = 5;
    if (inventory.available <= LOW_STOCK_THRESHOLD) {
      await sendEmail(
        user.email,
        `⚠️ Low Stock Alert — Only ${inventory.available} left!`,
        `Your product (ID: ${inventory.inventory_item_id}) is running low.\nOnly ${inventory.available} units remaining.\nTime to reorder!`
      );
      console.log(`✅ Low stock alert sent`);
    }
  } catch (err) {
    console.error('Inventory webhook error:', err.message);
  }
});

// ─── ORDER CANCELLED (Refund) ─────────────────────────
router.post('/order-cancelled', async (req, res) => {
  res.sendStatus(200);

  try {
    if (!verifyWebhook(req)) return;
    const shop = req.headers['x-shopify-shop-domain'];
    const order = JSON.parse(req.body);
    const user = await getUserByShop(shop);
    if (!user || !user.automations.refundAutoReply) return;

    const emailBody = await gemini.generateRefundReply(order);
    await sendEmail(
      order.customer?.email,
      `Your refund request for Order #${order.order_number}`,
      emailBody
    );
    await User.findByIdAndUpdate(user._id, { $inc: { 'stats.emailsSent': 1 } });
    console.log(`✅ Refund reply sent for order #${order.order_number}`);
  } catch (err) {
    console.error('Refund webhook error:', err.message);
  }
});

module.exports = router;
