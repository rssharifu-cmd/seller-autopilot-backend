const router = require('express').Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// GET /api/automations — get current settings
router.get('/', authMiddleware, async (req, res) => {
  res.json({ automations: req.user.automations });
});

// PATCH /api/automations — toggle one automation
router.patch('/', authMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;

    const validKeys = [
      'welcomeEmail', 'lowStockAlert', 'abandonedCart', 'reviewReply',
      'weeklySalesReport', 'refundAutoReply', 'crmLog',
      'outOfStockWaitlist', 'dailyRevenueSummary', 'negativeReviewAlert'
    ];

    if (!validKeys.includes(key)) return res.status(400).json({ error: 'Invalid automation key' });

    const update = { [`automations.${key}`]: value };
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });

    res.json({ success: true, automations: user.automations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 
