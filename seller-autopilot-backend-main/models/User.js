const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  password:     { type: String, required: true },
  name:         { type: String, required: true },

  // Shopify
  shopify: {
    shop:         String,
    accessToken:  String,
    connectedAt:  Date
  },

  // Subscription
  subscription: {
    status:       { type: String, enum: ['trial', 'active', 'cancelled', 'expired'], default: 'trial' },
    plan:         { type: String, enum: ['starter', 'pro', 'agency'], default: 'starter' },
    stripeCustomerId:     String,
    stripeSubscriptionId: String,
    trialEndsAt:  { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) }
  },

  // Automation settings (on/off toggles)
  automations: {
    welcomeEmail:       { type: Boolean, default: true },
    lowStockAlert:      { type: Boolean, default: true },
    abandonedCart:      { type: Boolean, default: true },
    reviewReply:        { type: Boolean, default: true },
    weeklySalesReport:  { type: Boolean, default: true },
    refundAutoReply:    { type: Boolean, default: true },
    crmLog:             { type: Boolean, default: true },
    outOfStockWaitlist: { type: Boolean, default: false },
    dailyRevenueSummary:{ type: Boolean, default: true },
    negativeReviewAlert:{ type: Boolean, default: true }
  },

  // Stats
  stats: {
    emailsSent:        { type: Number, default: 0 },
    revenueRecovered:  { type: Number, default: 0 },
    reviewsHandled:    { type: Number, default: 0 }
  },

  createdAt: { type: Date, default: Date.now }
});

// Hash password before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.comparePassword = function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
