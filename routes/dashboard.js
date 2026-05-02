const router = require('express').Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// GET /api/dashboard
router.get('/', authMiddleware, async (req, res) => {
  const user = req.user;

  res.json({
    user: {
      name: user.name,
      email: user.email,
      shopify: user.shopify,
      subscription: user.subscription
    },
    stats: user.stats,
    automations: user.automations
  });
});

module.exports = router;
