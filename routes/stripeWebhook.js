const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

// POST /webhooks/stripe
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;

  switch (event.type) {

    case 'checkout.session.completed':
      await User.findByIdAndUpdate(session.metadata.userId, {
        'subscription.status': 'active',
        'subscription.plan': 'pro',
        'subscription.stripeSubscriptionId': session.subscription
      });
      console.log('✅ Subscription activated');
      break;

    case 'invoice.payment_failed':
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      await User.findOneAndUpdate(
        { 'subscription.stripeSubscriptionId': session.subscription },
        { 'subscription.status': 'expired' }
      );
      console.log('❌ Payment failed — subscription expired');
      break;

    case 'customer.subscription.deleted':
      await User.findOneAndUpdate(
        { 'subscription.stripeSubscriptionId': session.id },
        { 'subscription.status': 'cancelled' }
      );
      console.log('❌ Subscription cancelled');
      break;
  }

  res.sendStatus(200);
});

module.exports = router;
